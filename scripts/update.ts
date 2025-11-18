/**
 * Credits:
 *
 * - @molt/core - MIT License
 *     Copyright (c) 2023 Chiezo
 *     https://github.com/hasundue/molt/blob/main/LICENSE
 */

import {
  $,
  assertExists,
  createCache,
  createGraph,
  type DependencyJson,
  fromFileUrl,
  parseArgs,
  parseFromJson,
  resolve,
  SemVer,
  toFileUrl,
  z,
} from '../dev_deps.ts'

// #region Vendored constants

const supportedProtocols = ['npm:', 'jsr:', 'http:', 'https:'] as const

const isNpmPackageMeta = z.object({
  'dist-tags': z.record(z.string(), z.string()),
  'versions': z.record(z.string(), z.object({})),
})

const isJsrPackageMeta = z.object({
  'latest': z.string().nullable(),
  'versions': z.record(z.string(), z.object({ yanked: z.boolean().optional() })),
})

const isGhPackageMeta = z.array(z.object({ name: z.string() }))

// #endregion

const args = parseArgs(Deno.args, { collect: ['x'] })
const excludes = (args.x ?? []) as string[]

// update deps in deno.json

const importMapUrl = toFileUrl(resolve('deno.json'))
let importMap = await Deno.readTextFile(importMapUrl)
const denoJson = JSON.parse(importMap) as { imports: Record<string, string> | undefined }

denoJson.imports = Object.fromEntries(
  await Promise.all(
    Object.entries(denoJson.imports ?? {}).map(async ([key, value]) => [key, await updateSpecifier(value)]),
  ),
)

await Deno.writeTextFile('deno.json', importMap = JSON.stringify(denoJson, null, 2))
await $`deno fmt deno.json`

// update deps in files

const files = (await $`git ls-files -- '*.ts'`.lines()).filter(Boolean).map((file) => toFileUrl(resolve(file)).href)
const resolvedImportMap = parseFromJson(importMapUrl, importMap, { expandImports: true })
const graph = await createGraph(files, { ...createCache(), resolve: resolvedImportMap.resolve.bind(resolvedImportMap) })

await Promise.all(graph.modules.map((mod) => updateDepsInFile(mod.specifier, mod.dependencies)))

// regenerate lock file

try {
  await Deno.remove('deno.lock')
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) console.error(e)
}

await $`deno install --lock=deno.lock -e ${files.map((name) => $.escapeArg(name)).join(' ')}`
await $`deno install` // install deps in deno.json/package.json

// #region Update logic

async function updateDepsInFile(url: string, deps?: DependencyJson[]) {
  if (!files.includes(url) || !deps?.length) return
  const path = fromFileUrl(url)

  const file = await Deno.readFile(path)
  let text = new TextDecoder().decode(file)

  await Promise.all(deps.map(async (dep) => {
    const newSpecifier = await updateSpecifier(dep.specifier)
    if (newSpecifier === dep.specifier) return
    text = text.replaceAll(dep.specifier, newSpecifier)
  }))

  await Deno.writeTextFile(path, text)
}

async function updateSpecifier(specifier: string) {
  if (!supportedProtocols.some((protocol) => specifier.startsWith(protocol))) return specifier

  const parsed = parseDependency(specifier)
  if (!parsed.version || excludes.includes(parsed.name)) return specifier

  let rangeSpecifier: string | undefined = undefined
  if (parsed.version && /^[~^]/.test(parsed.version)) {
    rangeSpecifier = parsed.version[0]
    parsed.version = parsed.version.slice(1)
  }

  const resolved = await resolveLatestVersion(parsed)
  if (!resolved) {
    console.log(`Could not resolve latest version for ${specifier}`)
    return specifier
  }

  resolved.version = `${rangeSpecifier || ''}${resolved.version}`
  return stringifyDependency(resolved)
}

// #endregion

// #region Vendored functions

/**
 * Properties of a dependency parsed from an import specifier.
 */
