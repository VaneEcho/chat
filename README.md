# chat

[![CI](https://github.com/VaneEcho/chat/actions/workflows/ci.yml/badge.svg)](https://github.com/VaneEcho/chat/actions/workflows/ci.yml)

A tiny self-hosted chat room. No accounts, no database, no setup —
pick a nickname, join a room, chat.

This is a maintained fork of [m1k1o/chat](https://github.com/m1k1o/chat),
modernized: current Node.js LTS, a hardened Docker image, input
validation and flood protection, a redesigned responsive UI with a
working light/dark theme, and multi-room support with optional room
passwords.

## Features

- No accounts — a nickname is your whole identity
- Rooms are just a URL (`?room=your-room-name`); open the bare URL and
  a random room is created for you, share the link to invite others
- Optional per-room password
- Real-time messaging, typing indicator, online user list
- File and image sharing — relayed over the socket, never written to
  disk
- No message history by default; an optional bounded in-memory cache
  (`CACHE_SIZE`) can be enabled per deployment
- Light / dark / system theme
- Single Node.js process, no database, no Redis, no external services

## Quick start

```sh
docker run -d \
  --name chat \
  -p 8090:8080 \
  ghcr.io/vaneecho/chat:latest
```

Then open `http://localhost:8090`.

## Docker Compose

```sh
git clone https://github.com/VaneEcho/chat.git
cd chat
docker compose up -d
```

Builds from the included `Dockerfile` (see
[`compose.yaml`](./compose.yaml)) rather than pulling the published
image — handy if you're modifying the app.

## Configuration

Everything has a sane default — none of this is required to run the
app. All values are environment variables (a `.env` file in the
project root works too when running outside Docker).

| Variable                  | Default | Meaning                                                              |
|----------------------------|---------|-----------------------------------------------------------------------|
| `PORT`                    | `8080` in Docker, `8090` otherwise | HTTP/WebSocket port |
| `CACHE_SIZE`               | `0`     | Text messages kept per room for new joiners (clamped to 0–500 server-side). File/image messages are never cached. |
| `MAX_NICK_LENGTH`          | `32`    | Max nickname length |
| `MAX_MESSAGE_LENGTH`       | `4000`  | Max text message length |
| `MAX_ROOM_LENGTH`          | `64`    | Max room id length |
| `MAX_MESSAGES_PER_WINDOW`  | `5`     | Flood protection: messages allowed per connection per window |
| `MESSAGE_WINDOW_MS`        | `5000`  | Flood protection window, in ms |
| `MAX_HTTP_BUFFER_SIZE_MB`  | `1`     | Max Socket.IO payload size (caps file/image uploads) |

## Reverse proxy / Cloudflare

The client always connects to Socket.IO on the same origin it was
served from, so it works unchanged behind a normal reverse proxy
(nginx, Caddy, Traefik) or Cloudflare — just make sure WebSocket
upgrade is passed through, which all of those do by default.

## Security

- All Socket.IO input is validated server-side (nickname, message,
  room id — never trust the client)
- Per-connection rate limiting on messages
- `Content-Security-Policy` and standard security headers on every
  response
- Runs as a non-root user in Docker
- `GET /healthz` for container healthchecks (returns only `{"status":
  "ok"}`, no user data)

## Privacy

**Stored in memory, for as long as the process runs:**
- Nicknames and room membership of currently connected users
- Optionally (if `CACHE_SIZE` > 0), the last few text messages per
  active room

**Never stored:**
- Accounts, passwords for anything other than optional room access,
  or any data on disk
- Files or images sent through the chat — they're relayed directly
  between clients, never written anywhere
- Anything at all once a room empties out (the room and its cache are
  deleted) or the process restarts

This is HTTPS-in-transit if you put it behind TLS (which you should),
not end-to-end encryption — the server sees every message in transit
in order to relay it.

## Development

Requires Node.js 24.

```sh
npm install
npm test        # node:test — unit + Socket.IO integration tests
npm start        # or: node server.js [port]
```

## License

GPL-3.0, same as upstream. See [`LICENSE`](./LICENSE).

## Credits

Originally created by [m1k1o](https://github.com/m1k1o). This fork is
maintained at [VaneEcho/chat](https://github.com/VaneEcho/chat).
