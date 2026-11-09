# Russo — aprender o sistema, digitando

Web app (PWA estático) de russo para falantes de português. Ensina o **sistema** (casos, conjugação, leitura, acento) e exige **produção** (digitar formas). Custo zero, sem LLM. Formas e acentos vêm de dados abertos (OpenRussian), nunca de modelo de linguagem.

Stack: Next.js 15 (`output: 'export'`) · TypeScript · Tailwind · ts-fsrs (no cliente) · IndexedDB · Cloudflare Worker + D1 (sync opcional, usuário único).

## Rodar do zero
```bash
npm install
npm run data          # pipeline: baixar → normalizar → filtrar → public/data/content.json (+ relatório em data/build/)
npm run dev           # app em http://localhost:3000
npm run build         # build estático em out/ (+ service worker com pré-cache)
```
Pipeline idempotente (`npm run data -- --refresh` rebaixa; `-- --no-fetch` só reconstrói). Fontes/fallbacks: ver `DECISIONS.md`. O passo do Tatoeba usa o `bzip2` do sistema se existir e, senão, um descompressor em JS (funciona no Windows); falhas são avisadas no console.

## Worker local (sync + D1 emulado)
```bash
cp worker/.dev.vars.example worker/.dev.vars     # defina APP_TOKEN (o arquivo é ignorado pelo git)
npm run worker:migrate:local
npm run worker:dev                               # http://localhost:8787
```
No app: Configurações → URL do Worker + token → “Salvar e sincronizar”. Sem Worker, o app funciona igual; use **Configurações → Backup** para exportar/importar o progresso.

## Qualidade
```bash
npm run lint && npm run typecheck
npm test              # vitest: dados, gramática, verbos, filas, estatísticas, FSRS, Worker/D1 (Miniflare), sync, backup
npx playwright install chromium                  # uma vez
npm run build && npm run test:e2e                # Playwright (iPhone 390x844): telas, acentos, toque, OFFLINE, sync de 2 aparelhos, verbos, backup
```
O CI (`.github/workflows/ci.yml`) roda tudo isso a cada push. Capturas das telas: `docs/screens/`.

## Estrutura
`scripts/pipeline` dados · `shared` utilidades (acento, dias/ofensiva) usadas por app e Worker · `src/lib` núcleo (srs, db, sync, grammar, verbs, queue, stats) · `src/components/exercises` um arquivo por tipo de exercício · `src/app` telas · `worker` API + migrations · `data/curated` lemas (com glosas pt) e frases autorais · `data/source` snapshot das linhas de origem usadas nos testes.

Como tudo funciona por dentro: `docs/ARQUITETURA.md`. Deploy: `DEPLOY.md`. Roadmap: `ROADMAP.md`.
