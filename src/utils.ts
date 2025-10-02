/**
 * A collection of utility functions.
 *
 * @module utils
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

/**
 * Type of the values returned by {@link fx.all}.\
 * If a schema is provided, the parsed and validated response body is returned.\
 * Otherwise, the `Response` object is returned.
 */
export type OutputOrResponse<Schema extends StandardSchemaV1 | undefined> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema>
  : Response

/**
 * Type of the items yielded by {@link fx.iter}.\
 * If a schema is provided, the parsed and validated response body is returned.
 */
export type ResponseOrError<T, Schema extends StandardSchemaV1 | undefined> =
  | { source: T; success: true; data: OutputOrResponse<Schema>; error?: never }
  | { source: T; success: false; data?: never; error: unknown }

/**
 * Options for {@link fx}.
 */
export type FetchOptions<Schema extends StandardSchemaV1 | undefined = undefined> = {
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
 * Type of the main fetch wrapper function {@link fx}.
 */
export type Fx = {
  <Schema extends StandardSchemaV1 | undefined = undefined>(
    request: Request,
    options: FetchOptions<Schema>,
  ): Promise<ResponseOrError<Request, Schema>>

  /**
   * Fetch multiple requests concurrently.
   *
   * This function takes an array of `Request` objects, fetches them all in parallel
   * (with concurrency control), and returns a promise for an array of all results.
   *
   * @example
   *
   * ```ts
   * import { z } from 'npm:zod'
   *
   * const TodoSchema = z.object({
   *   id: z.number(),
   *   todo: z.string(),
   *   completed: z.boolean(),
   *   userId: z.number(),
   * })
   *
   * const requests = [
   *   new Request('https://dummyjson.com/todos/1'),
   *   new Request('https://dummyjson.com/todos/2'),
   * ]
   * const { values, errors } = await fx.all(requests, {
   *   key: 'todos-api',
   *   schema: TodoSchema,
   * })
   *
   * if (errors) {
   *   console.error('Some requests failed:', errors)
   * } else {
   *   console.log('All todos:', values)
   * }
   * ```
   *
   * @template Schema An optional schema to validate the response body (for JSON responses).
   * @param requests An array of `Request` objects to fetch.
   * @param options Fetch options including a required pool key and optional schema, concurrency, timeout, and retry settings.
   * @returns A promise resolving to an array of result objects.
   */
  all: <Schema extends StandardSchemaV1 | undefined = undefined>(
    requests: Request[],
    options: FetchOptions<Schema>,
  ) => Promise<{ values: OutputOrResponse<Schema>[]; errors?: unknown[] }>

  /**
   * Fetch multiple requests concurrently, yielding results as they become available.
   *
   * This function provides an `AsyncIterableIterator` that yields results for each request as soon as it completes,
   * preserving high throughput and allowing you to process data as it streams in.
   * This is useful for a large number of requests where you don't want to wait for all of them to finish before processing.
   *
   * @example
   *
   * ```ts
   * import { z } from 'npm:zod'
   *
   * const TodoSchema = z.object({
   *   id: z.number(),
   *   todo: z.string(),
   *   completed: z.boolean(),
   *   userId: z.number(),
   * })
   *
   * const todoIds = [1, 2, 3]
   *
   * for await (const result of fx.iter(
   *   todoIds,
   *   (id) => new Request(`https://dummyjson.com/todos/${id}`),
   *   { key: 'todos-api', schema: TodoSchema },
   * )) {
   *   if (result.success) {
   *     console.log('Todo:', result.data)
   *   } else {
   *     console.error('Fetch error for id:', result.source, result.error)
   *   }
   * }
   * ```
   *
   * @template T The item type of the input array.
   * @template Schema An optional schema to validate the response body (for JSON responses).
   * @param items The array of items to be processed into requests.
   * @param toRequest A function that maps each item in `arr` to a `Request` object.
   * @param options Fetch options including a required pool key and optional schema, concurrency, timeout, and retry settings.
   * @returns An async iterable iterator yielding {@link ResponseOrError} objects as they become available.
   */
  iter: <T, Schema extends StandardSchemaV1 | undefined = undefined>(
    items: T[],
    toRequest: (item: T) => Request,
    options: FetchOptions<Schema>,
  ) => AsyncIterableIterator<ResponseOrError<T, Schema>>
}

// #endregion

// #region Classes

/**
 * An error that occurs during fetching requests.
 *
 * This error is thrown when the fetch request fails.\
 * It contains the original request and the response object.
 */
export class FetchError extends Error {
  constructor(readonly request: Request, readonly response: Response) {
    super(`[${request.method}] ${request.url} - ${response.status} ${response.statusText}`)
    Object.defineProperty(this, 'name', { value: 'FetchError' })
  }
}

/**
 * An error that occurs during schema validation.
 *
 * This error is thrown when the response body does not conform to the expected schema.\
 * It contains an array of issues that describe the validation errors.
 */
export class SchemaError extends Error {
  constructor(readonly issues: ReadonlyArray<StandardSchemaV1.Issue>) {
    super(issues[0]?.message)
    Object.defineProperty(this, 'name', { value: 'SchemaError' })
  }
}

/**
 * An error that occurs when a timeout is reached.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    Object.defineProperty(this, 'name', { value: 'TimeoutError' })
  }
}

/**
 * A passthrough stream that simply forwards chunks without modification.
 *
 * This is useful for creating a stream that does not alter the data,\
 * allowing it to be used in a pipeline without affecting the data flow.
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
 * This class allows a limited number of concurrent operations to proceed.\
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

/**
 * @deprecated Use `fx.all` instead.
 */
export async function fetchAll<Schema extends StandardSchemaV1 | undefined = undefined>(
  requests: Request[],
  options: FetchOptions<Schema>,
): Promise<{ values: OutputOrResponse<Schema>[]; errors?: unknown[] }> {
  const values: OutputOrResponse<Schema>[] = []
  const errors: unknown[] = []
  ;(await Array.fromAsync(concurrentArrayFetcher(requests, (req) => req, options)))
    .forEach((r) => (r.success ? values.push(r.data) : errors.push(r.error)))
  return errors.length ? { values, errors } : { values }
}

/**
 * @deprecated Use `fx.iter` instead.
 */
export function concurrentArrayFetcher<T, Schema extends StandardSchemaV1 | undefined = undefined>(
  items: T[],
  toRequest: (item: T) => Request,
  { key, maxAttempts = 5, timeout = 10_000, deadline = 300_000, schema, concurrency = 64 }: FetchOptions<Schema>,
): AsyncIterableIterator<ResponseOrError<T, Schema>> {
  //

  let pool = pools.get(key)
  if (!pool) pools.set(key, pool = new Semaphore(concurrency))
  pool.subscribers++

  const signal = timeoutSignal(deadline, `Deadline of ${deadline}ms exceeded`)

  const runTask = async (source: T) => {
    if (signal.aborted) return
    try {
      const response = await _fetch(toRequest(source), { maxAttempts, timeout }, signal)
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

    for (const source of items) {
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
      const res = await fetch(req, {
        signal: AbortSignal.any([
          req.signal,
          timeoutSignal(timeout, `Request timed out after ${timeout}ms`),
          ...(parentSignal ? [parentSignal] : []),
        ]),
      })

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

// #endregion

// #region Internals

const queueSystemTimer: (
  // deno-lint-ignore ban-types
  associatedOp: Function | undefined,
  repeat: boolean,
  delay: number,
  callback: () => void,
  // deno-lint-ignore no-explicit-any
) => number = (Deno as any)[(Deno as any).internal].core.queueSystemTimer
const timerId: unique symbol = Object.getOwnPropertySymbols(AbortSignal.timeout(0))
  // deno-lint-ignore no-explicit-any
  .find((s) => s.description === '[[timerId]]') as any
const signalAbort: unique symbol = Object.getOwnPropertySymbols(AbortSignal.prototype)
  // deno-lint-ignore no-explicit-any
  .find((s) => s.description === '[[signalAbort]]') as any

function timeoutSignal(ms: number, reason: string): AbortSignal {
  const signal = AbortSignal.timeout(Number.MAX_SAFE_INTEGER) as AbortSignal & {
    [timerId]: number | null
    [signalAbort]: (reason: unknown) => void
  }
  signal[timerId] != null && clearTimeout(signal[timerId])
  const error = new TimeoutError(reason)
  signal[timerId] = queueSystemTimer(
    undefined,
    false,
    ms,
    () => {
      signal[timerId] != null && clearTimeout(signal[timerId])
      signal[timerId] = null
      signal[signalAbort](error)
    },
  )
  signal[timerId] != null && Deno.unrefTimer(signal[timerId])
  return signal
}

// #endregion

// #region Wrapper

/**
 * A fetch wrapper with advanced features like pooling, retries, and timeouts.
 *
 * It provides three main functions for different use cases:
 *
 * - `fx`: For a single fetch request.
 * - `fx.all`: For fetching multiple requests concurrently and returning an array of all results.
 * - `fx.iter`: For fetching multiple requests concurrently, yielding results as they become available.
 *
 * All functions automatically handle rate limiting, retries, and timeouts.\
 * The pool is shared across all calls using the same `key`.
 *
 * @example
 *
 * ```ts
 * import { z } from 'npm:zod'
 *
 * const TodoSchema = z.object({
 *   id: z.number(),
 *   todo: z.string(),
 *   completed: z.boolean(),
 *   userId: z.number(),
 * })
 *
 * const request = new Request('https://dummyjson.com/todos/1')
 * const result = await fx(request, {
 *   key: 'todos-api',
 *   schema: TodoSchema,
 * })
 *
 * if (result.success) {
 *   // 'result.data' is now strongly typed based on TodoSchema
 *   console.log('Todo title:', result.data.todo)
 * } else {
 *   console.error('Fetch error:', result.error)
 * }
 * ```
 *
 * @template Schema An optional schema to validate the response body (for JSON responses).
 * @param request The request object to fetch.
 * @param options Fetch options including a required pool key and optional schema, concurrency, timeout, and retry settings.
 * @returns A promise resolving to a single result object.
 */
const fx: Fx = async (request, options) => {
  const result = await concurrentArrayFetcher([request], (r) => r, options).next()
  if (result.done) throw new Error('Unexpected end of iterator')
  return result.value
}
fx.all = fetchAll
fx.iter = concurrentArrayFetcher

export { fx }

// #endregion
