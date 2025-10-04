import { $ as _$, type $Type } from 'jsr:@david/dax@^0.43.2'
import { gray } from 'jsr:@std/fmt@^1.0.8/colors'

export { parseFromJson } from 'jsr:@brc-dd/import-map@^0.24.0'
export { Confirm, Input, Select } from 'jsr:@cliffy/prompt@^1.0.0-rc.8'
export type { ConfirmOptions, InputOptions, SelectOptions } from 'jsr:@cliffy/prompt@^1.0.0-rc.8'
export { as, ensure, is } from 'jsr:@core/unknownutil@^4.3.0'
export { createGraph, load as loadGraph } from 'jsr:@deno/graph@^0.102.0'
export type { DependencyJson, ResolvedDependency } from 'jsr:@deno/graph@^0.102.0/types'
export { denoPlugins } from 'jsr:@luca/esbuild-deno-loader@^0.11.1'
export { assert, assertEquals, assertExists, assertInstanceOf } from 'jsr:@std/assert@^1.0.14'
export { parseArgs } from 'jsr:@std/cli@^1.0.22'
export { Spinner } from 'jsr:@std/cli@^1.0.22/unstable-spinner'
export { filterEntries } from 'jsr:@std/collections@^1.1.3'
export { bold, cyan, dim, green, magenta } from 'jsr:@std/fmt@^1.0.8/colors'
export { copy, emptyDir, ensureDir, expandGlob } from 'jsr:@std/fs@^1.0.19'
export { getAvailablePort } from 'jsr:@std/net@^1.0.6/get-available-port'
export { dirname, fromFileUrl, relative, resolve, toFileUrl } from 'jsr:@std/path@^1.1.2'
export * as SemVer from 'jsr:@std/semver@^1.0.5'
export { build } from 'npm:esbuild@0.25.5'
export { default as tsid } from 'npm:unplugin-isolated-decl@^0.15.2/esbuild'
export { z } from 'npm:zod@4.1.11'

const enc = new TextEncoder()

export const $ = new Proxy(_$, {
  apply(target, thisArg, args: Parameters<$Type>) {
    Deno.stderr.writeSync(enc.encode(gray(`$ ${compileTemplate(...args)}\n`)))
    return Reflect.apply(target.raw, thisArg, args).quiet()
  },
})

function compileTemplate(strings: TemplateStringsArray, ...exprs: unknown[]): string {
  return strings.reduce((acc, str, i) => acc + str + (i < exprs.length ? String(exprs[i]) : ''), '')
}
