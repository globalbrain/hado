/**
 * @module sentry
 *
 * @description
 * Deno server integration for Sentry.
 *
 * This file is not published to JSR because of restrictions on https imports.
 * Import this file directly in your Deno server application:
 *
 * ```ts
 * import { init } from 'https://raw.githubusercontent.com/globalbrain/hado/v<version>/src/sentry.ts'
 *
 * init()
 * ```
 */

import type { Client, IntegrationFn, RequestEventData, SpanAttributes } from 'https://esm.sh/@sentry/core@9.5.0'
import {
  captureConsoleIntegration,
  captureException,
  continueTrace,
  init as sentryInit,
  requestDataIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startSpan,
  withIsolationScope,
} from '../vendor/sentry/index.mjs'

export * as Sentry from '../vendor/sentry/index.mjs'

type RawHandler = (request: Request, info: Deno.ServeHandlerInfo) => Response | Promise<Response>

export const SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD = 'http.request.method'
export const SEMANTIC_ATTRIBUTE_URL_FULL = 'url.full'
export const SEMANTIC_ATTRIBUTE_SENTRY_OP = 'sentry.op'

export const INTEGRATION_NAME = 'DenoServer'

/**
 * Instruments `Deno.serve` to automatically create transactions and capture errors.
 */
export const denoServerIntegration: IntegrationFn = () => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentDenoServe()
    },
  }
}

/**
 * Instruments Deno.serve by patching it's options.
 */
export function instrumentDenoServe(): void {
  Deno.serve = new Proxy(Deno.serve, {
    apply(serveTarget, serveThisArg, serveArgs: unknown[]) {
      const [arg1, arg2] = serveArgs

      if (typeof arg1 === 'function') {
        serveArgs[0] = instrumentDenoServeOptions(arg1 as RawHandler)
      } else if (typeof arg2 === 'function') {
        serveArgs[1] = instrumentDenoServeOptions(arg2 as RawHandler)
      } else if (
        arg1 &&
        typeof arg1 === 'object' &&
        'handler' in arg1 &&
        typeof arg1.handler === 'function'
      ) {
        arg1.handler = instrumentDenoServeOptions(arg1.handler as RawHandler)
      }

      return serveTarget.apply(serveThisArg, serveArgs as Parameters<typeof Deno.serve>)
    },
  })
}

/**
 * Instruments Deno.serve handler to automatically create spans and capture errors.
 */
function instrumentDenoServeOptions(handler: RawHandler): RawHandler {
  return new Proxy(handler, {
    apply(handlerTarget, handlerThisArg, handlerArgs: Parameters<RawHandler>) {
      return withIsolationScope((isolationScope) => {
        isolationScope.clear()

        const request = handlerArgs[0]
        if (request.method === 'OPTIONS' || request.method === 'HEAD') {
          return handlerTarget.apply(handlerThisArg, handlerArgs)
        }

        const parsedUrl = new URL(request.url)
        const attributes: SpanAttributes = {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.deno.serve',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
          [SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD]: request.method,
          [SEMANTIC_ATTRIBUTE_URL_FULL]: request.url,
        }

        const url = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`

        isolationScope.setSDKProcessingMetadata({
          normalizedRequest: {
            url,
            method: request.method,
            headers: Object.fromEntries(request.headers),
            query_string: parsedUrl.search.slice(1) || undefined,
          } satisfies RequestEventData,
        })

        return continueTrace(
          {
            sentryTrace: request.headers.get('sentry-trace') || '',
            baggage: request.headers.get('baggage'),
          },
          () => {
            return startSpan(
              {
                attributes,
                op: 'http.server',
                name: `${request.method} ${parsedUrl.pathname || '/'}`,
              },
              async (span) => {
                try {
                  const response = await (handlerTarget.apply(
                    handlerThisArg,
                    handlerArgs,
                  ) as ReturnType<RawHandler>)

                  if (response?.status) {
                    setHttpStatus(span, response.status)
                    isolationScope.setContext('response', {
                      headers: Object.fromEntries(response.headers),
                      status_code: response.status,
                    })
                  }

                  return response
                } catch (e) {
                  captureException(e, {
                    mechanism: { type: 'deno', handled: false, data: { function: 'serve' } },
                  })

                  throw e
                }
              },
            )
          },
        )
      })
    },
  })
}

/**
 * Opinionated initialization of the Sentry Deno SDK.
 * You can directly import `denoServerIntegration` if you want to customize the setup.
 */
export function init(
  dsn: string | undefined = Deno.env.get('SENTRY_DSN'),
  environment: string | undefined = Deno.env.get('SENTRY_ENVIRONMENT') || Deno.env.get('DENO_ENV'),
): Client | undefined {
  if (!dsn) return undefined
  return sentryInit({
    dsn,
    environment,
    integrations: [
      requestDataIntegration(),
      denoServerIntegration(),
      captureConsoleIntegration({ levels: ['warn', 'error'] }),
    ],
    ignoreErrors: [/^Listening on/],
  })
}

/**
 * TODO:
 * - remove when https://github.com/getsentry/sentry-javascript/pull/12460 is merged
 */
