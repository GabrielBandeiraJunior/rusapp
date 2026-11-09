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
- scripts/pipeline: dados (baixar, normalizar, filtrar, gerar public/data/content.json)
- data/curated: lemas (com glosas pt) e frases/textos autorais
- shared: acento, normalização, transliteração, dias/ofensiva (usado por app e Worker)
- src/lib: núcleo (srs, db, sync, grammar, verbs, queue, stats, reading, resume)
- src/components/exercises: um arquivo por tipo de exercício
- src/app, src/components: telas
- worker: API de sync (só revisões e configurações) e migrations. Não há lembretes/Telegram (removidos)
- tests (vitest) e e2e (Playwright, node:test)

## Comandos
- npm run data | dev | build | lint | typecheck | test | test:e2e (e2e precisa de `npx playwright install chromium` e de `npm run build` antes)
- Worker local: npm run worker:migrate:local, depois npm run worker:dev (precisa de worker/.dev.vars com APP_TOKEN)

## Documentos
README.md, DEPLOY.md, DECISIONS.md, LICENSES.md, ROADMAP.md, PLAN.md, PROGRESS.md, docs/ARQUITETURA.md.
Registre decisões novas em DECISIONS.md. Rode lint, typecheck e test antes de concluir qualquer mudança.

## Atenção (Windows)
Se o dev server falhar com @swc/helpers ausente, reinstale: apague node_modules e package-lock.json e rode npm install.
