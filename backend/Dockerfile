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

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Run as non-root user
USER node

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -q --spider http://localhost:3003/health || exit 1

CMD ["node", "dist/src/main"]
