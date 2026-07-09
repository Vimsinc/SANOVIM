#!/usr/bin/env bash
# Smoke test do servidor de PRODUÇÃO: boota app.ts (dist/index.mjs) e verifica
# que as rotas HTTP resolvem — pega crashes de boot (ex: rota '*' do Express 5)
# e a fiação da rota de SEO /q/:slug + fallback do SPA, que os testes que
# montam o router diretamente NÃO cobrem.
#
# Requer: DATABASE_URL setado, frontend buildado (artifacts/sanovim/dist/public)
# e api-server buildado (artifacts/api-server/dist/index.mjs).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT="${SMOKE_PORT:-8100}"
export NODE_ENV=production PORT="$PORT"

node "$ROOT/artifacts/api-server/dist/index.mjs" >/tmp/smoke-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT

# espera o servidor subir (ou falhar)
up=0
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1; then up=1; break; fi
  if ! kill -0 $SRV 2>/dev/null; then echo "SERVIDOR MORREU NO BOOT:"; cat /tmp/smoke-server.log; exit 1; fi
  sleep 1
done
[ "$up" = 1 ] || { echo "servidor não respondeu healthz"; cat /tmp/smoke-server.log; exit 1; }

code_health=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/healthz")
code_ready=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/readyz")
code_quiz=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/q/qualquer-slug")
code_spa=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/leads")

echo "healthz=$code_health  readyz=$code_ready  /q/:slug=$code_quiz  spa=$code_spa"
if [ "$code_health" = 200 ] && [ "$code_ready" = 200 ] && [ "$code_quiz" = 200 ] && [ "$code_spa" = 200 ]; then
  echo "SMOKE OK"
  exit 0
fi
echo "SMOKE FAIL"; cat /tmp/smoke-server.log; exit 1
