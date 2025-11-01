/**
 * A file-system based router.
 *
 * @module router
 */

/**
 * Credits:
 *
 * - next - MIT License
 *     Copyright (c) 2024 Vercel, Inc.
 *     https://github.com/vercel/next.js/blob/main/license.md
 *     Relevant files:
 *       https://github.com/vercel/next.js/blob/f4c1a406e420e5ee5c01040e642a2e2fcc97f72f/packages/next/src/shared/lib/router/utils/sorted-routes.ts
 *
 * - deno_std - MIT License
 *     Copyright 2018-2025 the Deno authors
 *     https://github.com/denoland/std/blob/main/LICENSE
 *     Relevant files:
 *       https://github.com/denoland/std/blob/49c117d2ef4626c4f3f061268f3adb0e4f083c5b/http/file_server.ts
 */

import { debounce } from 'jsr:@std/async@^1.0.15/debounce'
import { walk } from 'jsr:@std/fs@^1.0.19/walk'
import { serveDir, type ServeDirOptions } from 'jsr:@std/http@^1.0.21/file-server'
import { STATUS_CODE, STATUS_TEXT, type StatusCode } from 'jsr:@std/http@^1.0.21/status'
import { normalize as posixNormalize } from 'jsr:@std/path@^1.1.2/posix/normalize'
import { toFileUrl } from 'jsr:@std/path@^1.1.2/to-file-url'

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'])

type Awaitable<T> = T | Promise<T>
type Params = Record<string, string | string[]>
type Handler = (req: Request, params: Params) => Awaitable<Response>

// adapted from https://stackoverflow.com/a/46432113/11613622
class LRUCache<K, V> {
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

  clear(): void {
    return this.#cache.clear()
  }

  async use(key: K, fn: () => Awaitable<V>): Promise<V> {
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

  static #cwd = Deno.cwd()
  static #sep = Deno.build.os === 'windows' ? '\\' : '/'

  placeholder: boolean = true
  slugName: string | null = null
  restSlugName: string | null = null
  optionalRestSlugName: string | null = null
  data: string | null = null

  // #region Insert

  insert(urlPath: string, data: string): void {
    const segments = urlPath.split('/').filter((segment) =>
      segment && !(segment.startsWith('(') && segment.endsWith(')'))
    )
    this.#insert(segments, 0, [], false, data)
  }

  #insert(urlPaths: string[], index: number, slugNames: string[], isCatchAll: boolean, data: string): void {
    if (index === urlPaths.length) {
      if (this.data !== null) {
        throw new Error(
          `You cannot have two parallel pages that resolve to the same path. Please check ` +
            `${UrlNode.#userFriendlyPath(this.data)} and ${UrlNode.#userFriendlyPath(data)}.`,
        )
      }
      this.placeholder = false
      this.data = data
      return
    }

    if (isCatchAll) throw new Error('Catch-all must be the last part of the URL.')

    let nextSegment = urlPaths[index]!
    let segmentName = ''
    let isOptional = false

    if (nextSegment.startsWith('[') && nextSegment.endsWith(']')) {
      segmentName = nextSegment.slice(1, -1)

      if (segmentName.startsWith('[') && segmentName.endsWith(']')) {
        segmentName = segmentName.slice(1, -1)
        isOptional = true
      }

      if (segmentName.startsWith('…')) {
        throw new Error(`Detected ellipsis ('…') at ('${segmentName}'). Did you mean ('...')?`)
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
        if (isOptional) throw new Error(`Optional route parameters are not yet supported ('${nextSegment}').`)

        handleSlug(this.slugName, segmentName)
        this.slugName = segmentName
        nextSegment = '[]'
      }
    }

    if (!this.children.has(nextSegment)) this.children.set(nextSegment, new UrlNode())

    this.children.get(nextSegment)!.#insert(urlPaths, index + 1, slugNames, isCatchAll, data)
  }

  // #endregion

  // #region Lookup

