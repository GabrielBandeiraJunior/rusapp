# Plano (arquitetura, schema, riscos)
**Arquitetura**: front estático (Next export) + service worker (pré-cache de tudo em `out/`) + IndexedDB (cards/reviews/settings/meta) + FSRS no cliente. Conteúdo = `public/data/content.json` gerado por `scripts/pipeline`. Worker (Cloudflare) + D1: `POST /api/sync` (Bearer), cron para Telegram.
**Schema D1** (`worker/migrations/0001_init.sql`): lemma, form, sentence (seed), card, review_log, setting (com `seq` p/ cursor), reminder_log. Cliente: stores `cards`, `reviews`(index card/synced/ts), `settings`, `meta`.
**Sync**: push de revisões não enviadas + configs sujas; pull por cursor `seq` paginado; estado do cartão recalculado por replay.
**Dados**: OpenRussian (formas+acento) + frequência; lista curada com glosas pt; frases autorais resolvidas contra o índice.
**Riscos**: (1) fontes bloqueadas → fallbacks (DECISIONS); (2) glosas/frases autorais podem ter erros de tradução → revisão humana; (3) homógrafos → rejeição de frases ambíguas; (4) iOS limpa IndexedDB após ~7 dias sem uso (Safari, fora de PWA instalada) → sync é a rede de segurança; (5) cobertura de teste em WebKit real inexistente (só Chromium emulando iPhone).
