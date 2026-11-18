# 갈림길 인생 — 단일 Node 프로세스 (외부 의존성 없음)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data TRUST_PROXY=1
COPY package.json ./
COPY game ./game
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server/index.js"]
