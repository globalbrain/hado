/**
 * Credits:
 *
 * - next - MIT License
 *     Copyright (c) 2024 Vercel, Inc.
 *     https://github.com/vercel/next.js/blob/canary/license.md
 *     Relevant files:
 *       https://github.com/vercel/next.js/blob/d43a387d271263f2c1c4da6b9db826e382fc489c/test/unit/page-route-sorter.test.ts
 *
 * - fs-fixture - MIT License
 *     Copyright (c) Hiroki Osame <hiroki.osame@gmail.com>
 *     https://github.com/privatenumber/fs-fixture/blob/master/LICENSE
 */

import { assertEquals, dirname, getAvailablePort } from '../dev_deps.ts'
import { createRouter } from '../src/router.ts'

class TempDir {
  constructor(readonly path = Deno.makeTempDirSync({ dir: import.meta.dirname })) {}

  [Symbol.dispose]() {
    Deno.removeSync(this.path, { recursive: true })
  }
}

class Server {
  addr: Deno.NetAddr
  #ac = new AbortController()

  constructor(handler: Deno.ServeHandler) {
    this.addr = Deno.serve({ port: getAvailablePort(), signal: this.#ac.signal, onListen: () => {}, handler }).addr
  }

  [Symbol.dispose]() {
    this.#ac.abort()
  }
}

Deno.test('router', async (t) => {
  // #region Setup

  using temp = new TempDir()

  const files = [
    '/posts.ts',
    '/[root-slug].ts',
    '/index.ts',
    '/posts/[id].ts',
    '/(blog)/blog/[id]/comments/[cid].ts',
    '/(blog)/blog/abc/[id].ts',
    '/[...rest].ts',
    '/(blog)/blog/abc/post.ts',
    '/(blog)/blog/abc/index.ts',
    '/p1/[[...incl]].ts',
    '/p/[...rest].ts',
    '/p2/[...rest].ts',
    '/p2/[id].ts',
    '/p2/[id]/abc.ts',
    '/p3/[[...rest]].ts',
    '/p3/[id].ts',
    '/p3/[id]/abc.ts',
    '/(blog)/blog/[id].ts',
    '/foo/[d]/bar/baz/[f].ts',
    '/apples/[ab]/[cd]/ef.ts',
    '/foo bar.ts',
  ] as const

  for (const file of files) {
    const path = temp.path + file
    await Deno.mkdir(dirname(path), { recursive: true })
    await Deno.writeTextFile(
      path,
      `export function GET(_req: Request, params: Record<string, string | string[]>) { return new Response('GET ${file} = ' + JSON.stringify(params)) }`,
    )
  }

  const { handler } = await createRouter({ fsRoot: temp.path, urlRoot: 'api' })
  using server = new Server(handler)

  // #endregion

  const tests: Record<string, { file: (typeof files)[number]; params: Record<string, string | string[]> }> = {
    '/api/': { file: '/index.ts', params: {} },
    '/api/apples/1/2/ef': { file: '/apples/[ab]/[cd]/ef.ts', params: { ab: '1', cd: '2' } },
    '/api/blog/abc': { file: '/(blog)/blog/abc/index.ts', params: {} },
    '/api/blog/abc/post': { file: '/(blog)/blog/abc/post.ts', params: {} },
    '/api/blog/abc/1': { file: '/(blog)/blog/abc/[id].ts', params: { id: '1' } },
    '/api/blog/1': { file: '/(blog)/blog/[id].ts', params: { id: '1' } },
    '/api/blog/1/comments/2': { file: '/(blog)/blog/[id]/comments/[cid].ts', params: { id: '1', cid: '2' } },
    '/api/foo/1/bar/baz/2': { file: '/foo/[d]/bar/baz/[f].ts', params: { d: '1', f: '2' } },
    '/api/p/1/2/3': { file: '/p/[...rest].ts', params: { rest: ['1', '2', '3'] } },
    '/api/p1': { file: '/p1/[[...incl]].ts', params: { incl: [] } },
    '/api/p1/1/2/3': { file: '/p1/[[...incl]].ts', params: { incl: ['1', '2', '3'] } },
    '/api/p2/1': { file: '/p2/[id].ts', params: { id: '1' } },
    '/api/p2/1/abc': { file: '/p2/[id]/abc.ts', params: { id: '1' } },
    '/api/p2/1/2/3': { file: '/p2/[...rest].ts', params: { rest: ['1', '2', '3'] } },
    '/api/p3/1': { file: '/p3/[id].ts', params: { id: '1' } },
    '/api/p3/1/abc': { file: '/p3/[id]/abc.ts', params: { id: '1' } },
    '/api/p3': { file: '/p3/[[...rest]].ts', params: { rest: [] } },
    '/api/p3/1/2/3': { file: '/p3/[[...rest]].ts', params: { rest: ['1', '2', '3'] } },
    '/api/posts': { file: '/posts.ts', params: {} },
    '/api/posts/1': { file: '/posts/[id].ts', params: { id: '1' } },
    '/api/apples': { file: '/[root-slug].ts', params: { 'root-slug': 'apples' } },
    '/api/1/2/3': { file: '/[...rest].ts', params: { rest: ['1', '2', '3'] } },
    '/api/blog/1/2': { file: '/[...rest].ts', params: { rest: ['blog', '1', '2'] } },
    '/api/foo%20bar': { file: '/foo bar.ts', params: {} },
  }

  for (const [url, expected] of Object.entries(tests)) {
    await t.step(`lookup ${url}`, async () => {
      const res = await fetch(`http://${server.addr.hostname}:${server.addr.port}${url}`)
      const text = await res.text()

      assertEquals(res.status, 200)
      assertEquals(text, 'GET ' + expected.file + ' = ' + JSON.stringify(expected.params))
    })
  }

  await t.step('Non-existent handler returns 404', async () => {
    const res = await fetch(`http://${server.addr.hostname}:${server.addr.port}/api/`, { method: 'POST' })
    const text = await res.text()

    assertEquals(res.status, 404)
    assertEquals(text, 'Not Found')
  })

  await t.step('HEAD is implicitly handled', async () => {
    const res = await fetch(`http://${server.addr.hostname}:${server.addr.port}/api/`, { method: 'HEAD' })

    assertEquals(res.status, 200)
    assertEquals(res.headers.get('content-type'), 'text/plain;charset=UTF-8')
    assertEquals(res.headers.get('content-length'), null)
    assertEquals(res.headers.get('content-encoding'), null)
  })
})

// TODO: maybe use @std/testing/bdd and @std/expect for more familiar API
