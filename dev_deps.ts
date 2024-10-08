import { $ as _$, type $Type } from 'jsr:@david/dax@^0.42.0'

export { parseFromJson } from 'https://deno.land/x/import_map@v0.20.1/mod.ts'
export {
  Confirm,
  type ConfirmOptions,
  Input,
  type InputOptions,
  Select,
  type SelectOptions,
} from 'jsr:@cliffy/prompt@^1.0.0-rc.5'
export { as, ensure, is } from 'jsr:@core/unknownutil@^4.3.0'
export { createGraph, load as loadGraph } from 'jsr:@deno/graph@^0.82.1'
export type { DependencyJson, ResolvedDependency } from 'jsr:@deno/graph@^0.82.1/types'
export { assertEquals, assertExists } from 'jsr:@std/assert@^1.0.5'
export { parseArgs } from 'jsr:@std/cli@^1.0.6'
export { Spinner } from 'jsr:@std/cli@^1.0.6/unstable-spinner'
export { filterEntries } from 'jsr:@std/collections@^1.0.6'
export { bold, cyan, dim, green, magenta } from 'jsr:@std/fmt@^1.0.2/colors'
export { expandGlob } from 'jsr:@std/fs@^1.0.3'
export { getAvailablePort } from 'jsr:@std/net@^1.0.4/get-available-port'
export { dirname, fromFileUrl, relative, resolve, toFileUrl } from 'jsr:@std/path@^1.0.6'
export { escape } from 'jsr:@std/regexp@^1.0.0'
export * as SemVer from 'jsr:@std/semver@^1.0.3'

export const $ = new Proxy(_$, {
  apply(target, thisArg, args: Parameters<$Type>) {
    return Reflect.apply(target.raw, thisArg, args).quiet()
  },
})
