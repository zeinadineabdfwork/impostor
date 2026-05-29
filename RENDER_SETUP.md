# Render — Configuração das Variáveis de Ambiente

Vai ao painel do Render → o teu serviço → **Environment** → adiciona estas variáveis:

## ✅ Obrigatórias (o servidor não arranca sem estas)

| Variável              | Valor / Onde encontrar                                               |
|-----------------------|----------------------------------------------------------------------|
| `NODE_ENV`            | `production`                                                         |
| `JWT_SECRET`          | String aleatória longa (usa: `openssl rand -base64 64`)              |
| `JWT_REFRESH_SECRET`  | Outra string aleatória longa diferente da anterior                   |
| `DATABASE_URL`        | Supabase → Project → Settings → Database → **Connection string** (Transaction pooler porta 6543) |
| `SUPABASE_URL`        | Supabase → Project → Settings → API → **Project URL** ⚠️ SEM `/rest/v1/` no final! |
| `SUPABASE_ANON_KEY`   | Supabase → Project → Settings → API → `anon` `public`               |

## ⚠️ Importante: SUPABASE_URL

**ERRADO** (causa crash): `https://xyzxyz.supabase.co/rest/v1/`
**CORRECTO**: `https://xyzxyz.supabase.co`

## 🔧 Recomendadas

| Variável                     | Valor                                                          |
|------------------------------|----------------------------------------------------------------|
| `SUPABASE_SERVICE_ROLE_KEY`  | Supabase → API → `service_role` `secret` (para avatares)      |
| `SUPABASE_AVATARS_BUCKET`    | `avatars` (cria este bucket no Supabase Storage, público)      |
| `CORS_ORIGIN`                | URL do teu frontend, ex: `https://meu-jogo.vercel.app`        |
| `PORT`                       | Render define automaticamente — não precisas definir           |

## 🪣 Supabase Storage (avatares)

1. Vai ao Supabase → **Storage** → **New bucket**
2. Nome: `avatars`, marca como **Public**
3. Adiciona `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_AVATARS_BUCKET=avatars` no Render

## 🔍 Como ver os erros no Render

Render → o teu serviço → **Logs** (tab no topo)

Os logs agora mostram mensagens claras com ❌ / ✅ / ⚠️ para cada problema.