  lookup(
    urlPath: string,
    validate: (data: string) => Awaitable<boolean>,
  ): Promise<{ match: string; params: Params } | null> {
    return this.#lookup(urlPath.split('/').filter(Boolean), 0, {}, validate)
  }

  async #lookup(
    urlPaths: string[],
    index: number,
    params: Params,
    validate: (data: string) => Awaitable<boolean>,
  ): Promise<{ match: string; params: Params } | null> {
    if (index === urlPaths.length) {
      if (!this.placeholder) {
        if (this.optionalRestSlugName !== null) {
          throw new Error('You cannot define a route with the same specificity as an optional catch-all route.')
        }
        if (this.data && (await validate(this.data))) return { match: this.data, params }
      }

      if (this.optionalRestSlugName !== null) {
        const result = this.children.get('[[...]]')!
        if (result.data && (await validate(result.data))) {
          params[this.optionalRestSlugName] = []
          return { match: result.data, params }
        }
      }

      return null
    }

    const nextSegment = urlPaths[index]!

    if (this.children.has(nextSegment)) {
      const childNode = this.children.get(nextSegment)!
      const result = await childNode.#lookup(urlPaths, index + 1, params, validate)
      if (result !== null) return result
    }

    if (this.slugName !== null) {
      const slugNode = this.children.get('[]')!
      const result = await slugNode.#lookup(urlPaths, index + 1, { ...params, [this.slugName]: nextSegment }, validate)
      if (result !== null) return result
    }

    if (this.restSlugName !== null) {
      const restNode = this.children.get('[...]')!
      if (restNode.data && (await validate(restNode.data))) {
        params[this.restSlugName] = urlPaths.slice(index)
        return { match: restNode.data, params }
      }
    }

    if (this.optionalRestSlugName !== null) {
      const optionalRestNode = this.children.get('[[...]]')!
      if (optionalRestNode.data && (await validate(optionalRestNode.data))) {
        params[this.optionalRestSlugName] = urlPaths.slice(index)
        return { match: optionalRestNode.data, params }
      }
    }

    return null
  }

  // #endregion

  static #userFriendlyPath(fileUrl: string) {
    return fileUrl.slice(8 + UrlNode.#cwd.length).replace(/\//g, UrlNode.#sep)
  }
}

/**
 * Creates a file-system based router.
 *
 * @example
 *
 * ```ts
 * const { handler } = await createRouter({
 *   fsRoot: fromFileUrl(new URL('./api', import.meta.url)),
 *   urlRoot: '/api',
 *   dev: Deno.env.get('DENO_ENV') === 'development',
 * })
 *
 * Deno.serve({ port: 3000, handler })
 * ```
 */
