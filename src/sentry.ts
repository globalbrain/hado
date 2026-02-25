/**
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @module Sentry
 *
 * @example
 *
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
 *
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
 *
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

import type { Client, Integration, Options } from 'npm:@sentry/core@^10.40.0'
import {
  captureConsoleIntegration,
  type DenoOptions,
  extraErrorDataIntegration,
  getDefaultIntegrations as sentryGetDefaultIntegrations,
  init as sentryInit,
  zodErrorsIntegration,
} from 'npm:@sentry/deno@^10.40.0'

export * from 'npm:@sentry/deno@^10.40.0'

/**
 * Returns the default integrations for the Deno SDK.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/deno/configuration/integrations/#integrations
 *
 * On top of that list, it adds:
 * - `captureConsoleIntegration` for levels `['warn', 'error']`
 * - `extraErrorDataIntegration`
 * - `zodErrorsIntegration`
 */
export function getDefaultIntegrations(_options: Options): Integration[] {
  const integrations = sentryGetDefaultIntegrations(_options)
  return [
    ...integrations,
    captureConsoleIntegration({ levels: ['warn', 'error'] }),
    extraErrorDataIntegration(),
    zodErrorsIntegration(),
  ]
}

/**
 * Initializes the Sentry Deno SDK.
 */
export function init({
  dsn = Deno.env.get('SENTRY_DSN'),
  environment = Deno.env.get('SENTRY_ENVIRONMENT') || Deno.env.get('DENO_ENV'),
  defaultIntegrations,
  ...options
}: DenoOptions = {}): Client | undefined {
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
 * - widen zod error integration to support standard schema errors
 */
