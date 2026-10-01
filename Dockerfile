# Tankery Insanery - MTC Match Manager - Copyright © Nan's Studio's. All rights reserved.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/tankery.sqlite \
    BACKUP_DIR=/app/backups
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/data /app/backups && chown -R node:node /app
USER node
VOLUME ["/app/data", "/app/backups"]
CMD ["npm", "start"]
