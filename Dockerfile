# Imagem de produção do SANOVIM (app full-stack: Express serve o SPA + a API).
# Roda em qualquer host de contêiner (Railway, Render, Fly, Cloud Run, etc.).
#
#   docker build -t sanovim .
#   docker run -p 8080:8080 -e DATABASE_URL=... -e PORT=8080 sanovim
#
# Variáveis: veja DEPLOY.md.

# ---- build ----
FROM node:22-slim AS build
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ./artifacts/sanovim run build \
 && pnpm --filter ./artifacts/api-server run build

# ---- runtime ----
FROM node:22-slim AS run
# ffmpeg é necessário para o módulo de vídeo (Reels)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
