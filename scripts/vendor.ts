import { minify } from '../dev_deps.ts'

try {
  await Deno.remove('vendor/sentry', { recursive: true })
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) console.error(e)
}

await Deno.mkdir('vendor/sentry', { recursive: true })

let js = await (await fetch('https://unpkg.com/@sentry/deno/index.mjs')).text()

const jsMod = js.replace(
  /^function fill\(source, name, replacementFactory\)[^]*?^\}/m,
  'function fill(l,n,r){function e(o){if(!(n in o))return;const c=o[n],i=r(c);typeof i=="function"&&markFunctionWrapped(i,c);try{o[n]=i}catch(p){DEBUG_BUILD&&logger.log(`Failed to replace method "${n}" in object`,o,p)}return o}let t=Object.prototype.toString.call(l);t=t==="[object console]"?"console":t==="[object Window]"?"globalThis":void 0,t?patchGlobal(t,e):e(l)}',
)

if (jsMod === js) throw new Error('Failed to patch sentry')
js = 'import {patchGlobal} from "npm:@brc-dd/globals@^0.1.0";\n' + jsMod

const { code } = await minify(js)
if (!code) throw new Error('Failed to minify sentry')

await Deno.writeTextFile('vendor/sentry/index.mjs', code)
