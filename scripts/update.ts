import { $, expandGlob, parseArgs, parseDependency, relative, resolveLatestVersion, stringify } from '../devDeps.ts'

const args = parseArgs(Deno.args, { collect: ['x'] })
const excludes = (args.x ?? []) as string[]

const denoJson = JSON.parse(await Deno.readTextFile('deno.json')) as { imports: Record<string, string> | undefined }
const newImports = { ...denoJson.imports }

for (const [key, value] of Object.entries(denoJson.imports ?? {})) {
  if (!value.includes(':') || excludes.includes(key)) continue

  const parsed = parseDependency(value)
  let rangeSpecifier: string | undefined = undefined

  if (parsed.version && /^[~^]/.test(parsed.version)) {
    rangeSpecifier = parsed.version[0]
    parsed.version = parsed.version.slice(1)
  }

  const resolved = await resolveLatestVersion(parsed)
  if (!resolved) {
    console.log(`Could not resolve latest version for ${key} (${value})`)
    continue
  }

  resolved.version = `${rangeSpecifier || ''}${resolved.version}`
  newImports[key] = stringify(resolved)
}

denoJson.imports = newImports

await Deno.writeTextFile('deno.json', JSON.stringify(denoJson, null, 2))
await $.raw`deno fmt deno.json`.quiet()

try {
  await Deno.remove('deno.lock')
} catch (e) {
  if (e instanceof Deno.errors.NotFound) {
    // ignore
  } else {
    throw e
  }
}

const files =
  (await Array.fromAsync(expandGlob('**/*.ts', { root: Deno.cwd(), includeDirs: false, exclude: ['**/_*', '**/.*'] })))
    .map((x) => relative(Deno.cwd(), x.path)).join(' ')

await $.raw`deno cache --reload --lock=deno.lock ${files}`

/**
 * TODO:
 * - simplify when https://github.com/dsherret/dax/issues/251 is implemented
 */
