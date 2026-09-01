const test = require('node:test')
const assert = require('node:assert/strict')
const { startServer, stopServer, connectClient, waitFor, wait } = require('./helpers')

test('login: empty nickname is rejected', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: '  ', room: 'main' })

  const msg = await waitFor(a, 'force-login')
  assert.match(msg, /empty/i)
  a.disconnect()
})

test('login: normal nickname is accepted and broadcast', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'main' })

  const start = await waitFor(a, 'start')
  assert.deepEqual(start.users, ['Alice'])
  a.disconnect()
})

test('login: duplicate nickname is rejected', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'main' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Alice', room: 'main' })

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
  a.emit('login', { nick: 'Alice', room: 'main' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob', room: 'main' })
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
  ['non-string nick', { nick: 42, room: 'main' }],
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
    b.emit('login', { nick: 'StillAlive', room: 'main' })
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
  a.emit('login', { nick: 'TooLongNick', room: 'main' })

  const msg = await waitFor(a, 'force-login')
  assert.match(msg, /too long/i)
  a.disconnect()
})

test('message: over MAX_MESSAGE_LENGTH is silently dropped', async (t) => {
  const server = await startServer({ MAX_MESSAGE_LENGTH: '10' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'main' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob', room: 'main' })
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

test('rate limit: messages beyond the per-window cap are dropped', async (t) => {
  const server = await startServer({ MAX_MESSAGES_PER_WINDOW: '3', MESSAGE_WINDOW_MS: '5000' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'main' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob', room: 'main' })
  await waitFor(b, 'start')

  const received = []
  b.on('new-msg', (m) => received.push(m))

  for (let i = 0; i < 6; i++) {
    a.emit('send-msg', { m: { text: `msg ${i}` } })
  }
  await wait(400)

  assert.equal(received.length, 3)
  a.disconnect()
  b.disconnect()
})

test('cache: CACHE_SIZE above the server-side max is clamped', async (t) => {
  const server = await startServer({ CACHE_SIZE: '999999999', MAX_MESSAGES_PER_WINDOW: '999999' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'main' })
  await waitFor(a, 'start')

  for (let i = 0; i < 501; i++) {
    a.emit('send-msg', { m: { text: `msg ${i}` } })
  }
  await wait(500)

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob', room: 'main' })
  const { msgs } = await waitFor(b, 'previous-msg')
  assert.ok(msgs.length <= 500, `expected cache to be clamped to <= 500, got ${msgs.length}`)

  a.disconnect()
  b.disconnect()
})

test('cache: file attachments are cached as a placeholder, not the payload', async (t) => {
  const server = await startServer({ CACHE_SIZE: '50' })
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'main' })
  await waitFor(a, 'start')

  a.emit('send-msg', { m: { type: 'image/png', name: 'pic.png', url: 'data:image/png;base64,AAAA' } })
  a.emit('send-msg', { m: { text: 'a text message' } })
  await wait(300)

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob', room: 'main' })
  const { msgs } = await waitFor(b, 'previous-msg')

  assert.equal(msgs.length, 2, 'both the placeholder and the text message should be present')
  assert.equal(msgs[0].m.placeholder, true)
  assert.equal(msgs[0].m.name, 'pic.png')
  assert.equal(msgs[0].m.type, 'image/png')
  assert.equal(msgs[0].m.url, undefined, 'the actual file payload must never enter the cache')
  assert.equal(msgs[1].m.text, 'a text message')

  a.disconnect()
  b.disconnect()
})

test('rooms: invalid room id is rejected', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  for (const room of ['', '   ', 'has spaces', 'slash/es', '<script>']) {
    const a = connectClient(server.port)
    await waitFor(a, 'connect')
    a.emit('login', { nick: 'Alice', room })
    const msg = await waitFor(a, 'force-login')
    assert.match(msg, /room/i, `expected room ${JSON.stringify(room)} to be rejected`)
    a.disconnect()
  }
})

test('rooms: same nickname is fine in different rooms', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'room-a' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Alice', room: 'room-b' })
  const start = await waitFor(b, 'start')

  assert.deepEqual(start.users, ['Alice'])
  a.disconnect()
  b.disconnect()
})

test('rooms: messages do not cross rooms', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'room-a' })
  await waitFor(a, 'start')

  const c = connectClient(server.port)
  await waitFor(c, 'connect')
  c.emit('login', { nick: 'Carol', room: 'room-b' })
  await waitFor(c, 'start')

  let leaked = null
  c.on('new-msg', (m) => { leaked = m })

  a.emit('send-msg', { m: { text: 'room-a only' } })
  await wait(300)

  assert.equal(leaked, null, 'message from room-a must not reach room-b')
  a.disconnect()
  c.disconnect()
})

test('rooms: password protects a room and is required to join', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'secret-room', password: 'hunter2' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob', room: 'secret-room', password: 'wrong' })
  const rejected = await waitFor(b, 'force-login')
  assert.match(rejected, /password/i)

  const c = connectClient(server.port)
  await waitFor(c, 'connect')
  c.emit('login', { nick: 'Carol', room: 'secret-room', password: 'hunter2' })
  const start = await waitFor(c, 'start')
  assert.deepEqual(start.users.sort(), ['Alice', 'Carol'])

  a.disconnect()
  b.disconnect()
  c.disconnect()
})

test('rooms: destroyed once empty, new joiner gets a fresh room', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'ephemeral-room' })
  await waitFor(a, 'start')
  a.emit('send-msg', { m: { text: 'hi' } })
  await wait(200)

  a.disconnect()
  await wait(300)

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  const startPromise = waitFor(b, 'start')
  const previousMsgPromise = waitFor(b, 'previous-msg')
  b.emit('login', { nick: 'Bob', room: 'ephemeral-room' })
  const start = await startPromise
  const { msgs } = await previousMsgPromise

  assert.deepEqual(start.users, ['Bob'])
  assert.equal(msgs.length, 0, 'the old room and its cache should have been destroyed')
  b.disconnect()
})

test('disconnect: notifies remaining users', async (t) => {
  const server = await startServer()
  t.after(() => stopServer(server))

  const a = connectClient(server.port)
  await waitFor(a, 'connect')
  a.emit('login', { nick: 'Alice', room: 'main' })
  await waitFor(a, 'start')

  const b = connectClient(server.port)
  await waitFor(b, 'connect')
  b.emit('login', { nick: 'Bob', room: 'main' })
  await waitFor(b, 'start')

  const left = waitFor(b, 'ul')
  a.disconnect()

  const payload = await left
  assert.equal(payload.nick, 'Alice')
  b.disconnect()
})
