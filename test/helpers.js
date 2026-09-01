const { spawn } = require('node:child_process')
const path = require('node:path')
const { io } = require('socket.io-client')

const SERVER_PATH = path.join(__dirname, '..', 'server.js')

// Spawns the real server as a child process on a free port, the same way
// it runs in production, so tests exercise actual behavior rather than
// requiring server.js to be refactored for testability.
function startServer(env = {}) {
  const port = 10000 + Math.floor(Math.random() * 20000)

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER_PATH, String(port)], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let started = false
    const onData = (data) => {
      if (!started && data.toString().includes('Starting server')) {
        started = true
        child.stdout.off('data', onData)
        resolve({ port, child })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', (d) => { child._stderr = (child._stderr || '') + d.toString() })

    child.on('exit', (code) => {
      if (!started) reject(new Error(`server exited before starting (code ${code}): ${child._stderr || ''}`))
    })

    setTimeout(() => { if (!started) reject(new Error('server did not start within 3s')) }, 3000)
  })
}

function stopServer(handle) {
  handle.child.kill()
}

function connectClient(port) {
  return io(`http://localhost:${port}`, {
    path: '/socket.io/',
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  })
}

function waitFor(socket, event, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeout)
    socket.once(event, (payload) => {
      clearTimeout(t)
      resolve(payload)
    })
  })
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { startServer, stopServer, connectClient, waitFor, wait }
