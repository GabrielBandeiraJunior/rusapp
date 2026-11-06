# Russo — contexto do projeto

App web (PWA estático) para brasileiros aprenderem russo digitando as formas (casos, leitura, acento). Custo zero, sem LLM no app.

## Regras invioláveis
- Formas gramaticais e acentos NUNCA vêm de LLM: só de dados (OpenRussian) ou regras testadas contra eles.
- Nenhuma palavra russa na UI sem acento (U+0301), exceto monossílabos. ё conta como tônica.
- Mobile-first: alvos de toque >= 44px, sem hover, inputs com autocorrect/autocapitalize/spellcheck desligados.
- Tudo offline após a primeira carga (service worker). Progresso: IndexedDB + sync com o Worker.

## Stack
Next.js 15 (output export), TypeScript, Tailwind 3, ts-fsrs no cliente, IndexedDB (idb), Cloudflare Worker + D1.

## Estrutura
- scripts/pipeline: dados (baixar, normalizar, filtrar, gerar public/data/content.json e worker/seed/content.sql)
- data/curated: lemas (com glosas pt) e frases/textos autorais
- shared: acento, normalização, transliteração, dias/ofensiva (usado por app e Worker)
- src/lib: núcleo (srs, db, sync, grammar, queue, stats, reading, extra, resume, backup, errors, lessons, speech)
- src/app, src/components: telas
- worker: API de sync, migrations, lembretes Telegram
- tests (vitest) e e2e (Playwright, node:test)

## Comandos
- npm run data | dev | build | lint | typecheck | test | test:e2e (rode `npm run build` antes do e2e e NÃO com o `dev` ligado: os dois usam .next)
- Worker local: npm run worker:migrate:local, depois npm run worker:dev (precisa de worker/.dev.vars com APP_TOKEN)

## Documentos
README.md, DEPLOY.md, DECISIONS.md, LICENSES.md, ROADMAP.md, PLAN.md, PROGRESS.md.
Registre decisões novas em DECISIONS.md. Rode lint, typecheck e test antes de concluir qualquer mudança.

## Regras de conteúdo (além das acima)
- Texto em português da UI nunca cita palavra russa de 2+ sílabas sem acento: use a forma dos dados (`lemma.s` / `answerFor`). O e2e audita todas as telas.
- Frases do Tatoeba passam por `brazilianFriendly` (app é pt-BR).

## Atenção (Windows)
Se o dev server falhar com @swc/helpers ausente, reinstale: apague node_modules e package-lock.json e rode npm install.
