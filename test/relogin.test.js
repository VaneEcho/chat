const test = require('node:test')
const assert = require('node:assert/strict')
const { startServer, stopServer, connectClient, waitFor, wait } = require('./helpers')

// The login handler used to accept a second login on an already-logged-in
// socket without leaving the previous room. Everything below is a consequence
// of that, and each one was reproduced against the old code before the fix.

test('re-login: the socket stops receiving the room it left', async (t) => {
  const server = await startServer({ MAX_LOGIN_ATTEMPTS_PER_WINDOW: '1000' })
  t.after(() => stopServer(server))

  const mover = connectClient(server.port)
  await waitFor(mover, 'connect')
  mover.emit('login', { nick: 'mover', room: 'roomA' })
  await waitFor(mover, 'start')

  const leaked = []
  mover.on('new-msg', (m) => leaked.push(m))

  mover.emit('login', { nick: 'mover', room: 'roomB' })
  await waitFor(mover, 'start')

  const stayer = connectClient(server.port)
  await waitFor(stayer, 'connect')
  stayer.emit('login', { nick: 'stayer', room: 'roomA' })
  await waitFor(stayer, 'start')
  stayer.emit('send-msg', { m: { text: 'roomA only' } })
  await waitFor(stayer, 'new-msg')
  await wait(150)

  assert.deepEqual(leaked, [], 'a message from the abandoned room reached the socket')

  mover.disconnect()
  stayer.disconnect()
})

test('re-login: the old room releases the nickname', async (t) => {
  const server = await startServer({ MAX_LOGIN_ATTEMPTS_PER_WINDOW: '1000' })
  t.after(() => stopServer(server))

  const mover = connectClient(server.port)
  await waitFor(mover, 'connect')
  mover.emit('login', { nick: 'ghost', room: 'roomA' })
  await waitFor(mover, 'start')
  mover.emit('login', { nick: 'ghost', room: 'roomB' })
  await waitFor(mover, 'start')

  // roomA should be empty again, so the name is free and the room is fresh.
  const next = connectClient(server.port)
  await waitFor(next, 'connect')
  next.emit('login', { nick: 'ghost', room: 'roomA' })

  const start = await waitFor(next, 'start')
  assert.deepEqual(start.users, ['ghost'], 'roomA still held a stranded user')

  mover.disconnect()
  next.disconnect()
})

test('re-login: other members are told the user left', async (t) => {
  const server = await startServer({ MAX_LOGIN_ATTEMPTS_PER_WINDOW: '1000' })
  t.after(() => stopServer(server))

  const stayer = connectClient(server.port)
  await waitFor(stayer, 'connect')
  stayer.emit('login', { nick: 'stayer', room: 'roomA' })
  await waitFor(stayer, 'start')

  const mover = connectClient(server.port)
  await waitFor(mover, 'connect')
  mover.emit('login', { nick: 'mover', room: 'roomA' })
  await waitFor(mover, 'start')

  // Register before triggering: the server emits these in the same tick, so a
  // listener attached afterwards can miss the event outright.
  const left = waitFor(stayer, 'ul')
  mover.emit('login', { nick: 'mover', room: 'roomB' })

  assert.equal((await left).nick, 'mover')

  mover.disconnect()
  stayer.disconnect()
})

// Repeated logins used to strand a user in every room they passed through, so
// none of those rooms ever emptied and none were ever freed: one socket could
// grow the room map without bound.
test('re-login: rooms passed through do not accumulate', async (t) => {
  const server = await startServer({ MAX_LOGIN_ATTEMPTS_PER_WINDOW: '1000' })
  t.after(() => stopServer(server))

  const looper = connectClient(server.port)
  await waitFor(looper, 'connect')

  for (let i = 0; i < 25; i++) {
    looper.emit('login', { nick: 'looper', room: 'leak' + i })
    await waitFor(looper, 'start')
  }
  looper.disconnect()
  await wait(200)

  // Every room but the last should already be gone; the last goes on
  // disconnect. A fresh joiner therefore always lands in an empty room.
  for (const room of ['leak0', 'leak12', 'leak24']) {
    const probe = connectClient(server.port)
    await waitFor(probe, 'connect')
    probe.emit('login', { nick: 'looper', room })
    const start = await waitFor(probe, 'start')
    assert.deepEqual(start.users, ['looper'], `${room} was still occupied`)
    probe.disconnect()
  }
})

test('login: attempts are rate limited', async (t) => {
  const server = await startServer({ MAX_LOGIN_ATTEMPTS_PER_WINDOW: '3', LOGIN_WINDOW_MS: '60000' })
  t.after(() => stopServer(server))

  const attacker = connectClient(server.port)
  await waitFor(attacker, 'connect')

  const rejections = []
  attacker.on('force-login', (m) => rejections.push(m))

  attacker.emit('login', { nick: 'owner', room: 'private', password: 'secret' })
  await waitFor(attacker, 'start')

  for (let i = 0; i < 6; i++) {
    attacker.emit('login', { nick: 'guess' + i, room: 'private', password: 'wrong' + i })
  }
  await wait(400)

  assert.ok(
    rejections.some((m) => /too many attempts/i.test(m)),
    `expected the guesses to be throttled, got: ${JSON.stringify(rejections)}`,
  )
  attacker.disconnect()
})

test('typing: events are rate limited', async (t) => {
  const server = await startServer({ MAX_TYPING_PER_WINDOW: '3', MESSAGE_WINDOW_MS: '60000' })
  t.after(() => stopServer(server))

  const sender = connectClient(server.port)
  await waitFor(sender, 'connect')
  sender.emit('login', { nick: 'sender', room: 'main' })
  await waitFor(sender, 'start')

  const watcher = connectClient(server.port)
  await waitFor(watcher, 'connect')
  watcher.emit('login', { nick: 'watcher', room: 'main' })
  await waitFor(watcher, 'start')

  let seen = 0
  watcher.on('typing', () => { seen++ })

  for (let i = 0; i < 12; i++) sender.emit('typing', true)
  await wait(400)

  assert.equal(seen, 3, 'typing should stop fanning out once the cap is reached')

  sender.disconnect()
  watcher.disconnect()
})
