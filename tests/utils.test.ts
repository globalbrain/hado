import { assert, assertEquals, assertInstanceOf, assertRejects } from 'jsr:@std/assert@^1.0.19'
import { FetchInterceptor } from 'npm:@mswjs/interceptors@^0.45.5/fetch/web'
import { type AnyHandler, delay, http, HttpResponse } from 'npm:msw@3.0.0'
import { defineNetwork, InterceptorSource } from 'npm:msw@3.0.0/experimental'
import { z } from 'npm:zod@4.6.5'
import { FetchError, fx, SchemaError } from '../src/utils.ts'

class Network {
  #network = defineNetwork({
    sources: [new InterceptorSource({ interceptors: [new FetchInterceptor() as never] })],
    onUnhandledFrame: 'error',
    context: { quiet: true },
  })

  constructor() {
    this.#network.enable()
  }

  [Symbol.dispose]() {
    this.#network.disable()
  }

  use(...handlers: AnyHandler[]): Disposable {
    this.#network.use(...handlers)
    return { [Symbol.dispose]: () => this.#network.resetHandlers() }
  }
}

const baseOptions = {
  key: 'todos',
  schema: z.object({
    id: z.number(),
    todo: z.string(),
  }),
}

Deno.test('utils', async (t) => {
  // #region Setup
  using network = new Network()
  // #endregion

  await t.step('fx', async (t) => {
    await t.step('handles a successful single request', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.json({ id: 1, todo: 'Todo 1' }),
        ),
      )

      const request = new Request('https://example.com/todos/1')
      const result = await fx(request, baseOptions)

      assert(result.success)
      assertEquals(result.data.todo, 'Todo 1')
    })

    await t.step('handles a failed single request', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/999',
          () => HttpResponse.text('Not Found', { status: 404 }),
        ),
      )

      const request = new Request('https://example.com/todos/999')
      const result = await fx(request, baseOptions)

      assert(!result.success)
      assertInstanceOf(result.error, FetchError)
      assertEquals(result.error.response.status, 404)
    })

    await t.step('retries on transient error', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.text('Internal Server Error', { status: 500 }),
          { once: true },
        ),
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.json({ id: 1, todo: 'Todo 1' }),
        ),
      )

      const request = new Request('https://example.com/todos/1')
      const result = await fx(request, { ...baseOptions, maxAttempts: 2 })

      assert(result.success)
    })

    await t.step('replays the request body when retrying', async () => {
      const bodies: string[] = []

      using _ = network.use(
        http.put(
          'https://example.com/todos/1',
          async ({ request }) => {
            bodies.push(await request.text())
            return HttpResponse.text('Service Unavailable', { status: 503 })
          },
          { once: true },
        ),
        http.put(
          'https://example.com/todos/1',
          async ({ request }) => {
            bodies.push(await request.text())
            return HttpResponse.json({ id: 1, todo: 'Todo 1' })
          },
        ),
      )

      const request = new Request('https://example.com/todos/1', { method: 'PUT', body: 'Todo 1' })
      const result = await fx(request, baseOptions)

      assert(result.success)
      assertEquals(bodies, ['Todo 1', 'Todo 1'])
    })

    await t.step('reports the failed response when retries of a request with a body are exhausted', async () => {
      let attempts = 0

      using _ = network.use(
        http.put(
          'https://example.com/todos/1',
          () => {
            attempts++
            return HttpResponse.text('Service Unavailable', { status: 503 })
          },
        ),
      )

      const request = new Request('https://example.com/todos/1', { method: 'PUT', body: 'Todo 1' })
      const result = await fx(request, { ...baseOptions, maxAttempts: 3 })

      assert(!result.success)
      assertInstanceOf(result.error, FetchError) // and not a TypeError about the body being unusable
      assertEquals(result.error.response.status, 503)
      assertEquals(attempts, 3)
    })

    await t.step('handles schema validation error', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.json({ id: 'invalid', todo: 123 }),
        ),
      )

      const request = new Request('https://example.com/todos/1')
      const result = await fx(request, baseOptions)

      assert(!result.success)
      assertInstanceOf(result.error, SchemaError)
      assertEquals(result.error.issues.length, 2) // id and todo are wrong
    })

    await t.step('handles timeout', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          async () => {
            await delay(100) // Simulate a long response
            return HttpResponse.json({ id: 1, todo: 'Todo 1' })
          },
        ),
      )

      const request = new Request('https://example.com/todos/1')
      const result = await fx(request, { ...baseOptions, deadline: 50 }) // Set a short deadline

      assert(!result.success)
      assertInstanceOf(result.error, Error)
      assertEquals(result.error.name, 'TimeoutError')
      assertEquals(result.error.message, 'Deadline of 50ms exceeded')
    })

    await t.step('waits for retry-after before retrying', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.text('Service Unavailable', { status: 503, headers: { 'Retry-After': '1' } }),
          { once: true },
        ),
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.json({ id: 1, todo: 'Todo 1' }),
        ),
      )

      const request = new Request('https://example.com/todos/1')

      const startTime = Date.now()
      const result = await fx(request, baseOptions)
      const elapsedTime = Date.now() - startTime

      assert(result.success)
      // Retry-After is 1s, so the second attempt should only start after that. We give it a generous buffer.
      assert(elapsedTime > 900 && elapsedTime < 2000)
    })

    await t.step('stops waiting for retry-after when the request is aborted', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.text('Service Unavailable', { status: 503, headers: { 'Retry-After': '5' } }),
        ),
      )

      const controller = new AbortController()
      const request = new Request('https://example.com/todos/1', { signal: controller.signal })
      setTimeout(() => controller.abort(), 50)

      const startTime = Date.now()
      const result = await fx(request, baseOptions)
      const elapsedTime = Date.now() - startTime

      assert(!result.success)
      assertInstanceOf(result.error, Error)
      assertEquals(result.error.name, 'AbortError')
      assert(elapsedTime < 1000)
    })

    await t.step('rejects a non-positive concurrency', async () => {
      const request = new Request('https://example.com/todos/1')

      for (const concurrency of [0, -1, NaN]) {
        await assertRejects(
          () => fx(request, { ...baseOptions, concurrency }),
          RangeError,
          "'concurrency' must be a positive number",
        )
      }
    })
  })

  await t.step('fx.all', async (t) => {
    await t.step('handles all successful requests', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.json({ id: 1, todo: 'Todo 1' }),
        ),
        http.get(
          'https://example.com/todos/2',
          () => HttpResponse.json({ id: 2, todo: 'Todo 2' }),
        ),
      )

      const requests = [
        new Request('https://example.com/todos/1'),
        new Request('https://example.com/todos/2'),
      ]

      const { values, errors } = await fx.all(requests, baseOptions)

      assertEquals(values.length, 2)
      assert(!errors)
      assertEquals(values[0]?.id, 1)
      assertEquals(values[1]?.todo, 'Todo 2')
    })

    await t.step('handles a mix of success and failure', async () => {
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.json({ id: 1, todo: 'Todo 1' }),
        ),
        http.get(
          'https://example.com/todos/999',
          () => HttpResponse.text('Not Found', { status: 404 }),
        ),
      )

      const requests = [
        new Request('https://example.com/todos/1'),
        new Request('https://example.com/todos/999'),
      ]

      const { values, errors } = await fx.all(requests, baseOptions)

      assertEquals(values.length, 1)
      assertEquals(errors?.length, 1)
    })

    await t.step('respects concurrency limits', async () => {
      // We'll use delays to ensure concurrency is working as expected.
      // With concurrency: 2, the first two requests should start immediately,
      // while the third one waits.
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          async () => {
            await delay(50)
            return HttpResponse.json({ id: 1, todo: 'Todo 1' })
          },
        ),
        http.get(
          'https://example.com/todos/2',
          async () => {
            await delay(50)
            return HttpResponse.json({ id: 2, todo: 'Todo 2' })
          },
        ),
        http.get(
          'https://example.com/todos/3',
          async () => {
            await delay(50)
            return HttpResponse.json({ id: 3, todo: 'Todo 3' })
          },
        ),
      )

      const requests = [
        new Request('https://example.com/todos/1'),
        new Request('https://example.com/todos/2'),
        new Request('https://example.com/todos/3'),
      ]

      const startTime = Date.now()
      await fx.all(requests, { ...baseOptions, concurrency: 2 })
      const endTime = Date.now()

      const elapsedTime = endTime - startTime
      // With 2 requests in parallel (50ms each) and a third waiting, the total time
      // should be roughly 100ms. We give it a generous buffer.
      assert(elapsedTime > 90 && elapsedTime < 150)
    })
  })

  await t.step('fx.iter', async (t) => {
    await t.step('yields results as they complete', async () => {
      const items = [1, 2, 3]

      // We set a delay for '1' to ensure '2' and '3' finish first
      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          async () => {
            await delay(50)
            return HttpResponse.json({ id: 1, todo: 'Todo 1' })
          },
        ),
        http.get(
          'https://example.com/todos/2',
          async () => {
            await delay(10)
            return HttpResponse.json({ id: 2, todo: 'Todo 2' })
          },
        ),
        http.get(
          'https://example.com/todos/3',
          async () => {
            await delay(30)
            return HttpResponse.json({ id: 3, todo: 'Todo 3' })
          },
        ),
      )

      const toRequest = (item: number) => new Request(`https://example.com/todos/${item}`)
      const iterator = fx.iter(items, toRequest, { ...baseOptions, concurrency: 3 })

      const results: number[] = []
      for await (const result of iterator) {
        if (result.success) {
          results.push(result.data.id)
        }
      }

      // The order of results should be based on completion time, not request order
      assertEquals(results, [2, 3, 1])
    })

    await t.step('handles errors within the iterator', async () => {
      const items = [1, 2, 3]

      using _ = network.use(
        http.get(
          'https://example.com/todos/1',
          () => HttpResponse.json({ id: 1, todo: 'Todo 1' }), // Success
        ),
        http.get(
          'https://example.com/todos/2',
          () => HttpResponse.text('Server Error', { status: 500 }), // Failure
        ),
        http.get(
          'https://example.com/todos/3',
          () => HttpResponse.json({ id: 3, todo: 'Todo 3' }), // Success
        ),
      )

      const toRequest = (id: number) => new Request(`https://example.com/todos/${id}`)
      const iterator = fx.iter(items, toRequest, baseOptions)

      const successes: number[] = []
      const errors: unknown[] = []

      for await (const result of iterator) {
        if (result.success) {
          successes.push(result.data.id)
        } else {
          errors.push(result.error)
        }
      }

      assertEquals(successes, [1, 3])
      assertEquals(errors.length, 1)
      assertInstanceOf(errors[0], FetchError)
    })
  })
})
