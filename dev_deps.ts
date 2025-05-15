import { $ as _$, type $Type } from 'jsr:@david/dax@^0.43.1'

export { parseFromJson } from 'https://deno.land/x/import_map@v0.21.0/mod.ts'
export {
  Confirm,
  type ConfirmOptions,
  Input,
  type InputOptions,
  Select,
  type SelectOptions,
} from 'jsr:@cliffy/prompt@^1.0.0-rc.7'
export { as, ensure, is } from 'jsr:@core/unknownutil@^4.3.0'
export { createGraph, load as loadGraph } from 'jsr:@deno/graph@^0.91.0'
export type { DependencyJson, ResolvedDependency } from 'jsr:@deno/graph@^0.91.0/types'
export { denoPlugins } from 'jsr:@luca/esbuild-deno-loader@^0.11.1'
export { assertEquals, assertExists } from 'jsr:@std/assert@^1.0.13'
export { parseArgs } from 'jsr:@std/cli@^1.0.17'
export { Spinner } from 'jsr:@std/cli@^1.0.17/unstable-spinner'
export { filterEntries } from 'jsr:@std/collections@^1.1.0'
export { bold, cyan, dim, green, magenta } from 'jsr:@std/fmt@^1.0.8/colors'
export { copy, emptyDir, ensureDir, expandGlob } from 'jsr:@std/fs@^1.0.17'
export { getAvailablePort } from 'jsr:@std/net@^1.0.4/get-available-port'
export { dirname, fromFileUrl, relative, resolve, toFileUrl } from 'jsr:@std/path@^1.0.9'
export { escape } from 'jsr:@std/regexp@^1.0.1'
export * as SemVer from 'jsr:@std/semver@^1.0.5'
export { build } from 'npm:esbuild@^0.25.4'
export { default as tsid } from 'npm:unplugin-isolated-decl@^0.14.1/esbuild'

export const $ = new Proxy(_$, {
  apply(target, thisArg, args: Parameters<$Type>) {
    return Reflect.apply(target.raw, thisArg, args).quiet()
  },
})
