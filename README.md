# Russo — aprender o sistema, digitando

Web app (PWA estático) de russo para falantes de português. Ensina o **sistema** (casos, leitura, acento) e exige **produção** (digitar formas). Custo zero, sem LLM. Formas e acentos vêm de dados abertos (OpenRussian), nunca de modelo de linguagem.

Stack: Next.js 15 (`output: 'export'`) · TypeScript · Tailwind · ts-fsrs (no cliente) · IndexedDB · Cloudflare Worker + D1 (sync, usuário único).

## Rodar do zero
```bash
npm install
npm run data          # pipeline: baixar → normalizar → filtrar → public/data/content.json + worker/seed/content.sql
npm run dev           # app em http://localhost:3000
npm run build         # build estático em out/ (+ service worker com pré-cache)
```
Pipeline idempotente (`npm run data -- --refresh` rebaixa; `-- --no-fetch` só reconstrói). Fontes/fallbacks: ver `DECISIONS.md`.

## Worker local (sync + D1 emulado)
```bash
cp worker/.dev.vars.example worker/.dev.vars     # defina APP_TOKEN
npm run worker:migrate:local
npx wrangler d1 execute rusapp --local --config worker/wrangler.toml --file worker/seed/content.sql
npm run worker:dev                               # http://localhost:8787
```
No app: Configurações → URL do Worker + token → “Salvar e sincronizar”.

## Qualidade
```bash
npm run lint && npm run typecheck
npm test              # vitest: dados, gramática, FSRS, Worker/D1 (Miniflare), sync, lembretes
npm run build && npm run test:e2e   # Playwright (iPhone 390x844): telas, acentos, toque, OFFLINE, sync de 2 aparelhos
```
Capturas das telas: `docs/screens/`.

## Estrutura
`scripts/pipeline` dados · `shared` utilidades (acento, dias/ofensiva) usadas por app e Worker · `src/lib` núcleo (srs, db, sync, grammar, queue, stats) · `src/app` telas · `worker` API + migrations + seed · `data/curated` lemas (com glosas pt) e frases autorais · `data/source` snapshot das linhas de origem usadas nos testes.

Deploy: `DEPLOY.md`. Roadmap: `ROADMAP.md`.
