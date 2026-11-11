# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# 의존성 (package*.json이 안 바뀌면 캐시 재사용)
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

USER app

EXPOSE 3000

CMD ["node", "server.js"]
