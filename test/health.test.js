const test = require('node:test')
const assert = require('node:assert/strict')
const { startServer, stopServer } = require('./helpers')

test('GET /healthz returns ok status with no sensitive data', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const res = await fetch(`http://localhost:${server.port}/healthz`)
  assert.equal(res.status, 200)

  const body = await res.json()
  assert.deepEqual(body, { status: 'ok' })
})
