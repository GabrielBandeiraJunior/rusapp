# Deploy (Cloudflare) — passos que dependem das suas credenciais

Pré-requisito: conta Cloudflare (free).
```bash
npx wrangler login
```
## 1. D1
```bash
npx wrangler d1 create rusapp
```
Copie o `database_id` para `worker/wrangler.toml` (`database_id`). Depois:
```bash
npx wrangler d1 migrations apply rusapp --remote --config worker/wrangler.toml
npx wrangler d1 execute rusapp --remote --config worker/wrangler.toml --file worker/seed/content.sql
```
## 2. Segredos do Worker
```bash
npx wrangler secret put APP_TOKEN --config worker/wrangler.toml          # token longo e aleatório (ex.: openssl rand -hex 24)
# opcionais (lembretes Telegram):
npx wrangler secret put TELEGRAM_BOT_TOKEN --config worker/wrangler.toml # do @BotFather
npx wrangler secret put TELEGRAM_CHAT_ID --config worker/wrangler.toml   # seu chat id (mande /start ao bot e use getUpdates)
```
## 3. Publicar o Worker
Em `worker/wrangler.toml`, troque `ALLOWED_ORIGIN` pela URL do Pages. Então:
```bash
npx wrangler deploy --config worker/wrangler.toml
```
Anote a URL (`https://rusapp-api.<conta>.workers.dev`). O cron `*/30 * * * *` já está no toml e só age se você ativar os lembretes no app.
## 4. Front no Cloudflare Pages
```bash
npm run data && npm run build
npx wrangler pages deploy out --project-name rusapp
```
(ou conecte o repositório no painel: build `npm run build`, saída `out`.)
## 5. Usar
Abra a URL do Pages no iPhone/PC → Configurações → cole a URL do Worker e o `APP_TOKEN` → “Salvar e sincronizar”. Para lembretes: ative “Lembretes externos” (precisa dos 2 segredos do Telegram).
