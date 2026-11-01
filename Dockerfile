# syntax=docker/dockerfile:1.7
# ── AIRGAP/01 · single-origin production image ──────────────────────────────
# One Node process serves the API (Fastify) AND the built PWA, so the service
# worker, SSE and API share an origin. Postgres runs embedded (PGlite) on a
# mounted volume unless DATABASE_URL points at an external database.

FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@10.34.9
WORKDIR /app

# ---- build: install everything, build web + server ------------------------
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
# Public, build-time configuration for the "Built by" section (never secrets).
ARG VITE_APP_NAME=AIRGAP/01
ARG VITE_SOURCE_URL=
ARG VITE_GITHUB_URL=
ARG VITE_PORTFOLIO_URL=
ARG VITE_VIDEO_URL=
ARG VITE_RESUME_URL=
ARG VITE_CONTACT_EMAIL=
ARG VITE_CONTACT_PHONE=
RUN pnpm build

# ---- runtime: production dependencies of the server only ------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/pgdata
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/packages/shared packages/shared
RUN pnpm install --prod --frozen-lockfile --filter "@airgap/server..." \
  && mkdir -p /data && chown -R node:node /data
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
