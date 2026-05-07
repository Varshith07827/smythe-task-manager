# --- Stage 1: Build frontend ---
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production runtime ---
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./public

RUN mkdir -p uploads && chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
