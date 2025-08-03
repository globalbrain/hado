/**
 * @module utils
 *
 * @description
 * A collection of utility functions.
 */

/**
 * Credits:
 *
 * - undici - MIT License
 *     Copyright (c) Matteo Collina and Undici contributors
 *     https://github.com/nodejs/undici/blob/main/LICENSE
 *     Relevant files:
 *       https://github.com/nodejs/undici/blob/5f11247b34510a3dc821da3c10d3cea0f39a7b13/lib/handler/retry-handler.js
 *
 * - deno_std - MIT License
 *     Copyright 2018-2025 the Deno authors.
 *     https://github.com/denoland/std/blob/main/LICENSE
 *     Relevant files:
 *       https://github.com/denoland/std/blob/89d4ba448c68a20216b753d16d26e81e80a8dd6a/async/pool.ts
 *
 * - standard-schema - MIT License
 *     Copyright (c) 2024 Fabian Hiller
 *     https://github.com/standard-schema/standard-schema/blob/main/packages/utils/LICENSE
 *     Relevant files:
 *       https://github.com/standard-schema/standard-schema/blob/a9d5e3522259f70938a5b0c125a19d671c975fd9/packages/utils/src/SchemaError/SchemaError.ts
 */

import type { StandardSchemaV1 } from 'jsr:@standard-schema/spec@1.0.0'
import { delay } from 'jsr:@std/async@^1.0.14/delay'

// #region Types

export type OutputOrResponse<Schema extends StandardSchemaV1 | undefined> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : Response

export type ResponseOrError<T, Schema extends StandardSchemaV1 | undefined> =
  | { source: T; success: true; data: OutputOrResponse<Schema>; error?: never }
  | { source: T; success: false; data?: never; error: unknown }

export interface FetchOptions<Schema extends StandardSchemaV1 | undefined = undefined> {
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

export interface Fx {
  <Schema extends StandardSchemaV1 | undefined = undefined>(
    input: Request,
    options: FetchOptions<Schema>,
  ): Promise<ResponseOrError<Request, Schema>>

  all: <Schema extends StandardSchemaV1 | undefined = undefined>(
    inputs: Request[],
    options: FetchOptions<Schema>,
  ) => Promise<{ values: OutputOrResponse<Schema>[]; errors?: unknown[] }>

  iter: <T, Schema extends StandardSchemaV1 | undefined = undefined>(
    input: T[],
    toRequest: (item: T) => Request,
    options: FetchOptions<Schema>,
  ) => AsyncIterableIterator<ResponseOrError<T, Schema>>
}

// #endregion

// #region Classes

/**
 * An error that occurs during schema validation.
 *
 * This error is thrown when the response body does not conform to the expected schema.
 * It contains an array of issues that describe the validation errors.
 */
export class SchemaError extends Error {
  constructor(readonly issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(issues[0]?.message)
    this.name = 'SchemaError'
  }
}

/**
 * An error that occurs during fetching requests.
 *
 * This error is thrown when the fetch request fails.
 * It contains the original request and the response object.
 */
export class FetchError extends Error {
  constructor(readonly request: Request, readonly response: Response) {
    super(`[${request.method}] ${request.url} - ${response.status} ${response.statusText}`)
    this.name = 'FetchError'
  }
}

/**
 * A passthrough stream that simply forwards chunks without modification.
 */
class PassThroughStream<T> extends TransformStream<T, T> {
  constructor() {
    super({
      transform(chunk, controller) {
        if (chunk !== undefined) controller.enqueue(chunk)
      },
    })
  }
}

/**
 * A semaphore implementation for controlling concurrency.
 *
 * This class allows a limited number of concurrent operations to proceed.
 * It maintains a queue of waiting operations and releases them when capacity is available.
 */
class Semaphore {
  subscribers = 0
  private queue: (() => void)[] = []

  constructor(private capacity: number) {}

