/**
 * @module Sentry
 *
 * @description
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```ts
 * import { init } from 'jsr:@globalbrain/hado/sentry'
 *
 * init({
 *   dsn: '__DSN__', // if left empty, will use `SENTRY_DSN` env var
 *   environment: 'production', // if left empty, will use `SENTRY_ENVIRONMENT` or `DENO_ENV` env var
 *   // other options...
 * })
 *
 * // ^ better to do this inside a separate script, and pass it as `--preload` to Deno
 * // https://deno.com/blog/v2.4#modify-the-deno-environment-with-the-new---preload-flag
 * ```
 *
 * @example
 * ```ts
 * import { addBreadcrumb } from 'jsr:@globalbrain/hado/sentry'
 *
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * })
 * ```
 *
 * @example
 * ```ts
 * import * as Sentry from 'jsr:@globalbrain/hado/sentry'
 *
 * Sentry.captureMessage('Hello, world!')
 * Sentry.captureException(new Error('Good bye'))
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * })
 * ```
 *
 * @see {@link DenoOptions} for documentation on configuration options.
 */

/**
 * Credits:
 *
 * - sentry-javascript - MIT License
 *     Copyright (c) 2012 Functional Software, Inc. dba Sentry
 *     https://github.com/getsentry/sentry-javascript/blob/develop/LICENSE
 */

import type {
  Client,
  Integration,
  IntegrationFn,
  Options,
  RequestEventData,
  SpanAttributes,
} from 'npm:@sentry/core@^9.36.0'
import {
  captureConsoleIntegration,
  captureException,
  continueTrace,
  type DenoOptions,
  extraErrorDataIntegration,
  getDefaultIntegrations as sentryGetDefaultIntegrations,
  init as sentryInit,
  requestDataIntegration,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  setHttpStatus,
  startSpan,
  withIsolationScope,
  zodErrorsIntegration,
} from 'npm:@sentry/deno@^9.36.0'

export * from 'npm:@sentry/deno@^9.36.0'

type RawHandler = (request: Request, info: Deno.ServeHandlerInfo) => Response | Promise<Response>

export const SEMANTIC_ATTRIBUTE_HTTP_REQUEST_METHOD = 'http.request.method'
export const SEMANTIC_ATTRIBUTE_URL_FULL = 'url.full'

/**
 * Instruments `Deno.serve` to automatically create transactions and capture errors.
 */
export const denoServerIntegration: IntegrationFn = () => {
  return {
    name: 'DenoServer',
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
 * Returns the default integrations for the Deno SDK.
 * @see https://docs.sentry.io/platforms/javascript/guides/deno/configuration/integrations/#integrations
 *
 * On top of that list, it adds:
 * - `requestDataIntegration`
 * - `denoServerIntegration`
 * - `captureConsoleIntegration` for levels `['warn', 'error']`
 * - `extraErrorDataIntegration`
 * - `zodErrorsIntegration`
 */
export function getDefaultIntegrations(_options: Options): Integration[] {
  const integrations = sentryGetDefaultIntegrations(_options)
  return [
    ...integrations,
    requestDataIntegration(),
    denoServerIntegration(),
    captureConsoleIntegration({ levels: ['warn', 'error'] }),
    extraErrorDataIntegration(),
    zodErrorsIntegration(),
  ]
}

/**
 * Initializes the Sentry Deno SDK.
 */
export function init(
  {
    dsn = Deno.env.get('SENTRY_DSN'),
    environment = Deno.env.get('SENTRY_ENVIRONMENT') || Deno.env.get('DENO_ENV'),
    defaultIntegrations,
    ...options
  }: DenoOptions = {},
): Client | undefined {
  if (!dsn) return undefined
  return sentryInit({
    dsn,
    environment,
    ...options,
    defaultIntegrations: defaultIntegrations ?? getDefaultIntegrations({}),
    ignoreErrors: [/^Listening on/, ...(options.ignoreErrors || [])],
  })
}

/**
 * TODO:
 * - remove when https://github.com/getsentry/sentry-javascript/pull/12460 is merged
 */
