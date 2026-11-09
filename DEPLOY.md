# Deploy (Cloudflare) — passos que dependem das suas credenciais

Pré-requisito: conta Cloudflare (free).
```bash
npx wrangler login
```
## 1. D1
```bash
npx wrangler d1 create rusapp
```
Copie o `database_id` para `worker/wrangler.toml` (`database_id`). Depois aplique as migrações (a `0002` remove tabelas que não são mais usadas — lembretes, cache de cartões e conteúdo; é seguro em bancos novos e antigos):
```bash
npx wrangler d1 migrations apply rusapp --remote --config worker/wrangler.toml
```
O conteúdo (palavras, frases) **não** vai para o D1: o app lê `public/data/content.json`.

## 2. Segredo do Worker
```bash
npx wrangler secret put APP_TOKEN --config worker/wrangler.toml          # token longo e aleatório (ex.: openssl rand -hex 24)
```
Se você já tinha configurado os lembretes do Telegram (recurso removido), apague os segredos antigos:
```bash
npx wrangler secret delete TELEGRAM_BOT_TOKEN --config worker/wrangler.toml
npx wrangler secret delete TELEGRAM_CHAT_ID --config worker/wrangler.toml
```
## 3. Publicar o Worker
Em `worker/wrangler.toml`, confira `ALLOWED_ORIGIN` (URL do Pages). Então:
```bash
npx wrangler deploy --config worker/wrangler.toml
```
Anote a URL (`https://rusapp-api.<conta>.workers.dev`). Ao republicar, o cron antigo (`*/30 * * * *`) deixa de existir, pois o `wrangler.toml` não o declara mais.
Opcional: no painel da Cloudflare, adicione uma regra de *rate limiting* em `/api/sync` (o token é a única proteção).

## 4. Front no Cloudflare Pages
```bash
npm run data && npm run build
npx wrangler pages deploy out --project-name rusapp
```
(ou conecte o repositório no painel: build `npm run build`, saída `out`.) As fontes são servidas do próprio site (`/fonts`); o build não precisa de rede externa.

## 5. Usar
Abra a URL do Pages no iPhone/PC → Configurações → cole a URL do Worker e o `APP_TOKEN` → “Salvar e sincronizar”. Quando sair uma versão nova, o app mostra o aviso “Nova versão disponível” e atualiza ao toque.