interface Dependency {
  /**
   * The URL protocol of the dependency.
   * @example
   * ```ts
   * const { protocol } = Dependency.parse(
   *   new URL("https://deno.land/std/fs/mod.ts")
   * );
   * // -> "https:"
   */
  protocol: string
  /**
   * The name of the dependency.
   * @example
   * ```ts
   * const { name } = Dependency.parse(
   *   new URL("https://deno.land/std@0.205.0/fs/mod.ts")
   * );
   * // -> "deno.land/std"
   * ```
   */
  name: string
  /**
   * The version string of the dependency.
   * @example
   * ```ts
   * const { version } = Dependency.parse(
   *   new URL("https://deno.land/std@0.205.0/fs/mod.ts")
   * );
   * // -> "0.205.0"
   * ```
   */
  version?: string
  /**
   * The subpath of the dependency.
   * @example
   * ```ts
   * const { path } = Dependency.parse(
   *   new URL("https://deno.land/std@0.205.0/fs/mod.ts")
   * );
   * // -> "/fs/mod.ts"
   *
   * const { path } = Dependency.parse(
   *   new URL("npm:node-emoji@2.0.0")
   * );
   * // -> ""
   * ```
   */
  path: string
}

/**
 * Properties of a dependency parsed from an updated import specifier.
 * The `version` property is guaranteed to be present.
 */
interface UpdatedDependency extends Dependency {
  version: string
}

/**
 * Parse properties of a dependency from the given URL.
 * @example
 * ```ts
 * const { name, version, path } = Dependency.parse(
 *   new URL("https://deno.land/std@0.200.0/fs/mod.ts")
 * );
 * // -> { name: "deno.land/std", version: "0.200.0", path: "/fs/mod.ts" }
 * ```
 */
function parseDependency(url: string | URL): Dependency {
  url = new URL(url)
  const protocol = url.protocol
  const body = url.hostname + url.pathname

  // First attempt: standard @version format
  const matched = body.match(/^(?<name>.+)@(?<version>[^/]+)(?<path>\/.*)?$/)
  if (matched) {
    assertExists(matched.groups)
    const { name, version } = matched.groups
    const path = matched.groups.path ?? ''
    return { protocol, name: name!, version, path }
  }

  // Second attempt: GitHub-style versioning in path
  const githubMatch = body.match(/^(?<name>(?:[^/]+\/)+[^/]+)\/(?<version>v?\d+\.\d+\.\d+)(?<path>\/.*)?$/)
  if (githubMatch) {
    assertExists(githubMatch.groups)
    const { name, version } = githubMatch.groups
    const path = githubMatch.groups.path ?? ''
    return { protocol, name: name!, version, path }
  }

  return { protocol, name: body, path: '' }
}

/**
 * Convert the given protocol to a URL scheme.
 */
function addSeparator(protocol: string): string {
  switch (protocol) {
    case 'file:':
    case 'http:':
    case 'https:':
      return protocol + '//'
    default:
      return protocol
  }
}

/**
 * Convert the given dependency to a URL string.
 * @example
 * ```ts
 * const uri = toURL({
 *   protocol: "https:",
 *   name: "deno.land/std",
 *   version: "1.0.0",
 *   path: "/fs/mod.ts",
 * });
 * // -> "https://deno.land/std@1.0.0/fs/mod.ts"
 * ```
 */
function stringifyDependency(
  dependency: Dependency,
  include: { protocol?: boolean; version?: boolean; path?: boolean } = {},
): string {
  include = { protocol: true, version: true, path: true, ...include }

  const header = include.protocol ? addSeparator(dependency.protocol) : ''
  const version = include.version
    ? (dependency.version ? (isGithub(dependency) ? '/' : '@') + dependency.version : '')
    : ''
  const path = include.path ? dependency.path : ''

  return `${header}${dependency.name}${version}` + path
}

