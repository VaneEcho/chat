# Dependencies are installed with the full toolchain, then only the result is
# carried over — npm itself is another 19MB the runtime never needs.
FROM node:24-alpine AS deps

WORKDIR /usr/src/app

# Lockfile-exact and reproducible. Its own layer, so a source-only change
# does not reinstall anything.
COPY package*.json ./
RUN npm ci --omit=dev

# Plain alpine with the node binary lifted out of the official image, rather
# than the official image itself: that drops npm, its bundled modules and the
# Debian userland for a base a tenth the size. Safe here because every
# dependency is pure JavaScript — a native addon would need its build
# toolchain back.
FROM alpine:3.21

# node links against libstdc++/libgcc; musl itself is already in the base.
RUN apk add --no-cache libstdc++ \
 && addgroup -g 1000 node \
 && adduser -u 1000 -G node -s /bin/sh -D node

COPY --from=node:24-alpine /usr/local/bin/node /usr/local/bin/node

WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules ./node_modules
# Only what the server actually serves; tests, lint config and compose files
# have no business in a runtime image.
COPY package.json server.js ./
COPY html ./html

ENV NODE_ENV=production
ENV MAX_HTTP_BUFFER_SIZE_MB=10
ENV PORT=8080

USER node

EXPOSE 8080

# No curl dependency: Node itself can make the request.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/healthz', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT [ "node", "server.js" ]
