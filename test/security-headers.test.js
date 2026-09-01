const test = require('node:test')
const assert = require('node:assert/strict')
const { startServer, stopServer } = require('./helpers')

test('security headers are present on the main page', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const res = await fetch(`http://localhost:${server.port}/`)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('x-frame-options'), 'DENY')
  assert.ok(res.headers.get('referrer-policy'))

  const csp = res.headers.get('content-security-policy')
  assert.ok(csp, 'expected a Content-Security-Policy header')
  assert.match(csp, /script-src 'self'/)
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/)
})
