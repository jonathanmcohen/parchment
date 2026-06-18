# syntax=docker/dockerfile:1
# Parchment — single all-in-one image: Postgres 18 + pgvector + Hocuspocus + Next,
# supervised by s6-overlay. `docker run` one image → working Parchment.

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
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ─── runner (single container) ───
FROM node:24-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PGDATA=/var/lib/postgresql/data \
    DATABASE_URL=postgres://parchment:parchment@localhost:5432/parchment \
    COLLAB_PORT=1234 \
    COLLAB_URL=ws://localhost:1234 \
    PARCHMENT_FILES_ROOT=/data/files \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    S6_OVERLAY_VERSION=3.2.0.2

# Postgres 18 + pgvector (PGDG repo) and s6-overlay.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg xz-utils; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-18 postgresql-18-pgvector; \
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
# s6 service tree + scripts.
COPY rootfs/ /

RUN set -eux; \
    chmod +x /etc/parchment/*.sh \
      /etc/s6-overlay/s6-rc.d/postgres/run \
      /etc/s6-overlay/s6-rc.d/migrate/up \
      /etc/s6-overlay/s6-rc.d/collab/run \
      /etc/s6-overlay/s6-rc.d/next/run; \
    install -d -o postgres -g postgres /var/lib/postgresql /data/files

EXPOSE 3000 1234
VOLUME ["/var/lib/postgresql", "/data"]
ENTRYPOINT ["/init"]
