import { assertEquals } from '@std/assert'

Deno.test('router', async (t) => {
  await t.step('basic', () => {
    assertEquals(1, 1)
  })
})
