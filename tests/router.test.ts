/**
 * Credits:
 *
 * - next - MIT License
 *     Copyright (c) 2025 Vercel, Inc.
 *     https://github.com/vercel/next.js/blob/canary/license.md
 *     Relevant files:
 *       https://github.com/vercel/next.js/blob/f702a14acf4e9d815830aedd67d2f1d0e1e78a7b/test/unit/page-route-sorter.test.ts
 *
 * - fs-fixture - MIT License
 *     Copyright (c) Hiroki Osame <hiroki.osame@gmail.com>
 *     https://github.com/privatenumber/fs-fixture/blob/master/LICENSE
 */

import { assertEquals, assertRejects, dirname, getAvailablePort } from '../dev_deps.ts'
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
  const ignoredFiles = [
    '/_internal.ts',
    '/foo/.hidden.ts',
    '/coverage/report.ts',
    '/tests/health.test.ts',
    '/docs/spec_test.ts',
    '/node_modules/pkg/index.ts',
    '/reports/run.spec.ts',
  ] as const

  const files = [
    ...ignoredFiles,
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

  const tests: Record<string, { file: (typeof files)[number]; params: Record<string, string | string[]> }> = {
    '/': { file: '/index.ts', params: {} },
    '/apples/1/2/ef': { file: '/apples/[ab]/[cd]/ef.ts', params: { ab: '1', cd: '2' } },
    '/blog/abc': { file: '/(blog)/blog/abc/index.ts', params: {} },
    '/blog/abc/post': { file: '/(blog)/blog/abc/post.ts', params: {} },
    '/blog/abc/1': { file: '/(blog)/blog/abc/[id].ts', params: { id: '1' } },
    '/blog/1': { file: '/(blog)/blog/[id].ts', params: { id: '1' } },
    '/blog/1/comments/2': { file: '/(blog)/blog/[id]/comments/[cid].ts', params: { id: '1', cid: '2' } },
    '/foo/1/bar/baz/2': { file: '/foo/[d]/bar/baz/[f].ts', params: { d: '1', f: '2' } },
    '/p/1/2/3': { file: '/p/[...rest].ts', params: { rest: ['1', '2', '3'] } },
    '/p1': { file: '/p1/[[...incl]].ts', params: { incl: [] } },
    '/p1/1/2/3': { file: '/p1/[[...incl]].ts', params: { incl: ['1', '2', '3'] } },
    '/p2/1': { file: '/p2/[id].ts', params: { id: '1' } },
    '/p2/1/abc': { file: '/p2/[id]/abc.ts', params: { id: '1' } },
    '/p2/1/2/3': { file: '/p2/[...rest].ts', params: { rest: ['1', '2', '3'] } },
    '/p3/1': { file: '/p3/[id].ts', params: { id: '1' } },
    '/p3/1/abc': { file: '/p3/[id]/abc.ts', params: { id: '1' } },
    '/p3': { file: '/p3/[[...rest]].ts', params: { rest: [] } },
    '/p3/1/2/3': { file: '/p3/[[...rest]].ts', params: { rest: ['1', '2', '3'] } },
    '/posts': { file: '/posts.ts', params: {} },
    '/posts/1': { file: '/posts/[id].ts', params: { id: '1' } },
    '/apples': { file: '/[root-slug].ts', params: { 'root-slug': 'apples' } },
    '/1/2/3': { file: '/[...rest].ts', params: { rest: ['1', '2', '3'] } },
    '/blog/1/2': { file: '/[...rest].ts', params: { rest: ['blog', '1', '2'] } },
    '/foo%20bar': { file: '/foo bar.ts', params: {} },
  }

  // #region Setup

  using temp = new TempDir()

  for (const file of files) {
    const path = temp.path + file
    await Deno.mkdir(dirname(path), { recursive: true })
    await Deno.writeTextFile(
      path,
      `export function GET(_req: Request, params: Record<string, string | string[]>) { return new Response('GET ${file} = ' + JSON.stringify(params)) }`,
    )
  }

  const { handler, reloadRouter } = await createRouter({ fsRoot: temp.path, urlRoot: 'api' })
  using server = new Server(handler)

  const base = `http://${server.addr.hostname}:${server.addr.port}/api`

  // #endregion

  for (const [url, expected] of Object.entries(tests)) {
    await t.step(`lookup ${url}`, async () => {
      const res = await fetch(`${base}${url}`)
      const text = await res.text()

      assertEquals(res.status, 200)
      assertEquals(text, 'GET ' + expected.file + ' = ' + JSON.stringify(expected.params))
    })
  }

  // delete fallback routes
  await Deno.remove(temp.path + '/[...rest].ts')
  await Deno.remove(temp.path + '/[root-slug].ts')
  await reloadRouter()

  for (const file of ignoredFiles) {
    await t.step(`ignored file ${file} returns 404`, async () => {
      const res = await fetch(`${base}${file.replace(/\.ts$/, '')}`)
      const text = await res.text()

      assertEquals(res.status, 404)
      assertEquals(text, 'Not Found')
    })
  }

  await t.step('non-existent handler returns 404', async () => {
    const res = await fetch(`${base}/`, { method: 'POST' })
    const text = await res.text()

    assertEquals(res.status, 404)
    assertEquals(text, 'Not Found')
  })

  await t.step('HEAD is implicitly handled', async () => {
    const res = await fetch(`${base}/`, { method: 'HEAD' })
    const text = await res.text()

    assertEquals(res.status, 200)
    assertEquals(text, '')
    assertEquals(res.headers.get('content-type'), 'text/plain;charset=UTF-8')
    assertEquals(res.headers.get('content-length'), String('GET /index.ts = {}'.length)) // same as GET
    assertEquals(res.headers.get('content-encoding'), null)
  })

  await t.step('catches param names starting with the ellipsis character instead of three dots', async () => {
    using temp = new TempDir()
    await Deno.writeTextFile(temp.path + '/[…three-dots].ts', 'export const GET = () => new Response()')

    await assertRejects(() => createRouter({ fsRoot: temp.path }), Error, "Detected ellipsis ('…')")
  })

  await t.step('static fallback rejects percent-encoded backslashes', async () => {
    using temp = new TempDir()

    // the last one is a file with a backslash in its name on posix, and a file inside a directory on windows
    for (const file of ['/public/file.txt', '/public/a\\b.txt']) {
      await Deno.mkdir(dirname(temp.path + file), { recursive: true })
      await Deno.writeTextFile(temp.path + file, 'static')
    }

    await Deno.mkdir(temp.path + '/api')
    const { handler } = await createRouter({
      fsRoot: temp.path + '/api',
      urlRoot: 'api',
      static: { fsRoot: temp.path + '/public' },
    })
    using server = new Server(handler)

    const base = `http://${server.addr.hostname}:${server.addr.port}`

    const served = await fetch(`${base}/file.txt`)
    assertEquals(served.status, 200)
    assertEquals(await served.text(), 'static')

    const rejected = await fetch(`${base}/a%5Cb.txt`)
    assertEquals(rejected.status, 404)
    assertEquals(await rejected.text(), 'Not Found')
  })
})

// TODO: maybe use @std/testing/bdd and @std/expect for more familiar API
