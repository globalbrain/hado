import { $ as _$, type $Type } from 'jsr:@david/dax@^0.50.0'
import 'npm:typescript@^6.0.3'

export { parseFromJson } from 'jsr:@brc-dd/import-map@^0.25.0'
export { Confirm, Input, Select } from 'jsr:@cliffy/prompt@^1.3.1'
export type { ConfirmOptions, InputOptions, SelectOptions } from 'jsr:@cliffy/prompt@^1.3.1'
export { createCache } from 'jsr:@deno/cache-dir@^0.27.0'
export { createGraph } from 'jsr:@deno/graph@^0.111.0'
export type { DependencyJson } from 'jsr:@deno/graph@^0.111.0/types'
export { default as rolldownDenoPlugin } from 'jsr:@deno/rolldown-plugin@^0.0.10'
export { denoPlugins as esbuildDenoPlugin } from 'jsr:@luca/esbuild-deno-loader@^0.11.1'
export { assert, assertEquals, assertExists, assertInstanceOf, assertRejects } from 'jsr:@std/assert@^1.0.19'
export { parseArgs } from 'jsr:@std/cli@^1.0.32'
export { Spinner } from 'jsr:@std/cli@^1.0.32/unstable-spinner'
export { bold, cyan, dim, green, magenta } from 'jsr:@std/fmt@^1.0.10/colors'
export { copy, emptyDir, ensureDir, expandGlob } from 'jsr:@std/fs@^1.0.24'
export { getAvailablePort } from 'jsr:@std/net@^1.0.6/get-available-port'
export { dirname, fromFileUrl, relative, resolve, toFileUrl } from 'jsr:@std/path@^1.1.6'
export * as SemVer from 'jsr:@std/semver@^1.0.8'
export { build as esbuild } from 'npm:esbuild@0.28.2'
export type { Plugin as EsbuildPlugin } from 'npm:esbuild@0.28.2'
export { dts as rolldownDts } from 'npm:rolldown-plugin-dts@^0.28.6'
export { build as rolldown } from 'npm:rolldown@^1.2.9'
export { default as esbuildDts } from 'npm:unplugin-isolated-decl@^0.17.0/esbuild'
export { z } from 'npm:zod@4.6.5'

export const $ = new Proxy(_$, {
  apply(target, thisArg, args: Parameters<$Type>) {
    return Reflect.apply(target.raw, thisArg, args).quiet().errorTail()
  },
})
