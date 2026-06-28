# syntax=docker/dockerfile:1
# Parchment app image (v0.2.0+): Hocuspocus + Next, supervised by s6-overlay.
# Postgres/pgvector runs as a separate container (ghcr.io/jonathanmcohen/pgvector).
# Use docker-compose.yml for production; docker-compose.dev.yml for local dev.

# ─── deps ───
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ─── builder ───
FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
# CF2: the git commit this image is built from. Passed as a build-arg by the
# release workflow (`build-args: GIT_SHA=${{ github.sha }}`); defaults to
# 'unknown' for an arg-less local build. Promoted to ENV so `pnpm build` (and any
# SSR during build) sees process.env.GIT_SHA → version.ts BUILD_SHA.
ARG GIT_SHA=unknown
ENV NEXT_TELEMETRY_DISABLED=1 \
    GIT_SHA=$GIT_SHA
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Phase 0's src/lib/env.ts validates these at module load, which `next build`
# triggers while collecting route data (a missing PARCHMENT_PUBLIC_URL otherwise
# fails the build with "Failed to collect page data"). BUILD-TIME PLACEHOLDERS
# ONLY — the real values are supplied at runtime (compose env / runner stage);
# nothing here is embedded in the output bundle. The secret is a valid base64-32
# dummy so env.ts's key-format check passes.
ENV PARCHMENT_PUBLIC_URL=http://localhost:3000 \
    PARCHMENT_SECRET_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
RUN pnpm build

# ─── runner (compose-ready: external Postgres) ───
FROM node:24-bookworm-slim AS runner
# CF2: carry the build-arg into the runner's runtime env so the /whats-new About
# page (a server component rendered per-request) reports the real commit SHA.
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    GIT_SHA=$GIT_SHA \
    COLLAB_PORT=1234 \
    COLLAB_URL=ws://localhost:1234 \
    PARCHMENT_FILES_ROOT=/data/files \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    S6_OVERLAY_VERSION=3.2.0.2

# postgresql-client-18 (PGDG repo — needed by migrate.sh for pg_isready/createdb/psql)
# and s6-overlay. The Postgres SERVER packages (postgresql-18, postgresql-18-pgvector)
# are NOT installed; the DB runs in a separate container (ghcr.io/jonathanmcohen/pgvector).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg xz-utils; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-18; \
    ARCH="$(dpkg --print-architecture)"; \
    case "$ARCH" in amd64) S6_ARCH=x86_64 ;; arm64) S6_ARCH=aarch64 ;; *) echo "unsupported arch $ARCH" >&2; exit 1 ;; esac; \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" -o /tmp/s6-noarch.tar.xz; \
    curl -fsSL "https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" -o /tmp/s6-arch.tar.xz; \
    tar -C / -Jxpf /tmp/s6-noarch.tar.xz; \
    tar -C / -Jxpf /tmp/s6-arch.tar.xz; \
    apt-get purge -y --auto-remove gnupg; \
    rm -rf /tmp/*.tar.xz /var/lib/apt/lists/*

ENV PATH="/usr/lib/postgresql/18/bin:${PATH}"
WORKDIR /app

# Next standalone server (self-contained) + static + public.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Collab server + full node_modules (standalone trace omits collab's deps) + migrations.
COPY --from=builder /app/collab ./collab
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/db/migrations ./src/db/migrations
# F2b: the collab tsx process now imports src/lib/{disk,markdown,editor}/** (the
# disk watcher + the Y.Doc bridge moved here). Ship the full src/ + tsconfig so
# `tsx collab/server.ts` can resolve those modules at runtime.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# s6 service tree + scripts.
COPY rootfs/ /

RUN set -eux; \
    chmod +x /etc/parchment/*.sh \
      /etc/s6-overlay/s6-rc.d/migrate/up \
      /etc/s6-overlay/s6-rc.d/collab/run \
      /etc/s6-overlay/s6-rc.d/next/run; \
    install -d /data/files

EXPOSE 3000 1234
VOLUME ["/data"]
ENTRYPOINT ["/init"]
