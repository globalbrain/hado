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

import { abortable, deadline, delay, retry } from '@std/async'

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

/**
 * Options for {@link fetchAll}.
 */
export type FetchOptions = {
  /**
   * The pool key to use for rate limiting.\
   * If not provided, the host of the first request will be used.
   */
  pool?: string
  /**
   * The maximum number of attempts to make.\
   * Default: 5 attempts per request. (4 retries)
   */
  retry?: number
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
 * @returns The responses for each request.
 *
 * @throws {AggregateError} If any request fails.
 * @throws {import('@std/async').DeadlineError} If the deadline is exceeded.
 */
export async function fetchAll(requests: Request[], options: FetchOptions = {}): Promise<Response[]> {
  const key = options.pool ?? URL.parse(requests[0]!.url)?.host
  if (!key) throw new Error('No pool key provided')

  let pool = pools.get(key)
  if (!pool) pools.set(key, pool = new Semaphore(64))

  const p = Promise.allSettled(requests.map((req) => _fetch(req, options, pool)))
  const res = await deadline(p, options.deadline ?? 300_000) // 5 minutes

  const errors = res.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason)
  if (errors.length) throw new AggregateError(errors)

  return res.map((r) => (r as PromiseFulfilledResult<Response>).value)
}

// #endregion

// #region Logic

const retryMethods = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'])
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

function _fetch(req: Request, options: Pick<FetchOptions, 'retry' | 'timeout'>, pool: Semaphore): Promise<Response> {
  const c = new AbortController()

  const p = retry(async () => {
    await pool.acquire()

    try {
      const res = await deadline(fetch(req), options.timeout ?? 10_000)

      if (res.ok) return res
      throw new FetchError(req, res)

      //
    } catch (error: unknown) {
      if (!retryMethods.has(req.method)) return c.abort(error) // don't retry

      if (error instanceof FetchError && retryStatusCodes.has(error.response.status)) {
        const retryAfter = error.response.headers.get('Retry-After')

        if (retryAfter) {
          let after = Number(retryAfter)

          if (Number.isNaN(after)) after = Date.parse(retryAfter) - Date.now()
          else after *= 1000

          if (after > 60_000) return c.abort(error) // too long, don't retry
          if (after > 0) await delay(after)
        }
      }

      throw error

      //
    } finally {
      pool.release()
    }

    //
  }, { maxAttempts: options.retry ?? 5 })

  return abortable(p, c.signal) as Promise<Exclude<Awaited<typeof p>, void>>
}

// #endregion
