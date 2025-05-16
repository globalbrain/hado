/**
 * @module utils
 *
 * @description
 * A collection of utility functions.
 */

/**
 * Credits:
 *
 * - ky - MIT License
 *     Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *     https://github.com/sindresorhus/ky/blob/main/license
 *
 * - ofetch - MIT License
 *     Copyright (c) Pooya Parsa <pooya@pi0.io>
 *     https://github.com/unjs/ofetch/blob/main/LICENSE
 *
 * - undici - MIT License
 *     Copyright (c) Matteo Collina and Undici contributors
 *     https://github.com/nodejs/undici/blob/main/LICENSE
 *     Relevant files:
 *       https://github.com/nodejs/undici/blob/5f11247b34510a3dc821da3c10d3cea0f39a7b13/lib/handler/retry-handler.js
 */

import { delay, type ZodType } from '../deps.ts'

// #region Pooling

class Semaphore {
  #capacity: number
  #queue: (() => void)[] = []

  constructor(capacity: number) {
    this.#capacity = capacity
  }

  // deno-lint-ignore require-await
  async acquire() {
    if (this.#capacity > 0) this.#capacity--
    else return new Promise<void>((resolve) => this.#queue.push(resolve))
  }

  release() {
    const resolve = this.#queue.shift()
    if (resolve) resolve()
    else this.#capacity++
  }
}

const pools = new Map<string, Semaphore>()

// #endregion

// #region Wrapper

type OutputOrResponse<Schema extends ZodType | undefined> = Schema extends ZodType ? Schema['_output'] : Response
type ResponseOrError<T, Schema extends ZodType | undefined> =
  | { source: T; success: true; data: OutputOrResponse<Schema>; error?: never }
  | { source: T; success: false; data?: never; error: unknown }
type Require<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

/**
 * Options for {@link fetchAll}.
 */
export type FetchOptions<Schema extends ZodType | undefined = undefined> = {
  /**
   * The pool key to use for rate limiting.\
   * If not provided, the host of the first request will be used.
   */
  pool?: string
  /**
   * The maximum number of attempts to make.\
   * Default: 5 attempts per request. (4 retries)
   */
  maxAttempts?: number
  /**
   * The maximum time to wait for a response.\
   * Default: 10000ms (10 seconds)
   */
  timeout?: number
  /**
   * The maximum time to wait for all requests to complete.\
   * Default: 300000ms (5 minutes)
   */
  deadline?: number
  /**
   * The schema to validate the response body. Only works with JSON responses.\
   * Default: No validation. (returns the response object)
   */
  schema?: Schema
  /**
   * The maximum number of requests to make concurrently.\
   * Default: 64 requests per pool.
   */
  concurrency?: number
}

/**
 * Fetch multiple requests concurrently.\
 * Automatically handles rate limiting, retries, and timeouts.
 *
 * @example
 * ```ts
 * const requests = [
 *   new Request('https://dummy.restapiexample.com/api/v1/employee/1'),
 *   new Request('https://dummy.restapiexample.com/api/v1/employee/2'),
 *   new Request('https://dummy.restapiexample.com/api/v1/employee/3'),
 * ]
 *
 * const responses = await fetchAll(requests)
 * const data = await Promise.all(responses.map((res) => res.json()))
 * ```
 *
 * @param requests The requests to fetch.
 * @param options The fetch options.
 * @returns The responses. (or parsed and validated JSON data if options.schema is provided)
 *
 * @throws {AggregateError} If any request fails.
 * @throws {import('@std/async').DeadlineError} If the deadline is exceeded.
 */
export async function fetchAll<Schema extends ZodType | undefined = undefined>(
  requests: Request[],
  options: FetchOptions<Schema> = {},
): Promise<{ values: OutputOrResponse<Schema>[]; errors?: unknown[] }> {
  const pool = getPool(options, URL.parse(requests[0]!.url)?.host)

  const res = await deadline((signal) => {
    return Promise.allSettled(requests.map((req) => _fetch(req, options, signal, pool)))
  }, options.deadline ?? 300_000) // 5 minutes

  const { values, errors } = collect(res)
  const schema = options.schema

  // @ts-expect-error - conditionally typed
  if (!schema) return { values, errors }

  const parsed = await Promise.allSettled(values.map((res) => res.json().then(schema.parse)))
  return collect(parsed, errors)
}

/**
 * Fetch data concurrently from an array of items using a provided request factory.\
 * Yields results as they become available, preserving high throughput with concurrency control.
 *
 * Automatically handles rate limiting, request timeouts, retries, and optional schema validation.\
 * The pool is shared across all calls using the same key.
 *
 * @template T The item type of the input array.
 * @template Schema An optional Zod schema to validate the response body (for JSON responses).
 *
 * @param arr The array of items to be processed into requests.
 * @param fn A function that maps each item in `arr` to a `Request` object.
 * @param options Fetch options including a required pool key and optional schema, concurrency, timeout, and retry settings.
 *
 * @returns An async generator yielding `ResponseOrError<Schema>` objects in the order results become available.
 *
 * @throws {Error} If no pool key is provided or pool setup fails.
 *
 * @example
 * ```ts
 * const users = ['1', '2', '3']
 *
 * for await (const result of concurrentArrayFetcher(users, id => new Request(`/api/user/${id}`), {
 *   pool: 'user-api',
 *   schema: UserSchema,
 *   concurrency: 10,
 * })) {
 *   if (result.success) {
 *     console.log('User data:', result.data)
 *   } else {
 *     console.error('Fetch error:', result.error)
 *   }
 * }
 * ```
 */
export async function* concurrentArrayFetcher<T, Schema extends ZodType | undefined = undefined>(
  arr: T[],
  fn: (item: T) => Request,
  options: Omit<Require<FetchOptions<Schema>, 'pool'>, 'deadline'>,
): AsyncGenerator<ResponseOrError<T, Schema>> {
  const pool = getPool(options)
  const concurrency = options.concurrency ?? 64
  const schema = options.schema

  const queue = [...arr]
  const inProgress = new Set<Promise<void>>()

  const runTask = async (item: T) => {
    let result: ResponseOrError<T, Schema>

    try {
      await pool.acquire()

      const response = await _fetch(fn(item), options)
      const data = schema ? await response.json().then(schema.parse) : response

      result = { source: item, success: true, data }

      //
    } catch (error) {
      result = { source: item, success: false, error }

      //
    } finally {
      pool.release()
      yieldResult(result!)
    }
  }

  let yieldResult: (value: ResponseOrError<T, Schema>) => void = () => {}

  while (queue.length || inProgress.size) {
    while (inProgress.size < concurrency && queue.length) {
      const item = queue.shift()!
      const task = (() => runTask(item))()
      inProgress.add(task)
      task.finally(() => inProgress.delete(task))
    }

    yield await new Promise((resolve) => {
      yieldResult = resolve
    })
  }
}

// #endregion

// #region Logic

const idempotentMethods = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'])
const retryStatusCodes = new Set([408, 429, 500, 502, 503, 504])

class FetchError extends Error {
  constructor(
    public request: Request,
    public response: Response,
  ) {
    super(`[${request.method}] ${request.url} - ${response.status} ${response.statusText}`)
    this.name = 'FetchError'
  }
}

function getPool(options: Pick<FetchOptions, 'pool' | 'concurrency'>, defaultKey?: string): Semaphore {
  const key = options.pool ?? defaultKey
  if (!key) throw new Error('No pool key provided')

  let pool = pools.get(key)
  if (pool) return pool

  pools.set(key, pool = new Semaphore(options.concurrency ?? 64))
  return pool
}

async function _fetch(
  req: Request,
  options: Pick<FetchOptions, 'maxAttempts' | 'timeout'>,
  parentSignal?: AbortSignal,
  pool?: Semaphore,
): Promise<Response> {
  let maxAttempts = idempotentMethods.has(req.method) ? (options.maxAttempts ?? 5) : 1
  const timeout = options.timeout ?? 10_000
  const maxRetryAfter = Date.now() + maxAttempts * timeout

  let lastError: unknown

  while (maxAttempts-- > 0) {
    try {
      await pool?.acquire()

      const res = await deadline((signal) => {
        return fetch(req, {
          signal: AbortSignal.any([req.signal, signal, ...(parentSignal ? [parentSignal] : [])]),
        })
      }, timeout)

      if (res.ok) return res
      throw new FetchError(req, res)

      //
    } catch (error: unknown) {
      lastError = error

      if (maxAttempts <= 0 || parentSignal?.aborted) break // no more attempts left or outer deadline exceeded

      if (error instanceof FetchError && retryStatusCodes.has(error.response.status)) {
        const retryAfter = error.response.headers.get('Retry-After')

        if (retryAfter) {
          let after = Number(retryAfter) * 1000 + Date.now()

          if (Number.isNaN(after)) after = Date.parse(retryAfter)
          if (Number.isNaN(after) || after >= maxRetryAfter) break // invalid header or too long to wait

          if (after > 0) await delay(after - Date.now(), { signal: parentSignal }) // wait before retrying
        }
      }
    } finally {
      pool?.release()
    }
  }

  throw lastError
}

function collect<T>(input: PromiseSettledResult<T>[], errors: unknown[] = []): { values: T[]; errors?: unknown[] } {
  const values: T[] = []
  input.forEach((v) => {
    if (v.status === 'fulfilled') values.push(v.value)
    else errors.push(v.reason)
  })
  return errors.length ? { values, errors } : { values }
}

function deadline<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const c = new AbortController()
  const timeout = AbortSignal.timeout(ms)
  const abort = () => c.abort(timeout.reason)
  if (timeout.aborted) abort()
  timeout.addEventListener('abort', abort, { once: true })
  return p(c.signal).finally(() => {
    timeout.removeEventListener('abort', abort)
  })
}

// #endregion
