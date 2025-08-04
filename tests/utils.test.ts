import { delay, http, HttpResponse } from 'npm:msw@2.10.4'
import { setupServer, type SetupServerApi } from 'npm:msw@2.10.4/node'
import { assert, assertEquals, assertInstanceOf, z } from '../dev_deps.ts'
import { FetchError, fx, SchemaError } from '../src/utils.ts'

class ServerManager {
  #server: SetupServerApi

  constructor() {
    this.#server = setupServer()
    this.#server.listen({ onUnhandledRequest: 'bypass' })
  }

  [Symbol.dispose]() {
    this.#server.close()
  }

  get server() {
    return this.#server
  }
}

const TodoSchema = z.object({
  id: z.number(),
  todo: z.string(),
  completed: z.boolean(),
  userId: z.number(),
})

Deno.test('utils', async (t) => {
  // #region Setup
  using serverManager = new ServerManager()
  const server = serverManager.server
  // #endregion

  await t.step('fx', async (t) => {
    await t.step(
      'handles a successful single request',
      server.boundary(async () => {
        server.use(
          http.get(
            'https://example.com/todos/1',
            () => HttpResponse.json({ id: 1, todo: 'Test', completed: false, userId: 1 }),
          ),
        )

        const request = new Request('https://example.com/todos/1')
        const options = { key: 'todos-api', schema: TodoSchema }

        const result = await fx(request, options)

        assert(result.success)
        assertEquals(result.data.todo, 'Test')
      }),
    )

    await t.step(
      'handles a failed single request',
      server.boundary(async () => {
        server.use(
          http.get(
            'https://example.com/todos/999',
            () => HttpResponse.text('Not Found', { status: 404 }),
          ),
        )

        const request = new Request('https://example.com/todos/999')
        const options = { key: 'todos-api' }

        const result = await fx(request, options)

        assert(!result.success)
        assertInstanceOf(result.error, FetchError)
        assertEquals(result.error.response.status, 404)
      }),
    )

    await t.step(
      'retries on transient error',
      server.boundary(async () => {
        server.use(
          http.get(
            'https://example.com/todos/1',
            () => HttpResponse.error(),
            { once: true },
          ),
          http.get(
            'https://example.com/todos/1',
            () => HttpResponse.json({ id: 1, todo: 'Test', completed: false, userId: 1 }),
          ),
        )

        const request = new Request('https://example.com/todos/1')
        const options = { key: 'todos-api', maxAttempts: 2 }

        const result = await fx(request, options)

        assert(result.success)
      }),
    )

    await t.step(
      'handles schema validation error',
      server.boundary(async () => {
        server.use(
          http.get(
            'https://example.com/todos/1',
            () => HttpResponse.json({ id: 'invalid', todo: 123, completed: false, userId: 1 }),
          ),
        )

        const request = new Request('https://example.com/todos/1')
        const options = { key: 'todos-api', schema: TodoSchema }

        const result = await fx(request, options)

        assert(!result.success)
        assertInstanceOf(result.error, SchemaError)
        assertEquals(result.error.issues.length, 2) // id and todo are wrong
      }),
    )

    await t.step(
      'handles timeout',
      server.boundary(async () => {
        server.use(
          http.get(
            'https://example.com/todos/1',
            async () => {
              await delay(100) // Simulate a long response
              return HttpResponse.json({ id: 1, todo: 'Test', completed: false, userId: 1 })
            },
          ),
        )

        const request = new Request('https://example.com/todos/1')
        const options = { key: 'todos-api', deadline: 50 } // Set a short deadline

        const result = await fx(request, options)

        assert(!result.success)
        assertInstanceOf(result.error, Error)
        assertEquals(result.error.name, 'TimeoutError')
      }),
    )
  })

  await t.step('fx.all', async (t) => {
    await t.step(
      'handles all successful requests',
      server.boundary(async () => {
        server.use(
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
        const options = { key: 'todos-api', schema: z.object({ id: z.number(), todo: z.string() }) }

        const { values, errors } = await fx.all(requests, options)

        assertEquals(values.length, 2)
        assert(!errors)
        assertEquals(values[0]?.id, 1)
        assertEquals(values[1]?.todo, 'Todo 2')
      }),
    )

    await t.step(
      'handles a mix of success and failure',
      server.boundary(async () => {
        server.use(
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
        const options = { key: 'todos-api' }

        const { values, errors } = await fx.all(requests, options)

        assertEquals(values.length, 1)
        assertEquals(errors?.length, 1)
      }),
    )

    await t.step(
      'respects concurrency limits',
      server.boundary(async () => {
        // We'll use delays to ensure concurrency is working as expected.
        // With concurrency: 2, the first two requests should start immediately,
        // while the third one waits.
        server.use(
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
        const options = { key: 'todos-api-concurrency', concurrency: 2 }

        const startTime = Date.now()
        await fx.all(requests, options)
        const endTime = Date.now()

        const elapsedTime = endTime - startTime
        // With 2 requests in parallel (50ms each) and a third waiting, the total time
        // should be roughly 100ms. We give it a generous buffer.
        assert(elapsedTime > 90 && elapsedTime < 150)
      }),
    )
  })

  await t.step('fx.iter', async (t) => {
    await t.step(
      'yields results as they complete',
      server.boundary(async () => {
        const items = [1, 2, 3]

        // We set a delay for '1' to ensure '2' and '3' finish first
        server.use(
          http.get(
            'https://example.com/todos/1',
            async () => {
              await delay(50)
              return HttpResponse.json({ id: 1 })
            },
          ),
          http.get(
            'https://example.com/todos/2',
            async () => {
              await delay(10)
              return HttpResponse.json({ id: 2 })
            },
          ),
          http.get(
            'https://example.com/todos/3',
            async () => {
              await delay(30)
              return HttpResponse.json({ id: 3 })
            },
          ),
        )

        const options = { key: 'todos-api-iter', concurrency: 3, schema: z.object({ id: z.number() }) }
        const toRequest = (item: number) => new Request(`https://example.com/todos/${item}`)
        const iterator = fx.iter(items, toRequest, options)

        const results: number[] = []
        for await (const result of iterator) {
          if (result.success) {
            results.push(result.data.id)
          }
        }

        // The order of results should be based on completion time, not request order
        assertEquals(results, [2, 3, 1])
      }),
    )

    await t.step(
      'handles errors within the iterator',
      server.boundary(async () => {
        const items = [1, 2, 3]

        server.use(
          http.get(
            'https://example.com/todos/1',
            () => HttpResponse.json({ id: 1 }), // Success
          ),
          http.get(
            'https://example.com/todos/2',
            () => HttpResponse.text('Server Error', { status: 500 }), // Failure
          ),
          http.get(
            'https://example.com/todos/3',
            () => HttpResponse.json({ id: 3 }), // Success
          ),
        )

        const options = { key: 'todos-api-iter-err', schema: z.object({ id: z.number() }) }
        const toRequest = (id: number) => new Request(`https://example.com/todos/${id}`)
        const iterator = fx.iter(items, toRequest, options)

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
      }),
    )
  })
})
