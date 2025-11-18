import {
  copy,
  dirname,
  emptyDir,
  ensureDir,
  esbuild,
  esbuildDenoPlugin,
  esbuildDts,
  expandGlob,
  parseArgs,
  relative,
  rolldown,
  rolldownDenoPlugin,
  rolldownDts,
} from '../dev_deps.ts'

const pick = [
  'name',
  'version',
  'description',
  'keywords',
  'homepage',
  'bugs',
  'license',
  'author',
  'contributors',
  'maintainers',
  'funding',
  'bin',
  'man',
  'repository',
  'scripts',
  'config',
  'engines',
  'os',
  'cpu',
  'publishConfig',
]

const denoJson: {
  imports: Record<string, string>
  exports?: string | Record<string, string>
  build?: { deps: string[]; peerDeps: string[] }
  publish?: { include: string[] }
  [key: string]: unknown
} = JSON.parse(await Deno.readTextFile('deno.json'))

const exports = typeof denoJson.exports === 'string' ? { '.': denoJson.exports } : (denoJson.exports ?? {})

const extractDependencies = (_deps: string[] = [], isOptional: boolean | null = false) => {
  const deps = _deps
    .filter((dep) => isOptional == null || dep.endsWith('?') === isOptional)
    .map((dep) => [dep.replace(/\?$/, ''), denoJson.imports[dep]?.split('@').at(-1) ?? '*'] as const)
  return deps.length ? Object.fromEntries(deps) : undefined
}

const dependencies = extractDependencies(denoJson.build?.deps)
const optionalDependencies = extractDependencies(denoJson.build?.deps, true)
const peerDependencies = extractDependencies(denoJson.build?.peerDeps, null)

const optionalPeerDependencyKeys = Object.keys(extractDependencies(denoJson.build?.peerDeps, true) ?? {})
const peerDependenciesMeta = optionalPeerDependencyKeys.length
  ? Object.fromEntries(optionalPeerDependencyKeys.map((dep) => [dep, { optional: true }]))
  : undefined

const entryPoints = Object.values(exports)
const external = [
  ...Object.keys(dependencies ?? {}),
  ...Object.keys(optionalDependencies ?? {}),
  ...Object.keys(peerDependencies ?? {}),
]

await emptyDir('dist')

const args = parseArgs(Deno.args, {
  string: ['bundler'],
  boolean: ['minify', 'minify-identifiers', 'minify-syntax', 'minify-whitespace'],
  default: {
    'minify': null,
    'minify-identifiers': null,
    'minify-syntax': null,
    'minify-whitespace': null,
    'bundler': 'esbuild',
  },
})

if (!['esbuild', 'rolldown'].includes(args.bundler)) {
  console.error(`Invalid bundler: ${args.bundler}. Only 'esbuild' and 'rolldown' are supported.`)
  Deno.exit(1)
}

const outputs = await (args.bundler === 'rolldown' ? useRolldown : useEsbuild)()

async function useRolldown(): Promise<Record<string, string>> {
  const res = await rolldown({
    input: entryPoints,
    output: {
      dir: 'dist',
      format: 'esm',
      minify: {
        codegen: args['minify-whitespace'] ?? args.minify ?? false,
        compress: args['minify-syntax'] ?? args.minify ?? true,
        mangle: args['minify-identifiers'] ?? args.minify ?? false,
      },
    },
    platform: 'neutral',
    transform: { target: 'es2020' },
    external,
    plugins: [rolldownDts(), rolldownDenoPlugin()],
  })

  return Object.fromEntries(
    res.output.flatMap((chunk) =>
      chunk.type === 'chunk' && chunk.isEntry && chunk.facadeModuleId
        ? [['./' + relative(Deno.cwd(), chunk.facadeModuleId), './' + chunk.fileName]]
        : []
    ),
  )
}

async function useEsbuild(): Promise<Record<string, string>> {
  const res = await esbuild({
    plugins: [esbuildDts({ include: entryPoints }), ...esbuildDenoPlugin()],
    entryPoints,
    outdir: 'dist',
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external,
    metafile: true,
    minify: args.minify ?? false,
    minifyIdentifiers: args['minify-identifiers'] ?? args.minify ?? false,
    minifySyntax: args['minify-syntax'] ?? args.minify ?? true,
    minifyWhitespace: args['minify-whitespace'] ?? args.minify ?? false,
    write: false,
  })

  await Promise.all(
    res.outputFiles.map(async (file) => {
      await ensureDir(dirname(file.path))
      const stripped = file.path.endsWith('.js') ? file.text.replace(/[ \t]*\/\*\*[^]*?\*\/\n?/g, '') : file.text
      await Deno.writeTextFile(file.path, stripped)
    }),
  )

  return Object.fromEntries(
    Object.entries(res.metafile.outputs).flatMap(([key, value]) =>
      value.entryPoint ? [['./' + value.entryPoint, key.replace('dist/', './')]] : []
    ),
  )
}

await Deno.writeTextFile(
  'dist/package.json',
  JSON.stringify(
    {
      ...Object.fromEntries(pick.map((key) => [key, denoJson[key]])),
      type: 'module',
      exports: Object.fromEntries(Object.entries(exports).map(([key, value]) => [key, outputs[value]])),
      dependencies,
      optionalDependencies,
      peerDependencies,
      peerDependenciesMeta,
    },
    null,
    2,
  ),
)

await Promise.all(
  [...(denoJson.publish?.include ?? []), 'license', 'license.*', 'changelog', 'changelog.*', 'readme', 'readme.*']
    .map(async (file) => {
      await Promise.all(
        (await Array.fromAsync(expandGlob(file, { caseInsensitive: true, followSymlinks: true })))
          .map(async (entry) => {
            const path = relative(Deno.cwd(), entry.path)
            const dist = `dist/${path}`
            await ensureDir(dirname(dist))
            await copy(entry.path, dist, { overwrite: true })
          }),
      )
    }),
)
