# ── Build stage ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# NO host-specific NEXT_PUBLIC_* build args. The frontend resolves URLs at
# runtime from window.location.origin and reads its per-install public config
# (Supabase anon key, edition, brand) at runtime via window.__TASKCLAW__
# (injected by the SSR runner — see frontend/src/app/layout.tsx). Baking any
# of these here would pin the published image to a single host, so the build
# intentionally carries none of them.

RUN npm run build

# ── Production stage ──────────────────────────────────────
FROM node:20-alpine AS runner

ARG VERSION=dev
LABEL org.opencontainers.image.title="TaskClaw Frontend"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.source="https://github.com/taskclaw/taskclaw"

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy Next.js build output and static files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Make .next writable by the non-root runtime user so the entrypoint can patch
# required-server-files.json, and so Next can write its .next/cache at runtime
# (otherwise: EACCES on /app/.next/cache). Then drop to the node user.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R node:node /app/.next

# Run as non-root user
USER node

EXPOSE 3002

# Entrypoint injects this install's origin into Server Actions allowedOrigins
# (from SITE_URL) before starting Next — see docker-entrypoint.sh.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
