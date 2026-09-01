const test = require('node:test')
const assert = require('node:assert/strict')
const { startServer, stopServer, connectClient, waitFor, wait } = require('./helpers')

test('login: empty nickname is rejected', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: '  ' })

  const msg = await waitFor(a, 'force-login')
  assert.match(msg, /empty/i)
  a.disconnect()
})

test('login: normal nickname is accepted and broadcast', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice' })

  const start = await waitFor(a, 'start')
  assert.deepEqual(start.users, ['Alice'])
  a.disconnect()
})

test('login: duplicate nickname is rejected', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Alice' })

  const msg = await waitFor(b, 'force-login')
  assert.match(msg, /already in chat/i)
  a.disconnect()
  b.disconnect()
})

test('message: relayed to other logged-in users', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob' })
  await waitFor(b, 'start')

  const received = waitFor(b, 'new-msg')
  a.emit('send-msg', { m: { text: 'hello' } })

  const msg = await received
  assert.equal(msg.f, 'Alice')
  assert.deepEqual(msg.m, { text: 'hello' })
  a.disconnect()
  b.disconnect()
})

test('message: rejected before login', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('send-msg', { m: { text: 'should be rejected' } })

  const msg = await waitFor(a, 'force-login')
  assert.match(msg, /need to be logged in/i)
  a.disconnect()
})

for (const [label, payload] of [
  ['missing nick field', {}],
  ['null payload', null],
  ['no payload at all', undefined],
  ['non-string nick', { nick: 42 }],
]) {
  test(`abuse: malformed login payload (${label}) must not crash the server`, async (t) => {
    const server = await startServer()
    t.after(() => stopServer(server))

    const a = connectClient(server.port)
    await waitFor(a, 'connect')
    if (payload === undefined) a.emit('login')
    else a.emit('login', payload)
    await wait(300)

    // Server must still be responsive to a well-formed request afterwards.
    const b = connectClient(server.port)
    await waitFor(b, 'connect')
    b.emit('login', { nick: 'StillAlive' })
    const start = await waitFor(b, 'start')
    assert.deepEqual(start.users, ['StillAlive'])

    a.disconnect()
    b.disconnect()
  })
}

test('login: nickname over MAX_NICK_LENGTH is rejected', async (t) => {
  const server = await startServer({ MAX_NICK_LENGTH: '5' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'TooLongNick' })

  const msg = await waitFor(a, 'force-login')
  assert.match(msg, /too long/i)
  a.disconnect()
})

test('message: over MAX_MESSAGE_LENGTH is silently dropped', async (t) => {
  const server = await startServer({ MAX_MESSAGE_LENGTH: '10' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob' })
  await waitFor(b, 'start')

  let received = null
  b.on('new-msg', (m) => { received = m })

  a.emit('send-msg', { m: { text: 'this text is way over the limit' } })
  await wait(300)
  assert.equal(received, null)

  // A valid follow-up message still gets through.
  const ok = waitFor(b, 'new-msg')
  a.emit('send-msg', { m: { text: 'short' } })
  const msg = await ok
  assert.equal(msg.m.text, 'short')

  a.disconnect()
  b.disconnect()
})

test('cache: CACHE_SIZE above the server-side max is clamped', async (t) => {
  const server = await startServer({ CACHE_SIZE: '999999999' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice' })
  await waitFor(a, 'start')

  for (let i = 0; i < 501; i++) {
    a.emit('send-msg', { m: { text: `msg ${i}` } })
  }
  await wait(500)

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob' })
  const { msgs } = await waitFor(b, 'previous-msg')
  assert.ok(msgs.length <= 500, `expected cache to be clamped to <= 500, got ${msgs.length}`)

  a.disconnect()
  b.disconnect()
})

test('cache: file attachments are not stored in history', async (t) => {
  const server = await startServer({ CACHE_SIZE: '50' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice' })
  await waitFor(a, 'start')

  a.emit('send-msg', { m: { type: 'image/png', name: 'pic.png', url: 'data:image/png;base64,AAAA' } })
  a.emit('send-msg', { m: { text: 'a text message' } })
  await wait(300)

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob' })
  const { msgs } = await waitFor(b, 'previous-msg')

  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].m.text, 'a text message')

  a.disconnect()
  b.disconnect()
})

test('disconnect: notifies remaining users', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob' })
  await waitFor(b, 'start')

  const left = waitFor(b, 'ul')
  a.disconnect()

  const payload = await left
  assert.equal(payload.nick, 'Alice')
  b.disconnect()
})
