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

const pools = new Map<string, Semaphore>() // FIXME: memory leak - never released

// #endregion

// #region Wrapper

/**
 * Type of the values returned by {@link fetchAll}.\
 * If a schema is provided, the parsed and validated response body is returned.\
 * Otherwise, the `Response` object is returned.
 */
export type OutputOrResponse<Schema extends ZodType | undefined> = Schema extends ZodType ? Schema['_output'] : Response
/**
 * Type of the items yielded by {@link concurrentArrayFetcher}.\
 * If a schema is provided, the parsed and validated response body is returned.\
 * `source` can be `undefined` in certain cases, like if the deadline is exceeded.
 */
export type ResponseOrError<T, Schema extends ZodType | undefined> =
  | { source: T; success: true; data: OutputOrResponse<Schema>; error?: never }
  | { source?: T; success: false; data?: never; error: unknown }

/**
 * Options for {@link fetchAll}.
 */
export type FetchOptions<Schema extends ZodType | undefined = undefined> = {
  /**
   * The pool key to use for rate limiting.
   */
  key: string
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
 */
export async function fetchAll<Schema extends ZodType | undefined = undefined>(
  requests: Request[],
  options: FetchOptions<Schema>,
): Promise<{ values: OutputOrResponse<Schema>[]; errors?: unknown[] }> {
  const values: OutputOrResponse<Schema>[] = []
  const errors: unknown[] = []
  ;(await Array.fromAsync(concurrentArrayFetcher(requests, (req) => req, options)))
    .forEach((r) => r.success ? values.push(r.data) : errors.push(r.error))
  return errors.length ? { values, errors } : { values }
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
  { key, maxAttempts = 5, timeout = 10_000, deadline = 300_000, schema, concurrency = 64 }: FetchOptions<Schema>,
): AsyncGenerator<ResponseOrError<T, Schema>> {
  let pool = pools.get(key)
  if (!pool) pools.set(key, pool = new Semaphore(concurrency))

  const signal = AbortSignal.timeout(deadline)

  const queue = [...arr]
  const inProgress = new Set<Promise<void>>()

  const runTask = async (item: T) => {
    if (signal.aborted) return
    let result: ResponseOrError<T, Schema>

    try {
      await pool.acquire()

      const response = await _fetch(fn(item), { maxAttempts, timeout }, signal)
      const data = schema ? await response.json().then((json) => schema.parseAsync(json)) : response

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
    if (signal.aborted) {
      inProgress.clear()
      queue.length = 0
      yieldResult({ source: undefined, success: false, error: signal.reason })
      break
    }

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

async function _fetch(
  req: Request,
  { maxAttempts, timeout }: { maxAttempts: number; timeout: number },
  parentSignal?: AbortSignal,
  pool?: Semaphore,
): Promise<Response> {
  if (!idempotentMethods.has(req.method)) maxAttempts = 1
  const maxRetryAfter = Date.now() + maxAttempts * timeout

  let lastError: unknown

  while (maxAttempts-- > 0) {
    try {
      await pool?.acquire()

      const res = await deadline((signal) => {
        return fetch(req, { signal: AbortSignal.any([req.signal, signal, ...(parentSignal ? [parentSignal] : [])]) })
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

          const wait = after - Date.now()
          if (wait > 0) await delay(wait, { signal: parentSignal }) // wait before retrying
        }
      }

      //
    } finally {
      pool?.release()
    }
  }

  throw lastError
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
