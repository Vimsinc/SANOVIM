# Deploy do SANOVIM — `sanovim.vimsinc.com`

Este guia coloca **o app inteiro no ar** (o funil público de quiz → lead →
WhatsApp **e** o painel administrativo: Leads, Follow-ups, Indicações, Editor
de Quiz, KPIs, geração de quiz por IA, SEO).

> **Resumo em uma linha:** o SANOVIM é **um servidor Express** que serve o SPA
> React **e** a API no mesmo processo. Ele roda em **qualquer host de
> contêiner** (Railway, Render, Fly.io, Google Cloud Run…). O `Dockerfile` na
> raiz já está pronto e testado. O domínio `sanovim.vimsinc.com` é apontado
> por um registro **CNAME** para o host escolhido.

---

## Por que não Vercel puro? (leia antes de decidir)

A Vercel é ótima para **frontend estático + funções serverless**. O SANOVIM
não é isso: é **um servidor Express de longa duração** que também:

1. **Serve o próprio SPA** e faz **SEO server-side** em `/q/:slug` (injeta
   `<title>`, `<meta>` e JSON-LD antes de entregar o HTML) — precisa de um
   processo Node rodando, não de uma função que "acorda" a cada request.
2. **Processa vídeo/Reels com FFmpeg** (binário de sistema) — o runtime
   serverless da Vercel não tem FFmpeg.
3. **Login administrativo via OIDC** hoje aponta para o provedor do Replit
   (`ISSUER_URL` padrão `https://replit.com/oidc`). Fora do Replit o login do
   painel exige configurar um OIDC próprio (veja "Autenticação" abaixo). **O
   funil público — quiz, captura de lead, WhatsApp — não exige login e
   funciona em qualquer lugar.**

**Conclusão:** para "tudo funcionando" (o que você pediu), o encaixe honesto é
um **host de contêiner**. A Vercel entra, no máximo, como opção de servir só o
frontend apontando para a API hospedada em outro lugar (seção final).

---

## Caminho mais rápido — Render Blueprint (menos cliques)

O repo já traz um `render.yaml`. O Render lê esse arquivo e configura build,
porta, health check e deploy automático sozinho. Passo a passo:

1. **Render Dashboard → New → Blueprint** e conecte este repositório
   (branch de produção). Ele detecta o `render.yaml` e mostra o serviço `sanovim`.
2. Clique **Apply**. O Render vai pedir os **3 segredos** marcados `sync:false`:
   - `DATABASE_URL` → string do seu **Supabase** (Settings → Database →
     Connection string, pooler porta 6543).
   - `ANTHROPIC_API_KEY` e `SERPER_KEY`.
3. O build roda (Dockerfile) e o serviço sobe. Copie a URL provisória
   (`https://sanovim.onrender.com`) e confirme: `curl -I .../api/healthz` → 200.
4. **Settings → Custom Domain → Add** `sanovim.vimsinc.com`. O Render mostra um
   alvo CNAME. No DNS de `vimsinc.com` crie **CNAME `sanovim` → `<alvo>`**.
   O HTTPS é emitido automaticamente.

Se o banco Supabase ainda não tiver o schema, rode uma vez (do seu terminal):
`DATABASE_URL="...supabase..." pnpm --filter @workspace/db exec drizzle-kit push`.

---

## Caminho alternativo — outro host de contêiner (10–15 min)

### O que você vai precisar

- Uma conta em **Railway** (mais simples), **Render** ou **Fly.io**.
- Um **banco PostgreSQL**. Você já usa **Supabase** — reaproveite: pegue a
  connection string em *Project → Settings → Database → Connection string*
  (use a de **pooler**, porta 6543, para serverless/contêiner).
- Acesso ao **DNS de `vimsinc.com`** para criar o CNAME.

### Passo 1 — Banco: aplicar o schema

O projeto usa Drizzle com `drizzle-kit push` (não há arquivos SQL de
migração). Aponte para o banco de produção **uma vez**:

```bash
DATABASE_URL="postgresql://...supabase..." pnpm --filter @workspace/db exec drizzle-kit push
```

Depois, se você já tinha dados sem dono, rode o backfill de multi-tenancy:

```bash
DATABASE_URL="..." OWNER_EMAIL="ldsouzad@gmail.com" \
  pnpm --filter @workspace/api-server run backfill:owner
```

### Passo 2 — Deploy do contêiner

**Railway (CLI):**

```bash
npm i -g @railway/cli
railway login
railway init            # cria o projeto
railway up              # builda o Dockerfile da raiz e sobe
```

**Render:** New → Web Service → conecte o repo → Runtime **Docker** →
Dockerfile path `./Dockerfile`.

**Fly.io:** `fly launch --dockerfile Dockerfile` (aceite gerar o `fly.toml`).

Todos detectam o `Dockerfile` da raiz automaticamente. O contêiner escuta em
`PORT` (padrão 8080) e o host injeta a porta pública.

### Passo 3 — Variáveis de ambiente

Configure no painel do host (ver tabela completa em **"Variáveis de ambiente"**
abaixo). O mínimo para o **funil público** funcionar:

```
DATABASE_URL   = postgresql://...supabase...
PORT           = 8080
NODE_ENV       = production
PUBLIC_BASE_URL= https://sanovim.vimsinc.com
CORS_ORIGINS   = https://sanovim.vimsinc.com
ANTHROPIC_API_KEY = sk-ant-...        # geração de quiz por IA
SERPER_KEY        = ...               # pesquisa de temas mais buscados
```

### Passo 4 — Health checks

Aponte o health check do host para **`/api/readyz`** (verifica o banco;
retorna 200 só quando o Postgres responde) e/ou **`/api/healthz`** (liveness,
sempre 200 se o processo está de pé). Ambos já existem e foram testados.

