const js = require('@eslint/js')

const nodeGlobals = {
  require: 'readonly',
  module: 'readonly',
  process: 'readonly',
  __dirname: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearTimeout: 'readonly',
  clearInterval: 'readonly',
}

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  crypto: 'readonly',
  console: 'readonly',
  alert: 'readonly',
  prompt: 'readonly',
  parent: 'readonly',
  sessionStorage: 'readonly',
  localStorage: 'readonly',
  Notification: 'readonly',
  FileReader: 'readonly',
  HTMLTextAreaElement: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  RegExp: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  io: 'readonly', // socket.io client global, loaded via <script src="socket.io/socket.io.js">
}

module.exports = [
  js.configs.recommended,
  {
    // node_modules, plus vendored third-party code we don't want our
    // own lint rules applied to.
    ignores: ['node_modules/**', 'html/static/scripts/qrcode.js'],
  },
  {
    files: ['eslint.config.js', 'server.js', 'test/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: nodeGlobals,
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: { fetch: 'readonly', WebSocket: 'readonly' },
    },
  },
  {
    files: ['html/static/scripts/*.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2020,
      globals: browserGlobals,
    },
  },
  {
    // Cross-file globals: each of these scripts uses another one's
    // global without defining it itself.
    files: ['html/static/scripts/chat.js'],
    languageOptions: {
      globals: { Emic: 'readonly', qrcode: 'readonly' },
    },
  },
  {
    files: ['html/static/scripts/init.js'],
    languageOptions: {
      globals: { Chat: 'readonly', Emic: 'readonly' },
    },
  },
]
