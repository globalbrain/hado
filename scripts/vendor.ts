import { build, denoPlugins } from '../dev_deps.ts'

try {
  await Deno.remove('vendor/sentry', { recursive: true })
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) console.error(e)
}

await Deno.mkdir('vendor/sentry', { recursive: true })

const importMap = {
  imports: {
    '@sentry/core': 'https://unpkg.com/@sentry/core@9.2.0/build/esm/index.js',
    '@sentry/deno': 'https://unpkg.com/@sentry/deno@9.2.0/build/esm/index.js',
  },
}

await build({
  plugins: [
    {
      name: 'patch-sentry',
      setup(build) {
        build.onLoad({ filter: /utils-hoist\/object\.js$/ }, async (args) => {
          const original = await (await fetch(`${args.namespace}:${args.path}${args.suffix}`)).text()
          const modified = original.replace(
            /^(function fill\(source, name, replacementFactory\)[^]*?^\})/m,
            `\
function fill(source, name, replacementFactory) {
  function wrapObject(target) {
    if (!(name in target)) {
      return
    }

    const original = target[name]
    const wrapped = replacementFactory(original)

    if (typeof wrapped === 'function') {
      markFunctionWrapped(wrapped, original)
    }

    try {
      target[name] = wrapped
    } catch (error) {
      if (DEBUG_BUILD) {
        logger.log(\`Failed to replace method "\${name}" in object\`, target, error)
      }
    }

    return target
  }

  let objectType = Object.prototype.toString.call(source)

  if (objectType === '[object console]') {
    objectType = 'console'
  } else if (objectType === '[object Window]') {
    objectType = 'globalThis'
  } else {
    objectType = undefined
  }

  if (objectType) {
    patchGlobal(objectType, wrapObject)
  } else {
    wrapObject(source)
  }
}`,
          )
          if (modified === original) throw new Error('Failed to patch sentry')
          return {
            contents: `import { patchGlobal } from 'npm:@brc-dd/globals@^0.1.0';${modified}`,
          }
        })
      },
    },
    ...denoPlugins({
      importMapURL: `data:application/json;base64,${btoa(JSON.stringify(importMap))}`,
    }),
  ],

  format: 'esm',
  target: 'deno2',
  minify: true,
  bundle: true,
  outfile: 'vendor/sentry/index.mjs',
  external: ['npm:@brc-dd/globals@*'],
  entryPoints: ['@sentry/deno'],
})