  // deno-lint-ignore require-await
  async acquire(): Promise<void> {
    if (this.capacity > 0) this.capacity--
    else return new Promise((resolve) => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) next()
    else this.capacity++
  }
}

// #endregion

// #region Logic

const pools = new Map<string, Semaphore>()
const idempotentMethods = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE'])
const transientStatusCodes = new Set([408, 429, 500, 502, 503, 504])

function concurrentArrayFetcher<T, Schema extends StandardSchemaV1 | undefined = undefined>(
  arr: T[],
  fn: (item: T) => Request,
  { key, maxAttempts = 5, timeout = 10_000, deadline = 300_000, schema, concurrency = 64 }: FetchOptions<Schema>,
): AsyncIterableIterator<ResponseOrError<T, Schema>> {
  //

  let pool = pools.get(key)
  if (!pool) pools.set(key, pool = new Semaphore(concurrency))
  pool.subscribers++

  const signal = AbortSignal.timeout(deadline)

  const runTask = async (source: T) => {
    if (signal.aborted) return
    try {
      const response = await _fetch(fn(source), { maxAttempts, timeout }, signal)
      // deno-lint-ignore no-explicit-any
      let data: any = response
      if (schema) {
        const result = await response.json().then((json) => schema['~standard'].validate(json))
        if (result.issues) throw new SchemaError(result.issues)
        data = result.value
      }
      return { source, success: true as const, data }
    } catch (error) {
      return { source, success: false as const, error }
    } finally {
      pool.release()
    }
  }

  const res = new PassThroughStream<ResponseOrError<T, Schema>>()

  void (async () => {
    const writer = res.writable.getWriter()
    const executing: Array<Promise<void>> = []

    for (const source of arr) {
      if (signal.aborted) {
        writer.write({ source, success: false, error: signal.reason })
        break
      }
      await pool.acquire()
      const p = runTask(source).then((res) => {
        writer.write(res)
      })
      const e = p.then(() => {
        executing.splice(executing.indexOf(e), 1)
      })
      executing.push(e)
    }

    await Promise.all(executing)
    writer.close()
    if (--pool.subscribers === 0) pools.delete(key)
  })()

  return res.readable[Symbol.asyncIterator]()
}

async function _fetch(
  req: Request,
  { maxAttempts, timeout }: { maxAttempts: number; timeout: number },
  parentSignal?: AbortSignal,
): Promise<Response> {
  if (!idempotentMethods.has(req.method)) maxAttempts = 1
  const maxRetryAfter = Date.now() + maxAttempts * timeout

  let lastError: unknown

  while (maxAttempts-- > 0) {
    try {
      const res = await deadline(
        (signal) => fetch(req, { signal: AbortSignal.any([req.signal, signal]) }),
        timeout,
        parentSignal,
      )

      if (res.ok) return res
      throw new FetchError(req, res)

      //
    } catch (error: unknown) {
      lastError = error

      if (maxAttempts <= 0 || parentSignal?.aborted) break // no more attempts left or outer deadline exceeded

      if (error instanceof FetchError && transientStatusCodes.has(error.response.status)) {
        const header = error.response.headers.get('Retry-After')

        if (header) {
          let wait = Number(header) * 1000

          if (Number.isNaN(wait)) wait = Date.parse(header) - Date.now()
          if (Number.isNaN(wait) || Date.now() + wait >= maxRetryAfter) break // invalid header or too long to wait

          if (wait > 0) await delay(wait, { signal: parentSignal }) // wait before retrying
        }
      }
    }
  }

  throw lastError
}

function deadline<T>(p: (signal: AbortSignal) => Promise<T>, ms: number, parentSignal?: AbortSignal): Promise<T> {
  const c = new AbortController()
  const timeout = AbortSignal.any([AbortSignal.timeout(ms), ...(parentSignal ? [parentSignal] : [])])
  const abort = () => c.abort(timeout.reason)
  if (timeout.aborted) abort()
  timeout.addEventListener('abort', abort, { once: true })
  return p(c.signal).finally(() => {
    timeout.removeEventListener('abort', abort)
  })
}

// #endregion

// #region Wrapper

const fx: Fx = async (input, options) => {
  const iterator = concurrentArrayFetcher([input], (r) => r, options)
  for await (const result of iterator) return result
  throw new Error('Unreachable')
}

fx.all = async <Schema extends StandardSchemaV1 | undefined = undefined>(
  inputs: Request[],
  options: FetchOptions<Schema>,
) => {
  const values: OutputOrResponse<Schema>[] = []
  const errors: unknown[] = []
  ;(await Array.fromAsync(concurrentArrayFetcher(inputs, (r) => r, options)))
    .forEach((r) => r.success ? values.push(r.data) : errors.push(r.error))
  return errors.length ? { values, errors } : { values }
}

fx.iter = concurrentArrayFetcher

export { fx }

// #endregion
