# hadō (波動) [WIP]

A minimal API framework for Deno.

## Usage

```ts
import { createRouter } from 'jsr:@globalbrain/hado/router'
import { fromFileUrl } from 'jsr:@std/path'

const { handler } = await createRouter({
  fsRoot: fromFileUrl(new URL('./api', import.meta.url)),
  urlRoot: 'api', // optional (default: '')

  static: { // optional (refer https://jsr.io/@std/http/doc/~/serveDir)
    fsRoot: fromFileUrl(new URL('./public', import.meta.url)),
    urlRoot: 'static', // optional (default: '')
  },

  dev: Deno.env.get('DENO_ENV') === 'development',
})

Deno.serve({ port: 3000, handler })
```

This will serve the `api` directory as an API on `http://localhost:3000/api`.

### Running in development

To run the server in development mode, you can use the following command:

```sh
DENO_ENV=development deno run --watch --allow-env --allow-read --allow-net server.ts
```

This will restart the server on file changes and will watch for changes in the `api` directory.

You can also use the `--unstable-hmr` flag instead of `--watch` to enable hot module reloading.

## Routing

Hado has a file-based router, so the directory structure will determine the routes. We follow the same conventions as Next.js:

```txt
api/
  users/
    [id].ts
    index.ts
  index.ts
```

The above structure will create the following routes:

- `[METHODS] /api/users`
- `[METHODS] /api/users/:id`
- `[METHODS] /api`

The files can export multiple handlers:

```ts
export function GET() {
  return Response.json({ hello: 'world' })
}

export function POST() {
  return Response.json({ hello: 'world' })
}
```

Each handler will be called based on the HTTP method and will be passed the request object and matched params. You can also use async functions:

```ts
// api/users/[id].ts

export async function GET(req: Request, params: { id: string }): Promise<Response> {
  const user = await getUser(params.id)
  return Response.json(user)
}
```

The following methods are supported:

- `GET` (corresponding `HEAD` requests are automatically handled)
- `POST`
- `PUT`
- `DELETE`
- `PATCH`

Methods other than these will be ignored and a 405 status code will be returned.

There is a hard-limit of 8 KiB on the request URL. URLs longer than this will be rejected with a 414 status code.

Catch-all routes are also supported. Refer [Next.js documentation](https://nextjs.org/docs/pages/building-your-application/routing/dynamic-routes) for more information.

Here `Request` and `Response` are Deno's built-in request and response objects - documented [here](https://docs.deno.com/deploy/api/runtime-request) and [here](https://docs.deno.com/deploy/api/runtime-response).

Also, note that the API routes will take precedence over static files. It is recommended to specify non-conflicting URL roots for API and static routes.

## Contributing

This project is a work in progress and is not yet ready for production use. It is meant as an internal tool for [Global Brain Corporation](https://globalbrains.com/en), but we welcome external contributions and feedback. Please feel free to open an issue or a pull request. This project follows Semantic Versioning and the Conventional Commits guidelines.

## License

[MIT](./LICENSE.md)

This project references code from [Next.js](https://github.com/vercel/next.js) and many other open-source projects, especially from [Sindre Sorhus](https://github.com/sindresorhus). We are grateful for their work and the inspiration they provide. We are committed to open-source and will continue to contribute back to the community. Appropriate licenses and attributions are included in the source code.