export async function createRouter(
  { fsRoot, urlRoot = '', static: statik, dev = false }: {
    fsRoot: string
    urlRoot?: string
    static?: ServeDirOptions & { fsRoot: string }
    dev?: boolean
  },
): Promise<{
  /**
   * The request handler.
   */
  handler: (req: Request) => Promise<Response>
  /**
   * Reloads the router (e.g. after modifying route files).
   * dev mode automatically reloads the router on file changes.
   */
  reloadRouter: () => Promise<void>
}> {
  let root: UrlNode

  /** req.url.pathname:METHOD -> { match, params } */
  const lookupCache = new LRUCache<string, { match: string; params: Params } | null>(100)
  /** file:METHOD -> handler */
  const handlerCache = new LRUCache<string, Handler | null>(100)

  async function createTree() {
    lookupCache.clear()
    handlerCache.clear()
    root = new UrlNode()

    for await (const file of walk(fsRoot, { includeDirs: false, includeSymlinks: false, exts: ['.ts'] })) {
      let path = file.path.slice(fsRoot.length)
      if (!shouldProcessFile(path)) continue
      path = path.replace(/\\/g, '/').replace(/\.ts$/, '').replace(/\/(?:index)?$/, '').replace(/^(?!\/)/, '/')
      root.insert(path, toFileUrl(file.path).href)
    }
  }

  await createTree()

  const reloadRouter = debounce(() => {
    console.log('Reloading router...')
    return createTree()
  }, 100)

  if (dev) {
    const watcher = Deno.watchFs(fsRoot)
    addEventListener('unload', () => watcher.close())
    ;(async () => {
      for await (const event of watcher) {
        if (
          (event.kind === 'create' || event.kind === 'remove' || event.kind === 'rename') &&
          event.paths.some((path) => shouldProcessFile(path))
        ) reloadRouter()
      }
    })()
  }

  const urlRootRE = new RegExp(`^/?${RegExp.escape(urlRoot)}(?:/|$)`)

  function getHandler(file: string, method: string): Promise<Handler | null> {
    return handlerCache.use(
      `${file}:${method}`,
      async () => {
        try {
          const handler: Handler | undefined = (await import(file))?.[method === 'HEAD' ? 'GET' : method]
          if (typeof handler !== 'function') return null
          if (method === 'HEAD') return async (...args) => new Response(null, await handler(...args))
          return handler
        } catch {
          return null
        }
      },
    )
  }

  async function handler(req: Request): Promise<Response> {
    if (!methods.has(req.method)) return createStandardResponse(STATUS_CODE.MethodNotAllowed)
    if (req.url.length > 8192) return createStandardResponse(STATUS_CODE.URITooLong)

    const url = new URL(req.url)
    const decodedUrl = decodeURI(url.pathname)
    let normalizedPath = posixNormalize(decodedUrl)

    if (urlRootRE.test(normalizedPath)) {
      if (normalizedPath !== decodedUrl) {
        url.pathname = normalizedPath
        return Response.redirect(url, STATUS_CODE.MovedPermanently)
      }

      normalizedPath = normalizedPath.replace(urlRoot, '')

      const result = await lookupCache.use(
        `${normalizedPath}:${req.method}`,
        () => root.lookup(normalizedPath, async (file) => !!(await getHandler(file, req.method))),
      )

      if (result !== null) return (await getHandler(result.match, req.method))!(req, result.params)
    }

    if (statik?.fsRoot) return serveDir(req, { quiet: true, ...statik })

    return createStandardResponse(STATUS_CODE.NotFound)
  }

  return { handler, reloadRouter: createTree }
}

/**
 * Creates a standard response with the given status code.
 *
 * @example
 *
 * ```ts
 * const response = createStandardResponse(STATUS_CODE.NotFound)
 * ```
 *
 * @param status The status code.
 * @param init The response init.
 * @returns The response.
 */
export function createStandardResponse(status: StatusCode, init?: ResponseInit): Response {
  const statusText = STATUS_TEXT[status]
  return new Response(statusText, { status, statusText, ...init })
}

function shouldProcessFile(path: string): boolean {
  path = path.replace(/\\/g, '/')
  if (!path.endsWith('.ts')) return false
  return !(
    path.includes('node_modules/') ||
    path.includes('coverage/') ||
    path.includes('/.') ||
    path.includes('/_') ||
    path.endsWith('.d.ts') ||
    path.endsWith('.spec.ts') ||
    path.endsWith('.test.ts') ||
    path.endsWith('_test.ts')
  )
}

/**
 * TODO:
 * - use URLPatternList once it's available (https://github.com/whatwg/urlpattern/pull/166)
 * - use iterative pattern if there is significant memory/performance improvement
 * - use more efficient LRU cache implementation (https://jsr.io/@std/cache) or Web Cache API (https://deno.com/blog/deploy-cache-api)
 * - use eager loading in production mode
 * - don't destroy whole tree on single file change
 * - support deno deploy (https://github.com/denoland/deploy_feedback/issues/433), add services docs
 * - store static routes in a map instead of tree for faster lookup
 * - auto enable dev mode when hmr is enabled (https://github.com/denoland/deno/issues/28770)
 */
