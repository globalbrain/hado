/**
 * Credits:
 *
 * - next - MIT License
 *     Copyright (c) 2024 Vercel, Inc.
 *     https://github.com/vercel/next.js/blob/canary/license.md
 *     Relevant files:
 *       https://github.com/vercel/next.js/blob/efcec4c1e303848a5293cef6961be8f73fd5160b/packages/next/src/shared/lib/router/utils/sorted-routes.ts
 */

import { walkSync } from '@std/fs'
import { toFileUrl } from '@std/path'

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'])

type Params = Record<string, string | string[]>
type Handler = (req: Request, params: Params) => Promise<Response>

// adapted from https://stackoverflow.com/a/46432113/11613622
class _LRUCache<K, V> {
  readonly #max: number
  readonly #cache: Map<K, V>

  constructor(max: number = 10) {
    this.#max = max
    this.#cache = new Map<K, V>()
  }

  #get(key: K): V | undefined {
    const item = this.#cache.get(key)
    if (item !== undefined) {
      // refresh key
      this.#cache.delete(key)
      this.#cache.set(key, item)
    }
    return item
  }

  #set(key: K, val: V): void {
    // refresh key
    if (this.#cache.has(key)) this.#cache.delete(key)
    // evict oldest
    else if (this.#cache.size === this.#max) this.#cache.delete(this.#first()!)
    this.#cache.set(key, val)
  }

  #first(): K | undefined {
    return this.#cache.keys().next().value
  }

  async use(key: K, fn: () => Promise<V>, skip = false): Promise<V> {
    if (skip) return fn()
    let val = this.#get(key)
    if (val === undefined) {
      val = await fn()
      this.#set(key, val)
    }
    return val
  }
}

class UrlNode {
  readonly children: Map<string, UrlNode> = new Map()

  placeholder: boolean = true
  slugName: string | null = null
  restSlugName: string | null = null
  optionalRestSlugName: string | null = null
  file: string | null = null

  // #region Insert

  insert(urlPath: string, file: string): void {
    this.#insert(urlPath.split('/').filter(Boolean), 0, [], false, file)
  }

  #insert(urlPaths: string[], index: number, slugNames: string[], isCatchAll: boolean, file: string): void {
    if (index === urlPaths.length) {
      this.placeholder = false
      this.file = file
      return
    }

    if (isCatchAll) {
      throw new Error('Catch-all must be the last part of the URL.')
    }

    let nextSegment = urlPaths[index]!
    let segmentName = ''
    let isOptional = false

    if (nextSegment.startsWith('[') && nextSegment.endsWith(']')) {
      segmentName = nextSegment.slice(1, -1)

      if (segmentName.startsWith('[') && segmentName.endsWith(']')) {
        segmentName = segmentName.slice(1, -1)
        isOptional = true
      }

      if (segmentName.startsWith('...')) {
        segmentName = segmentName.substring(3)
        isCatchAll = true
      }

      if (segmentName.startsWith('[') || segmentName.endsWith(']') || segmentName.startsWith('.')) {
        throw new Error(`Invalid segment name ('${segmentName}').`)
      }

      const handleSlug = (previousSlug: string | null, nextSlug: string) => {
        if (previousSlug !== null && previousSlug !== nextSlug) {
          throw new Error(
            `You cannot use different slug names for the same dynamic path ('${previousSlug}' !== '${nextSlug}').`,
          )
        }

        if (slugNames.includes(nextSlug)) {
          throw new Error(`Duplicate slug name '${nextSlug}' within a single dynamic path.`)
        }

        slugNames.push(nextSlug)
      }

      if (isCatchAll) {
        if (isOptional) {
          if (this.restSlugName !== null) {
            throw new Error(`Conflicting required and optional catch-all routes at the same level.`)
          }

          handleSlug(this.optionalRestSlugName, segmentName)
          this.optionalRestSlugName = segmentName
          nextSegment = '[[...]]'
        } else {
          if (this.optionalRestSlugName !== null) {
            throw new Error(`Conflicting optional and required catch-all routes at the same level.`)
          }

          handleSlug(this.restSlugName, segmentName)
          this.restSlugName = segmentName
          nextSegment = '[...]'
        }
      } else {
        if (isOptional) {
          throw new Error(`Optional route parameters are not yet supported ('${nextSegment}').`)
        }

        handleSlug(this.slugName, segmentName)
        this.slugName = segmentName
        nextSegment = '[]'
      }
    }

    if (!this.children.has(nextSegment)) {
      this.children.set(nextSegment, new UrlNode())
    }

