# Progresso
- [x] Pipeline de dados (fetch com fallback, build, snapshot de origem, **Tatoeba em streaming**, checagem de glosas repetidas)
- [x] Núcleo: FSRS determinístico, IndexedDB (transação única no ingest, backup), sync idempotente só de revisões/configurações, gramática gerativa (6 casos) + verbos + explicações validadas contra os dados, filas, estatísticas, ofensiva c/ congelamento
- [x] Worker + D1 (migrations 0001/0002, sync, auth, CORS, validação de entrada e limite de corpo). Lembretes Telegram **removidos**
- [x] UI mobile: Hoje (painel), Alfabeto/Regras/Prática, Vocabulário (digitar/reconhecer/acento de lemas e de formas), Gramática (Casos + Verbos), Leitura graduada, Config (+backup), Sobre
- [x] PWA: manifest, ícones, fontes locais, service worker com pré-cache e atualização sob demanda; teste OFFLINE
- [x] Testes: vitest (65) + e2e Playwright (8) · lint · typecheck · build · `npm audit` limpo · CI no GitHub Actions
- [x] Docs: README, DEPLOY, DECISIONS, LICENSES, ROADMAP, PLAN, docs/ARQUITETURA
- [ ] Pendente (usuário): revisar as glosas pt (coluna `rev`), login Cloudflare, segredo `APP_TOKEN`, deploy (aplicar a migração 0002)
