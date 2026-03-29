# ── Build stage ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ──────────────────────────────────────
FROM node:20-alpine AS runner

ARG VERSION=dev
LABEL org.opencontainers.image.title="TaskClaw Backend"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.source="https://github.com/taskclaw/taskclaw"

WORKDIR /app

# Install psql + netcat for entrypoint (migrations + health checks)
RUN apk add --no-cache postgresql-client

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy migration files and entrypoint
COPY --from=builder /app/supabase ./supabase
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Run as non-root user
USER node

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget -q --spider http://localhost:3003/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/src/main"]
