# The API image. Plain node, three dependencies, no build step.

FROM node:26-alpine

ARG VERSION=dev
ARG VCS_REF=dev
ARG BUILD_DATE=unknown

LABEL maintainer="Duarte Santos https://github.com/DuarteSantos8" \
    org.opencontainers.image.title="opengym-api" \
    org.opencontainers.image.description="Backend for Self-hosted gym & body-weight tracker — plan routines, log workouts (supersets & cardio too), track your weight and progress, passkey login. Your data, your server." \
    org.opencontainers.image.source="https://github.com/DuarteSantos8/openGym" \
    org.opencontainers.image.url="https://opengym.ch" \
    org.opencontainers.image.documentation="https://github.com/DuarteSantos8/openGym#readme" \
    org.opencontainers.image.licenses="AGPL-3.0-or-later" \
    org.opencontainers.image.version=$VERSION \
    org.opencontainers.image.revision=$VCS_REF \
    org.opencontainers.image.created=$BUILD_DATE

WORKDIR /app

# The base image is rebuilt on node's schedule, not alpine's: between two node releases the
# alpine packages it ships (openssl above all) fall behind their fixes. Taking the upgrades at
# build time keeps the published image at alpine's current state without waiting for node.
RUN apk upgrade --no-cache

COPY package.json package-lock.json* ./
# `npm ci` rather than `npm install`: the lockfile is the point of committing one.
RUN npm ci --omit=dev && npm cache clean --force

# Every module server.js imports from the api root has to be named here: the image carries nothing
# else, and one that is missing only shows at boot, as ERR_MODULE_NOT_FOUND.
COPY server.js push-messages.js nudge.js nudge-copy.js wrapped.js wrapped-copy.js checkin-reminder.js checkin-copy.js verify-error.js password.js rate-limit.js passkeys-store.js device-link.js watch-relay.js media.js queue.js sync-stamps.js durable.js admin-socket.js recover.js net-guard.js tokens.js oauth.js role-claims.js ./
COPY shared ./shared
COPY oidc ./oidc
COPY integrations ./integrations
COPY sources ./sources
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]

# Every 30 s, so a fresh container reads "healthy" half a minute after it starts instead of after
# five (TrueNAS and Portainer wait for it before they call the app running, #844).
# wget is BusyBox's, already in the Alpine image, so nothing is added for it.
HEALTHCHECK --interval=30s \
            --timeout=5s \
            --start-period=20s \
            --retries=3 \
            CMD wget --spider -q "http://127.0.0.1:${PORT}/api/health" || exit 1

# npm itself is only a build-time tool here: the server is started with `node server.js` and
# nothing in it spawns npm. Its bundled dependency tree (tar, brace-expansion, ...) is where
# every vulnerability the image scan ever reported lived — none of them was in a package the
# app uses. Gone from the published image.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
