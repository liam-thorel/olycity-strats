FROM node:22-bookworm-slim

# Chromium de Debian (piloté par playwright-core) et des polices pour afficher TikTok.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY extract.mjs reader.mjs ./

ENV NODE_ENV=production CHROMIUM=/usr/bin/chromium
CMD ["node", "reader.mjs"]
