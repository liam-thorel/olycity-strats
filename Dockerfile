FROM node:22-bookworm-slim

# yt-dlp (copie des TikToks) + ffmpeg (conversion des miniatures).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/ytdlp \
 && /opt/ytdlp/bin/pip install --no-cache-dir "yt-dlp[default,curl-cffi]"
ENV PATH=/opt/ytdlp/bin:$PATH

WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server ./server

ENV NODE_ENV=production PORT=3100 DATA_DIR=/app/data
EXPOSE 3100
HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
