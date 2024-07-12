/**
 * @module http
 *
 * @description
 * A collection of HTTP utilities.
 */

import { STATUS_TEXT, type StatusCode } from '@std/http'

// re-export everything from the standard HTTP module
export * from '@std/http'

/**
 * Creates a standard response with the given status code.
 * @param status The status code.
 * @param init The response init.
 * @returns The response.
 *
 * @example
 * ```ts
 * const response = createStandardResponse(STATUS_CODE.NotFound)
 * ```
 */
export function createStandardResponse(status: StatusCode, init?: ResponseInit): Response {
  const statusText = STATUS_TEXT[status]
  return new Response(statusText, { status, statusText, ...init })
}