    this.children.get(nextSegment)!.#insert(urlPaths, index + 1, slugNames, isCatchAll, file)
  }

  // #endregion

  // #region Lookup

  lookup(
    urlPath: string,
    fileHasMethod: (file: string) => Promise<boolean>,
  ): Promise<{ file: string; params: Params } | null> {
    return this.#lookup(urlPath.split('/').filter(Boolean), 0, {}, fileHasMethod)
  }

  async #lookup(
    urlPaths: string[],
    index: number,
    params: Params,
    fileHasMethod: (file: string) => Promise<boolean>,
  ): Promise<{ file: string; params: Params } | null> {
    if (index === urlPaths.length) {
      if (!this.placeholder) {
        if (this.optionalRestSlugName !== null) {
          throw new Error('You cannot define a route with the same specificity as an optional catch-all route.')
        }
        if (this.file && (await fileHasMethod(this.file))) {
          return { file: this.file, params }
        }
      }

      if (this.optionalRestSlugName !== null) {
        const result = this.children.get('[[...]]')!
        if (result.file && (await fileHasMethod(result.file))) {
          params[this.optionalRestSlugName] = []
          return { file: result.file, params }
        }
      }

      return null
    }

    const nextSegment = urlPaths[index]!

    if (this.children.has(nextSegment)) {
      const childNode = this.children.get(nextSegment)!
      const result = await childNode.#lookup(urlPaths, index + 1, params, fileHasMethod)
      if (result !== null) return result
    }

    if (this.slugName !== null) {
      const slugNode = this.children.get('[]')!
      const result = await slugNode.#lookup(
        urlPaths,
        index + 1,
        { ...params, [this.slugName]: nextSegment },
        fileHasMethod,
      )
      if (result !== null) return result
    }

    if (this.restSlugName !== null) {
      const restNode = this.children.get('[...]')!
      if (restNode.file && (await fileHasMethod(restNode.file))) {
        params[this.restSlugName] = urlPaths.slice(index)
        return { file: restNode.file, params }
      }
    }

    if (this.optionalRestSlugName !== null) {
      const optionalRestNode = this.children.get('[[...]]')!
      if (optionalRestNode.file && (await fileHasMethod(optionalRestNode.file))) {
        params[this.optionalRestSlugName] = urlPaths.slice(index)
        return { file: optionalRestNode.file, params }
      }
    }

    return null
  }

  // #endregion
}

/**
 * A file-system based router.
 *
 * @example
 * ```ts
 * const router = new Router(fromFileUrl(new URL('./api', import.meta.url)), { baseUrl: '/api' })
 * Deno.serve({ port: 3000 }, (req) => router.route(req))
 * ```
 */
export class Router {
  readonly #root = new UrlNode()
  readonly #dev: boolean

  /** req.url.pathname -> { file, params } */
  readonly #lookupCache = new _LRUCache<string, { file: string; params: Params } | null>(100)
  /** file:METHOD -> boolean */
  readonly #fileHasMethodCache = new _LRUCache<string, boolean>(100)
  /** file:METHOD -> handler */
  readonly #handlerCache = new _LRUCache<string, Handler | null>(100)

  constructor(dir: string, options: { baseUrl?: string; dev?: boolean } = {}) {
    const { baseUrl = '', dev = false } = options

    for (const file of walkSync(dir, { includeDirs: false, includeSymlinks: false, exts: ['.ts'] })) {
      let path = baseUrl + file.path.replace(/\\/g, '/').slice(dir.length)
      if (path.endsWith('.d.ts') || path.includes('/_') || path.includes('/.')) continue
      path = path.replace(/\.ts$/, '').replace(/\/(index)?$/, '').replace(/^(?!\/)/, '/')
      this.#root.insert(path, toFileUrl(file.path).href)
    }

    this.#dev = dev
  }

  async route(req: Request): Promise<Response> {
    if (!methods.has(req.method)) return new Response('Method Not Allowed', { status: 405 })
    if (req.url.length > 8192) return new Response('URI Too Long', { status: 414 })

    const pathname = new URL(req.url).pathname

    const result = await this.#lookupCache.use(
      pathname,
      () => {
        const fileHasMethod = (file: string) => {
          const key = `${file}:${req.method}`
          return this.#fileHasMethodCache.use(
            key,
            async () => !!(await this.#getHandler(file, req.method)),
            this.#dev,
          )
        }

        return this.#root.lookup(pathname, fileHasMethod)
      },
      this.#dev,
    )

    if (result !== null) {
      return (await this.#getHandler(result.file, req.method))!(req, result.params)
    }

    return new Response('Not Found', { status: 404 })
  }

  #getHandler(file: string, method: string): Promise<Handler | null> {
    return this.#handlerCache.use(
      `${file}:${method}`,
      async () => {
        try {
          return (await import(this.#dev ? file + '?t=' + Date.now() : file))?.[method]
        } catch {
          return null
        }
      },
      this.#dev,
    )
  }
}

// TODO: use URLPatternList once it's available (https://github.com/whatwg/urlpattern/pull/166)
// TODO: use iterative pattern if there is significant memory/performance improvement
// TODO: use better LRU cache implementation
// TODO: reload router in dev mode when files are created/deleted
