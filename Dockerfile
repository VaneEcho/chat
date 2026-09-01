FROM node:24-bookworm-slim

WORKDIR /usr/src/app

# Install app dependencies with a reproducible, lockfile-exact install.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

ENV MAX_HTTP_BUFFER_SIZE_MB=10
ENV PORT=8080

# Official node images already ship a non-root "node" user.
USER node

EXPOSE 8080

# No curl dependency: Node itself can make the request.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/healthz', res => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT [ "node", "server.js" ]