### Passo 5 — Domínio `sanovim.vimsinc.com`

1. No painel do host, adicione o **custom domain** `sanovim.vimsinc.com`. Ele
   vai te dar um alvo (ex.: `sanovim-prod.up.railway.app`).
2. No DNS de `vimsinc.com`, crie:

   | Tipo  | Nome (host) | Valor (alvo)                    |
   |-------|-------------|---------------------------------|
   | CNAME | `sanovim`   | `<alvo-que-o-host-forneceu>`    |

3. Aguarde a propagação (minutos a ~1h). O host emite o **TLS/HTTPS**
   automaticamente (Let's Encrypt). Confirme:

   ```bash
   curl -I https://sanovim.vimsinc.com/api/healthz   # 200
   curl -I https://sanovim.vimsinc.com/              # 200 (SPA)
   ```

Pronto — app inteiro no ar em `https://sanovim.vimsinc.com`.

---

## Variáveis de ambiente (referência completa)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | **Sim** | Postgres (Supabase). Sem isso o app não sobe. |
| `PORT` | **Sim** | Porta HTTP (o Dockerfile usa 8080; a maioria dos hosts injeta). |
| `NODE_ENV` | Recomendada | `production` (ativa estáticos + logs JSON). |
| `PUBLIC_BASE_URL` | Recomendada | URL canônica p/ SEO/JSON-LD e links de quiz. `https://sanovim.vimsinc.com`. |
| `CORS_ORIGINS` | Recomendada | Allowlist de origens do painel, separada por vírgula. |
| `ANTHROPIC_API_KEY` | Funcional | Geração de quiz por IA + demais recursos de IA. |
| `SERPER_KEY` | Funcional | Pesquisa de temas mais buscados (Google/PAA/Trends). |
| `PG_POOL_MAX` | Opcional | Tamanho do pool (padrão 15). Em pooler serverless, use menor (ex. 5). |
| `LOG_LEVEL` | Opcional | `info` (padrão), `debug`, etc. |
| `RL_PUBLIC_PER_MIN` | Opcional | Rate limit do submit público (padrão 30/min/IP). |
| `RL_GENERATE_PER_HOUR` | Opcional | Rate limit da geração por IA (padrão 20/h/usuário). |
| `ISSUER_URL` / `REPL_ID` | Só p/ login | OIDC do painel (ver "Autenticação"). |
| `INSTAGRAM_TOKEN_*` / `INSTAGRAM_USER_ID_*` | Opcional | Sinais do Instagram nos temas. Sem token → só Google/Trends. |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `RUNWARE_API_KEY` | Opcional | Módulos legados de mídia (não usados no funil). |

Guarde tudo isso como **secrets** no host — nunca comite em `.env`.

---

## Autenticação do painel (importante)

- O **funil público** (`/q/:slug`, submit de lead, redirecionamento WhatsApp)
  **não usa login** — funciona em qualquer host, sem OIDC.
- O **painel administrativo** (Leads, KPIs, etc.) protege as rotas `/api/sales`
  por sessão. Hoje o login OIDC aponta para o Replit. Fora do Replit você tem
  duas opções:
  1. **Manter no Replit Deploy** (login já funciona lá) e usar só o subdomínio
     público em outro host — ou publicar tudo no Replit e apontar o CNAME pra lá.
  2. **Trocar o provedor OIDC**: setar `ISSUER_URL` e `REPL_ID` (client id) para
     um provedor próprio (Auth0, Google, Clerk, etc.). O fluxo em
     `artifacts/api-server/src/lib/auth.ts` usa `openid-client` padrão, então é
     uma troca de configuração, não de código, desde que o provedor exponha
     discovery OIDC.

Se quiser, eu adapto o login para um provedor específico — me diga qual.

---

## Alternativa: frontend na Vercel + API no contêiner

Se você faz questão de usar a Vercel, dá para servir **só o SPA** lá e manter a
API no host de contêiner:

1. Deploy do frontend na Vercel:
   - **Root Directory:** `artifacts/sanovim`
   - **Build Command:** `pnpm run build`
   - **Output Directory:** `dist/public`
2. Faça o SPA falar com a API por URL absoluta (`https://api.sanovim.vimsinc.com`)
   e inclua essa origem no `CORS_ORIGINS` do backend.
3. **Perde-se o SEO server-side de `/q/:slug`** (a Vercel serve o `index.html`
   estático, sem injeção de `<meta>`/JSON-LD por quiz) — o que enfraquece
   justamente o objetivo de ranquear os quizzes no Google. Por isso o caminho
   de contêiner único é o recomendado.

Domínio nesse arranjo: `sanovim.vimsinc.com` (CNAME → Vercel) para o front e
`api.sanovim.vimsinc.com` (CNAME → host) para a API.

---

## Verificação local do artefato de produção

O `Dockerfile` replica exatamente o build da CI (que está verde). Sem Docker à
mão, dá para validar o binário de produção direto:

```bash
pnpm --filter ./artifacts/sanovim   run build
pnpm --filter ./artifacts/api-server run build
DATABASE_URL="postgresql://..." PORT=8080 NODE_ENV=production \
  node --enable-source-maps artifacts/api-server/dist/index.mjs
# em outro terminal:
curl -I localhost:8080/api/healthz   # 200 (liveness)
curl -I localhost:8080/api/readyz    # 200 com DB no ar / 503 sem DB
curl -I localhost:8080/              # 200 (SPA)
```

Esses passos foram executados neste repositório: o servidor sobe, serve o SPA e
as rotas, e o `/api/readyz` acusa 503 corretamente quando o banco está fora.
