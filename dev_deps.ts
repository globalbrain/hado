import { $ as _$ } from 'jsr:@david/dax@^0.41.0'

export { parseFromJson } from 'https://deno.land/x/import_map@v0.20.0/mod.ts'
export {
  Confirm,
  type ConfirmOptions,
  Input,
  type InputOptions,
  Select,
  type SelectOptions,
} from 'jsr:@cliffy/prompt@^1.0.0-rc.5'
export { ensure, is } from 'jsr:@core/unknownutil@^3.18.1'
export { createGraph, load as loadGraph } from 'jsr:@deno/graph@^0.80.1'
export type { DependencyJson, ResolvedDependency } from 'jsr:@deno/graph@^0.80.1/types'
export { Mutex } from 'jsr:@lambdalisue/async@^2.1.1'
export { assertEquals, assertExists } from 'jsr:@std/assert@^1.0.0'
export { parseArgs, Spinner } from 'jsr:@std/cli@^1.0.0-rc.5'
export { filterEntries } from 'jsr:@std/collections@^1.0.4'
export { bold, cyan, dim, green, magenta } from 'jsr:@std/fmt@^1.0.0-rc.1/colors'
export { expandGlob } from 'jsr:@std/fs@^1.0.0-rc.5'
export { getAvailablePort } from 'jsr:@std/net@^1.0.0-rc.1/get-available-port'
export { dirname, fromFileUrl, relative, resolve, toFileUrl } from 'jsr:@std/path@^1.0.0'
export { escape } from 'jsr:@std/regexp@^1.0.0'
export * as SemVer from 'jsr:@std/semver@^1.0.0-rc.2'

export const $ = new Proxy(_$, {
  apply(target, _, args: Parameters<typeof _$.raw>) {
    return target.raw(...args).quiet()
  },
})