/**
 * Resolve the latest version of the given dependency.
 *
 * @returns The latest version of the given dependency, or `undefined` if the
 * latest version of dependency is unable to resolve.
 *
 * @throws An error if the dependency is not found in the registry.
 *
 * @example
 * ```ts
 * await resolveLatestVersion(
 *   Dependency.parse(new URL("https://deno.land/std@0.200.0/fs/mod.ts"))
 * );
 * // -> { name: "deno.land/std", version: "0.207.0", path: "/fs/mod.ts" }
 * ```
 */
function resolveLatestVersion(dependency: Dependency): Promise<UpdatedDependency | undefined> {
  const constraint = dependency.version ? SemVer.tryParseRange(dependency.version) : undefined
  if (constraint && constraint.flat().length > 1) return Promise.resolve(undefined)
  return _resolveLatestVersion(dependency)
}

async function _resolveLatestVersion(dependency: Dependency): Promise<UpdatedDependency | undefined> {
  switch (dependency.protocol) {
    case 'npm:': {
      const response = await fetch(`https://registry.npmjs.org/${dependency.name}`)
      if (!response.ok) break
      const pkg = isNpmPackageMeta.parse(await response.json())
      const latestVersion = getLatestVersion(
        Object.keys(pkg.versions),
        dependency.version,
        pkg['dist-tags'],
      )
      if (!latestVersion) break
      return { ...dependency, version: latestVersion }
    }

    case 'jsr:': {
      const response = await fetch(`https://jsr.io/${dependency.name}/meta.json`)
      if (!response.ok) break
      const meta = isJsrPackageMeta.parse(await response.json())
      const latestVersion = getLatestVersion(
        Object.entries(meta.versions).filter(([_, { yanked }]) => !yanked).map(([version]) => version),
        dependency.version,
        meta.latest ? { latest: meta.latest } : {},
      )
      if (!latestVersion) break
      return { ...dependency, version: latestVersion }
    }

    case 'http:':
    case 'https:': {
      if (isGithub(dependency)) {
        const response = await fetch(`https://api.github.com/repos/${dependency.name.slice(26)}/tags`)
        if (!response.ok) break
        const tags = isGhPackageMeta.parse(await response.json())
        const hasVPrefix = !!tags[0]?.name.startsWith('v')
        const latestVersion = getLatestVersion(
          tags.map((tag) => tag.name.slice(hasVPrefix ? 1 : 0)),
          dependency.version?.slice(hasVPrefix ? 1 : 0),
          {},
        )
        if (!latestVersion) break
        return { ...dependency, version: (hasVPrefix ? 'v' : '') + latestVersion }
      }

      const response = await fetch(
        addSeparator(dependency.protocol) + dependency.name,
        { method: 'GET' },
      )
      await response.arrayBuffer()
      if (!response.redirected) break
      const redirected = parseDependency(response.url + dependency.path)
      if (!redirected.version) break
      const latest = redirected as UpdatedDependency
      return { ...latest, path: dependency.path === '/' ? '/' : latest.path }
    }
  }
  return
}

export function getLatestVersion(
  _versions: string[],
  currentVersion: string | undefined,
  distTags: Record<string, string>,
): string | undefined {
  if (_versions.length === 0) return

  const versions = _versions.map((v) => SemVer.parse(v)).sort(SemVer.compare).reverse()
  const latest = distTags.latest ? SemVer.parse(distTags.latest) : versions[0]!

  const current = currentVersion ? SemVer.parse(currentVersion) : latest
  if (SemVer.compare(latest, current) >= 0) return SemVer.format(latest)

  const range = SemVer.parseRange('^' + currentVersion)
  for (const version of versions) {
    if (SemVer.satisfies(version, range) && SemVer.compare(version, current) >= 0) {
      return SemVer.format(version)
    }
  }

  return
}

function isGithub(dependency: Dependency): boolean {
  return dependency.name.startsWith('raw.githubusercontent.com/')
}

// #endregion

/**
 * TODO:
 * - remove vendored code when https://github.com/hasundue/molt/issues/194 and https://github.com/hasundue/molt/issues/195 are resolved
 * - use dep.code.span / dep.type.span to update lines instead of replaceAll when https://github.com/denoland/deno_graph/issues/80 is fixed
 */
