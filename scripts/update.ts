/**
 * Credits:
 *
 * - @molt/core - MIT License
 *     Copyright (c) 2023 Chiezo
 *     https://github.com/hasundue/molt/blob/main/LICENSE
 */

import {
  $,
  as,
  assertExists,
  createGraph,
  type DependencyJson,
  ensure,
  filterEntries,
  fromFileUrl,
  is,
  loadGraph,
  parseArgs,
  parseFromJson,
  resolve,
  type ResolvedDependency,
  SemVer,
  toFileUrl,
} from '../dev_deps.ts'

// #region Vendored constants

const supportedProtocols = ['npm:', 'jsr:', 'http:', 'https:'] as const

const isNpmPackageMeta = is.ObjectOf({ 'dist-tags': is.ObjectOf({ latest: is.String }) })

const isJsrPackageMeta = is.ObjectOf({
  versions: is.RecordOf(is.ObjectOf({ yanked: as.Optional(is.Boolean) }), is.String),
})

// #endregion

const args = parseArgs(Deno.args, { collect: ['x'] })
const excludes = (args.x ?? []) as string[]

// update deps in deno.json

let importMap = await Deno.readTextFile('deno.json')
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

const resolvedImportMap = await parseFromJson(toFileUrl(resolve('deno.json')), importMap, { expandImports: true })

const graph = await createGraph(files, {
  resolve: resolvedImportMap.resolve.bind(resolvedImportMap),
  load: async (specifier) => files.includes(specifier) ? await loadGraph(specifier) : undefined,
})

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
  const text = new TextDecoder().decode(file)
  const lines = text.split('\n')

  async function updateLine(dep?: ResolvedDependency) {
    if (!dep?.specifier) return

    const start = dep.span.start.line
    const startChar = dep.span.start.character + 1
    const end = dep.span.end.line
    const endChar = dep.span.end.character - 1

    if (start !== end) {
      console.log(`Span is multiline, skipping update for ${dep.specifier} in ${path}`)
      return
    }

    const newSpecifier = await updateSpecifier(dep.specifier)
    if (newSpecifier === dep.specifier) return

    const newLine = lines[start]!.slice(0, startChar) + newSpecifier + lines[start]!.slice(endChar)
    lines[start] = newLine
  }

  for (const dep of deps) {
    await updateLine(dep.code)
    await updateLine(dep.type)
  }

  await Deno.writeTextFile(path, lines.join('\n'))
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

  const resolved = await resolveLatestVersion(parsed, { allowPreRelease: isPreRelease(parsed.version!) })
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
async function resolveLatestVersion(
  dependency: Dependency,
  options?: { allowPreRelease?: boolean },
): Promise<UpdatedDependency | undefined> {
  const constraint = dependency.version ? SemVer.tryParseRange(dependency.version) : undefined
  if (constraint && constraint.flat().length > 1) return
  return await _resolveLatestVersion(dependency, options)
}

async function _resolveLatestVersion(
  dependency: Dependency,
  options?: { allowPreRelease?: boolean },
): Promise<UpdatedDependency | undefined> {
  function _isPreRelease(version: string | SemVer.SemVer): boolean {
    if (options?.allowPreRelease) return false
    return isPreRelease(version)
  }
  switch (dependency.protocol) {
    case 'npm:': {
      const response = await fetch(`https://registry.npmjs.org/${dependency.name}`)
      if (!response.ok) break
      const pkg = ensure(await response.json(), isNpmPackageMeta, {
        message: `Invalid response from NPM registry: ${response.url}`,
      })
      const latest = pkg['dist-tags'].latest
      if (_isPreRelease(latest)) break
      return { ...dependency, version: latest }
    }
    case 'jsr:': {
      const response = await fetch(`https://jsr.io/${dependency.name}/meta.json`)
      if (!response.ok) break
      const meta = ensure(await response.json(), isJsrPackageMeta, {
        message: `Invalid response from JSR registry: ${response.url}`,
      })
      const candidates = filterEntries(meta.versions, ([version, { yanked }]) => !yanked && !_isPreRelease(version))
      const semvers = Object.keys(candidates).map(SemVer.parse)
      if (!semvers.length) break
      const latest = SemVer.format(semvers.sort(SemVer.compare).reverse()[0]!)
      if (_isPreRelease(latest)) break
      return { ...dependency, version: latest }
    }
    case 'http:':
    case 'https:': {
      if (isGithub(dependency)) {
        const response = await fetch(`https://api.github.com/repos/${dependency.name.slice(26)}/tags`)
        if (!response.ok) break
        const tags = await response.json()
        if (!Array.isArray(tags) || tags.length === 0) break
        const versions = tags.map((tag) => SemVer.tryParse(tag.name)).filter((version): version is SemVer.SemVer =>
          !!version && !_isPreRelease(version)
        )
        if (versions.length === 0) break
        const latest = versions.sort(SemVer.compare).reverse()[0]
        if (!latest) break
        return { ...dependency, version: 'v' + SemVer.format(latest) }
      }
      const response = await fetch(
        addSeparator(dependency.protocol) + dependency.name + dependency.path,
        { method: 'HEAD' },
      )
      await response.arrayBuffer()
      if (!response.redirected) break
      const redirected = parseDependency(response.url)
      if (!redirected.version || _isPreRelease(redirected.version)) break
      const latest = redirected as UpdatedDependency
      return { ...latest, path: dependency.path === '/' ? '/' : latest.path }
    }
  }
  return
}

/**
 * Check if the given version string represents a pre-release.
 *
 * @example
 * ```ts
 * isPreRelease("0.1.0"); // -> false
 * isPreRelease("0.1.0-alpha.1"); // -> true
 * ```
 */
function isPreRelease(version: string | SemVer.SemVer): boolean {
  const parsed = typeof version === 'string' ? SemVer.tryParse(version) : version
  return parsed !== undefined && parsed.prerelease !== undefined && parsed.prerelease.length > 0
}

function isGithub(dependency: Dependency): boolean {
  return dependency.name.startsWith('raw.githubusercontent.com/')
}

// #endregion

/**
 * TODO:
 * - remove vendored code when https://github.com/hasundue/molt/issues/194 and https://github.com/hasundue/molt/issues/195 are resolved
 */
