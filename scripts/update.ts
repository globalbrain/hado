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
  createGraph,
  type DependencyJson,
  ensure,
  filterEntries,
  fromFileUrl,
  is,
  loadGraph,
  Mutex,
  parseFromJson,
  resolve,
  type ResolvedDependency,
  SemVer,
  toFileUrl,
} from '../dev_deps.ts'

// #region Vendored constants

const supportedProtocols = ['npm:', 'jsr:', 'http:', 'https:'] as const

class LatestVersionCache implements Disposable {
  static #mutex = new Map<string, Mutex>()
  static #cache = new Map<string, UpdatedDependency | null>()

  constructor(readonly name: string) {
    const mutex = LatestVersionCache.#mutex.get(name) ?? LatestVersionCache.#mutex.set(name, new Mutex()).get(name)!
    mutex.acquire()
  }

  get(name: string): UpdatedDependency | null | undefined {
    return LatestVersionCache.#cache.get(name)
  }

  set<T extends UpdatedDependency | null>(name: string, dependency: T): void {
    LatestVersionCache.#cache.set(name, dependency)
  }

  [Symbol.dispose]() {
    const mutex = LatestVersionCache.#mutex.get(this.name)
    assertExists(mutex)
    mutex.release()
  }
}

const isNpmPackageMeta = is.ObjectOf({ 'dist-tags': is.ObjectOf({ latest: is.String }) })

const isJsrPackageMeta = is.ObjectOf({
  versions: is.RecordOf(is.ObjectOf({ yanked: is.OptionalOf(is.Boolean) }), is.String),
})

// #endregion

// update dependencies in files

const files = (await $`git ls-files -- '*.ts'`.text())
  .split('\n')
  .filter(Boolean)
  .map((file) => toFileUrl(resolve(file)).href)

const importMap = await Deno.readTextFile('deno.json')
const resolvedImportMap = await parseFromJson(toFileUrl(resolve('deno.json')), importMap, { expandImports: true })

const graph = await createGraph(files, {
  resolve: resolvedImportMap.resolve.bind(resolvedImportMap),
  // deno-lint-ignore require-await
  load: async (specifier) => {
    return files.includes(specifier) ? loadGraph(specifier) : undefined
  },
})

const modules = graph.modules
  .filter(({ specifier }) => files.includes(specifier))
  .map((mod) => ({
    specifier: mod.specifier,
    dependencies: (mod.dependencies ?? []).filter((dep) =>
      // deno-lint-ignore no-explicit-any
      supportedProtocols.includes(URL.parse(dep.specifier)?.protocol as any)
    ),
  }))
  .filter((mod) => mod.dependencies.length)

for (const mod of modules) {
  updateDepsInFile(fromFileUrl(mod.specifier), mod.dependencies)
}

// update deps in deno.json

const denoJson = JSON.parse(importMap) as { imports: Record<string, string> | undefined }
const newImports = { ...denoJson.imports }

for (const [key, value] of Object.entries(denoJson.imports ?? {})) {
  newImports[key] = await updateSpecifier(value)
}

denoJson.imports = newImports

await Deno.writeTextFile('deno.json', JSON.stringify(denoJson, null, 2))
await $`deno fmt deno.json`

// regenerate lock file

try {
  await Deno.remove('deno.lock')
} catch (e) {
  if (e instanceof Deno.errors.NotFound) {
    // ignore
  } else {
    console.error(e)
  }
}

await $`deno cache --reload --lock=deno.lock ${files.join(' ')}`

// #region Update logic

async function updateDepsInFile(path: string, deps: DependencyJson[]) {
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
    } else {
      const newSpecifier = await updateSpecifier(dep.specifier)
      const newLine = lines[start]!.slice(0, startChar) + newSpecifier + lines[start]!.slice(endChar)
      lines[start] = newLine
    }
  }

  for (const dep of deps) {
    await updateLine(dep.code)
    await updateLine(dep.type)
  }

  await Deno.writeTextFile(path, lines.join('\n'))
}

async function updateSpecifier(specifier: string) {
  const parsed = parseDependency(specifier)
  let rangeSpecifier: string | undefined = undefined

  if (parsed.version && /^[~^]/.test(parsed.version)) {
    rangeSpecifier = parsed.version[0]
    parsed.version = parsed.version.slice(1)
  }

  const resolved = await resolveLatestVersion(parsed, { cache: true, allowPreRelease: isPreRelease(parsed.version!) })
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

  const matched = body.match(/^(?<name>.+)@(?<version>[^/]+)(?<path>\/.*)?$/)

  if (matched) {
    assertExists(matched.groups)
    const { name, version } = matched.groups
    const path = matched.groups.path ?? ''
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
  const version = include.version ? (dependency.version ? '@' + dependency.version : '') : ''
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
  options?: { cache?: boolean; allowPreRelease?: boolean },
): Promise<UpdatedDependency | undefined> {
  const constraint = dependency.version ? SemVer.tryParseRange(dependency.version) : undefined
  if (constraint && constraint.flat().length > 1) return
  using cache = options?.cache ? new LatestVersionCache(dependency.name) : undefined
  const cached = cache?.get(dependency.name)
  if (cached) {
    dependency.version === undefined
      ? { name: cached.name, path: dependency.name.slice(cached.name.length) }
      : { ...cached, path: dependency.path }
  }
  if (cached === null) return
  const result = await _resolveLatestVersion(dependency, options)
  cache?.set(dependency.name, result ?? null)
  return result
}

async function _resolveLatestVersion(
  dependency: Dependency,
  options?: { allowPreRelease?: boolean },
): Promise<UpdatedDependency | undefined> {
  function _isPreRelease(version: string): boolean {
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
      const response = await fetch(addSeparator(dependency.protocol) + dependency.name + dependency.path, {
        method: 'HEAD',
      })
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
function isPreRelease(version: string): boolean {
  const parsed = SemVer.tryParse(version)
  return parsed !== undefined && parsed.prerelease !== undefined && parsed.prerelease.length > 0
}

// #endregion

/**
 * TODO:
 * - removed vendored code when https://github.com/hasundue/molt/issues/194 and https://github.com/hasundue/molt/issues/195 are resolved
 */
