# Russo — como o projeto funciona

Documento de referência técnica (estado do código em 2026-11-09). Complementa `README.md` (como rodar), `DEPLOY.md` (publicar), `DECISIONS.md` (por que cada escolha) e `PLAN.md`/`ROADMAP.md`.

## 1. Visão geral

PWA estático para brasileiros aprenderem **o sistema** do russo (casos, conjugação, leitura, acento) **digitando** as formas. Custo zero, sem LLM em tempo de execução.

```
 OpenRussian (CSV) ─┐
 FrequencyWords ────┼─► scripts/pipeline ──► public/data/content.json ──► app (offline, SW)
 Tatoeba (dumps) ───┤   (npm run data)       data/build/report.json
 data/curated (pt) ─┘

 Navegador                                    Cloudflare (opcional)
 ┌──────────────────────────────┐   POST /api/sync   ┌────────────────────┐
 │ Next (export) + React        │ ◄────────────────► │ Worker + D1        │
 │ IndexedDB: cards/reviews/... │   Bearer APP_TOKEN │ review_log         │
 │ ts-fsrs (agendamento)        │   (só revisões e   │ setting            │
 │ Service Worker (pré-cache)   │    configurações)  └────────────────────┘
 └──────────────────────────────┘
```

### Regras invioláveis (de `CLAUDE.md`) e onde são garantidas
| Regra | Garantia |
|---|---|
| Formas e acentos nunca vêm de LLM | só `data/` (OpenRussian) + regras testadas; `tests/content.test.ts` re-parseia `data/source/*.tsv` com um parser independente e exige que **toda** forma do app exista numa coluna de origem (substantivos, adjetivos e verbos) |
| Nenhuma palavra russa sem acento (U+0301), exceto monossílabos; ё é tônica | `wordHasRequiredStress` no pipeline (descarta formas/frases sem acento) + testes sobre lemas, formas, frases e **todas** as explicações (casos e verbos) + auditoria no e2e de cada tela |
| Mobile-first (toque ≥ 44 px, sem hover, input sem autocorrect) | `Btn` `min-h-12`, `TypeInput` com `autoCorrect/autoCapitalize/spellCheck` off; o e2e audita alvos de toque e rolagem horizontal |
| Offline após a 1ª carga; progresso em IndexedDB + sync | service worker com pré-cache total; e2e "OFFLINE"; backup exportável |

## 2. Mapa do repositório

| Caminho | Papel |
|---|---|
| `scripts/pipeline/` | `fetch.ts` baixa; `openrussian.ts` parseia; `build.ts` filtra/gera; `tatoeba.ts` (streaming); `run.ts` orquestra |
| `data/curated/` | `lemmas.tsv` (447 lemas + glosa pt + coluna `rev`), `sentences.tsv` (90 frases autorais), `texts.tsv` (14 textos) |
| `data/source/` | snapshot das linhas de origem dos lemas escolhidos (fonte dos testes de aceite) |
| `data/build/report.json` | relatório do último build (contagens, lemas ignorados, frases rejeitadas, glosas repetidas/não revisadas) |
| `data/raw/` | downloads (ignorado pelo git) |
| `public/data/content.json` | **conteúdo consumido pelo app** (~0,9 MB, gerado, versionado) |
| `public/fonts/` | Inter e Noto Sans (latin + cyrillic, SIL OFL) |
| `shared/` | código usado por app **e** Worker: `russian.ts` (acento, normalização, transliteração, leitura), `days.ts` (dia local, ofensiva), `types.ts` |
| `src/lib/` | núcleo: `srs`, `db`, `sync`, `grammar` (casos), `verbs` (conjugação), `formlabel`, `queue`, `stats`, `reading`, `readex`, `resume`, `content`, `alphabet` |
| `src/components/` | `Providers` (contextos), `Practice` → `Session` → `exercises/*` (um arquivo por tipo), `TypeInput`, `Ru`, `ui`, `TabBar`, `SwRegister` |
| `src/app/` | rotas: `/` (Hoje), `/alfabeto`, `/vocabulario`, `/gramatica` (Casos + Verbos), `/leitura`, `/config`, `/sobre` |
| `worker/` | `src/index.ts` (API), `migrations/0001_init.sql` e `0002_drop_unused.sql`, `wrangler.toml` |
| `public/sw.js` + `scripts/gen-sw.mjs` | service worker (template) e o pós-build que injeta versão e lista de pré-cache |
| `tests/` (vitest), `e2e/` (Playwright via `node:test`), `.github/workflows/ci.yml` | ver §9 |

## 3. Pipeline de dados (`npm run data`)

1. **fetch** (`fetch.ts`): baixa `nouns/adjectives/verbs/others.csv` (OpenRussian, na prática TSV), `ru_50k.txt` (frequência) e os dumps do Tatoeba. Idempotente (`--refresh` rebaixa; `--no-fetch` só reconstrói). Grava `data/raw/fetch-report.json` com hash de cada arquivo.
2. **normalizar** (`openrussian.ts`): converte a notação com apóstrofo (`молоко'`) para U+0301; monossílabos perdem a marca (`canon`); células com lixo são marcadas em `broken` e ignoradas. Produz `RawLemma` com `forms` (por coluna de origem, ex. `sg_gen`, `decl_f_acc`) e um `index` forma-sem-acento → formas acentuadas.
3. **filtrar/gerar** (`build.ts`, assíncrono):
   - Seleciona **só os lemas listados em `lemmas.tsv`**, resolvendo homógrafos por `pos`, dica em inglês (`hint`), formas completas e frequência.
   - Ordena por frequência → `r` (rank), `lv` (A1 ≤150, A2 ≤320, B1 resto — heurística).
   - `toForms` descarta variantes sem acento obrigatório; para adjetivos **desdobra o acusativo** em `inan` (= nominativo) e `anim` (= genitivo). `lemmaCasesOk` decide `gram=1` (nom/gen/acc completos e acentuados) e `gx=1` (além disso, dativo/instrumental/preposicional completos).
   - **Frases**: cada frase (autoral ou do Tatoeba) é resolvida token a token contra o índice de formas (`resolveSentence`). Palavra desconhecida ou acento ambíguo ⇒ rejeitada. O resultado são tokens `[forma exibida, lemaId, espaçoAntes]`.
   - Verifica glosas repetidas (mesmo pt + classe + aspecto) e conta as não revisadas; escreve `content.json`, `report.json` e o snapshot `data/source/*`.
4. **Tatoeba** (`tatoeba.ts`): descomprime as sentenças com `bzip2` do sistema ou `seek-bzip` (JS), mantém só russo curto em cirílico, lê o arquivo de links (`tar` em **streaming**, sem carregá-lo na memória) e devolve pares ru↔pt do tamanho mais próximo de 6 palavras. O build usa até 500 (3–9 palavras) que resolvem 100 % nos dados. Falhas aparecem no console.

## 4. Modelo de dados

### `content.json` (`shared/types.ts`)
- `Lemma`: `id` (`n:дом`, `a:…`, `v:…`, `o:…`), `t` sem acento, `s` com acento, `pos`, `pt`/`en`, `r` rank, `lv`, `g` gênero, `an` animado, `gram` (nom/acc/gen), `gx` (+ prep/dat/inst), `sgo`/`plo` (só singular/plural), `asp`.
- `Form`: `l` lema, `v[]` variantes aceitas (1ª canônica), `c` caso, `n` número, `g` gênero, `tn`/`p`/`as` (verbos), `an` (`anim|inan`). `id` = `lema|coluna[|inan|anim]` — rastreia a coluna de origem e identifica a forma nos cartões de acento.
- `Sentence`: `ru` acentuado, `pt`, `src` (`autoral` ou `tatoeba:ID`), `tk` tokens, `tx` id do texto. `TextDoc`: `{id,title,sentences[]}`.
- Hoje: 447 lemas (221 subst., 68 adj., 88 verbos, 70 outras), 5 400 formas, 590 frases (90 autorais + 500 Tatoeba; 325 lemas com exemplo), 14 textos. 275 lemas com `gram`, 237 com `gx`.
- `ContentIndex` (`lib/content.ts`): mapas `lemma`, `formsOf`, `formById`, `sentencesOf`, `sentence`.

### IndexedDB (`src/lib/db.ts`, base `rusapp` v1)
- `cards` `{id, kind, ref, fsrs, due, updatedAt}` — **cache derivado**.
- `reviews` `{id, card, rating 1–4, ts, resp, correct, dev, synced}` — **fonte da verdade**; índices `card`, `synced`, `ts`.
- `settings` `{key, value, updatedAt, dirty}` — LWW por chave. Chaves: `dailyGoal`, `newPerDay`, `tz`, `freeze`.
- `meta` — `deviceId` (UUID curto), `cursor` de sync.

### D1 (`worker/migrations`)
`review_log` (id único, `seq` monotônico) e `setting` (LWW, `seq`). A migração `0002` remove tabelas antigas (lembretes, cache de cartões, conteúdo).

## 5. Núcleo do cliente

### Cartões e SRS (`srs.ts`)
- Tipos (`CardKind`): `vprod` (pt→ru digitando), `vrec` (ru→pt, autoavaliação), `stress` (tocar a vogal tônica — de lemas **e de formas flexionadas**), `gram` (forma de caso), `verb` (forma verbal), `read` (leitura de palavra).
- `id = "<kind>|<ref>"`; `gram`: `ref = lema|caso|número|gênero|animacidade`; `verb`: `lema|tempo|pessoa|número|gênero`; `stress`: id do lema, ou id da forma (contém `|`).
- **Estado do cartão = função pura da sequência de revisões** (`replayCard`: ordena por `(ts,id)`, aplica `ts-fsrs` sem fuzz, retenção 0,9). O sync só troca revisões (idempotentes por id) e os aparelhos convergem sem resolver conflitos de estado.
- Nota → rating: acerto = Bom (3); acerto com dica = Difícil (2); erro = Errei (1); botão "Fácil" (4) opcional.

### Filas (`queue.ts`)
`buildQueue` = devidos (`reps>0 && due<=agora`, mais antigos primeiro) + novos até o orçamento do dia (`newPerDay` menos os já vistos hoje **por tipo**). `vrec`/`stress` só para lemas cujo `vprod` já foi estudado; `stress`/`read` exigem ≥ 2 sílabas. Depois dos lemas, `stress` oferece as formas de `stressShiftForms` (a tônica muda de sílaba em relação ao lema, sem repetir grafia). `gram` segue `gramKeys`; `verb` segue `verbKeys`.

### Casos (`grammar.ts`)
- `gramKeys` (memoizado por conteúdo): nom/acc/gen para `gram`; prep/dat/inst só para `gx`. Currículo (`stageOf`): substantivos nom → acc sg → gen sg → gen pl → resto → prep → dat → inst; depois adjetivos (nom, acc, gen, prep, dat, inst).
- **A resposta correta é sempre a tabela `form`** (`answerFor`). `checkAnswer` usa `normalizeAnswer` (NFC, minúsculas, sem U+0301, ё≡е, espaços colapsados) — exata nas letras.
- `explain`: cada regra de terminação (`NOUN_RULES`, `ADJ_RULES`) tem um padrão `re`. A regra só é mostrada se a forma real a cumpre (`ruleHolds`); senão aparece "irregular — memorize". Também detecta, por comparação (sem gerar), forma suplétiva, raiz que muda, mudança de sílaba tônica e o erro ы/и.

### Verbos (`verbs.ts`)
`verbKeys` lista as formas existentes nos dados (presente/futuro de 6 pessoas, passado m/f/n/pl, imperativo sg/pl), por lema e em ordem de pessoa; omite o presente de "быть". `promptVerb` monta o rótulo ("presente · eu", "futuro (perfectivo)", "passado · feminino"…). `explainVerb` lê a classe de conjugação da forma de "tu" nos dados (-ешь/-ишь), aplica a mesma lógica "regra só se bater" e acrescenta mutação de radical e deslocamento do acento.

### Leitura, estatísticas, retomada
- `reading.ts`: cobertura de um texto = % de tokens cujo lema é "conhecido". Faixa ideal 95–98 %; lista ordenada pela distância a 96,5 %.
- `stats.ts`: configurações (defaults: meta 20, 8 novos/dia, fuso do aparelho, congelamento off), dias estudados, ofensiva (`shared/days.computeStreak`), retenção 30 d (exclui a 1ª exposição), erros por caso, devidos, maduros.
- `resume.ts`: guarda fila e posição em `localStorage` (36 h) para "Continuar de onde parou"; a rota recebe `?continue=<kind>`.
- `shared/russian.ts`: `phonetic` é **aproximação** para falantes de pt (redução vocálica, vozeamento, г→в em -ого/-его, -тся→[ца] e poucas exceções lexicais); `transliterate` é BGN simplificado.

## 6. Sync e Worker

**Cliente** (`sync.ts`, orquestrado em `Providers`): `syncNow` ao iniciar, ao voltar online e 2,5 s após cada resposta/configuração. Loop (≤ 200 voltas): envia até 400 revisões não sincronizadas + configurações sujas; aplica o que veio (`ingestRemote` em **uma transação**, `ingestSettings`), grava o cursor `{r,s}`; repete enquanto `more` ou houver pendências. Offline: o erro é mostrado e tudo é reenviado depois.

**Worker** (`worker/src/index.ts`):
- `GET /api/health` (público); `POST /api/sync` exige `Authorization: Bearer APP_TOKEN` (tempo constante); CORS por `ALLOWED_ORIGIN`.
- Entrada defensiva: corpo ≤ 1 MB (413), JSON inválido/não-objeto (400), tipos errados ignorados, `rating` inteiro 1–4, chaves de configuração validadas, qualquer exceção → 500 genérico.
- Escrita em lotes de 50: `review_log` `INSERT OR IGNORE` (idempotente) e `setting` com upsert **LWW**; `seq = MAX(seq)+1`.
- Leitura: até 500 revisões e 500 configurações com `seq > cursor`; `more` se houver mais. Até 1000 revisões e 100 configurações por requisição.

**Backup** (`Store.exportBackup/importBackup`, tela Configurações): JSON com revisões + configurações; importar mescla (idempotente) e as revisões entram como "não enviadas".

## 7. PWA / offline

- `next build` (export estático, `trailingSlash`) → `scripts/gen-sw.mjs` percorre `out/`, calcula um hash de conteúdo (versão) e injeta em `out/sw.js` a lista de URLs a pré-cachear (inclui as 4 fontes).
- `sw.js`: `install` pré-cacheia cada arquivo de forma independente (**sem** `skipWaiting`); `activate` apaga caches antigos e assume as páginas; `fetch` (só GET same-origin) é **cache-first** com cache de runtime, fallback de navegação para `/` e `ignoreSearch` para navegação e `?_rsc=`. Chamadas ao Worker nunca passam pelo SW.
- Atualização: `SwRegister` detecta uma versão esperando e mostra "Nova versão disponível"; só ao tocar em **Atualizar** envia `SKIP_WAITING` e recarrega.
- `public/_headers`: `no-cache` em `sw.js`, manifesto e `data/*`; `immutable` em `fonts/*`.

## 8. Telas e componentes

- `Providers` abre o `Store` e carrega o conteúdo em paralelo. Dois contextos: **`useApp()`** (store, índice, `cards`, `reviews`, `settings`, `review()`, `update()`, `reload()`) e **`useSync()`** (status e controle do sync). Cada resposta atualiza `cards`/`reviews` de forma incremental; só importações e pulls releem o banco. Pede `navigator.storage.persist()`.
- `Practice` (devidos/novos, retomar, começar) → `Session` (fila de ≤ 15 itens; erro volta **uma vez** ao fim; guarda progresso; o botão não trava se a gravação falhar) → `Exercise` (despacha por tipo em `components/exercises/`). `ResultBar` anuncia o resultado (`role=status`) e tinge a página.
- Páginas: **Hoje** (ofensiva, calendário de 7 dias, retomar, devidos, "Seu caminho" em 7 etapas, plano, retenção, erros por caso; o relógio atualiza a cada minuto), **Alfabeto**, **Vocabulário** (digitar / reconhecer / acento), **Gramática** (Casos com filtro Tudo/Nom./Acus./Gen./Prep./Dat./Inst. + Verbos), **Leitura**, **Config** (metas com commit no blur, fuso, congelamento, sync, backup), **Sobre**.
- Estilo: Tailwind com tokens CSS e modo escuro automático; fontes autohospedadas (Inter para a interface, Noto Sans para o russo).

## 9. Qualidade e testes

- `npm run lint`, `npm run typecheck` (app + worker), `npm test` (vitest, 65 testes, ~6 s), `npm run build && npm run test:e2e` (8 cenários). O **CI** (`.github/workflows/ci.yml`) roda tudo e `npm audit --omit=dev --audit-level=high`.
- **vitest**: aceite dos dados contra o snapshot, currículo e casos estendidos, regra × dados (casos e verbos), ausência de russo sem acento (incluindo explicações e rótulos de verbos), acento de formas, glosas sem repetição, normalização/leitura, dias/ofensiva, FSRS determinístico, filas, estatísticas, retomada, leitura graduada, Worker real em Miniflare + D1 emulado (auth, CORS, entradas inválidas, idempotência, LWW, convergência de 2 aparelhos, paginação > 500) e backup.
- **e2e** (Chromium emulando iPhone 13, serve `out/`): telas + auditoria de acento/toque/rolagem + capturas em `docs/screens/`; fluxo de estudo; **offline completo**; sync ponta a ponta entre 2 contextos; retomada de sessão; verbos e casos novos; acento de forma flexionada; backup entre dois aparelhos.
- Não coberto: WebKit real e o banner de atualização do service worker.

## 10. Comandos e fluxo de trabalho

```
npm run data            # pipeline (rede na 1ª vez)         npm run dev     # http://localhost:3000
npm run build           # export + service worker           npm run lint / typecheck / test
npx playwright install chromium && npm run test:e2e         # uma vez + sempre após o build
npm run worker:migrate:local && npm run worker:dev          # Worker em :8787 (precisa worker/.dev.vars)
```
Antes de concluir qualquer mudança: lint + typecheck + test. Decisões novas vão em `DECISIONS.md`.

## 11. Invariantes e armadilhas

- Para mudar o conteúdo: edite `data/curated/*` e rode `npm run data` — **não** edite `content.json`.
- A resposta de qualquer exercício gerativo vem de `form`; ao adicionar regras em `explain`/`explainVerb`, dê a elas um padrão `re` e rode os testes de "regra × dados" e de "nenhuma palavra sem acento" (use `-fragmento` com hífen para terminações).
- O estado de um cartão nunca deve ser gravado "à mão": só `recordReview` + `rebuildCard`.
- IDs de revisão = `deviceId:ts:contador`; o servidor depende da unicidade para a idempotência.
- Novo tipo de cartão: `CardKind` (srs), `KIND_LABEL/KIND_HREF` (resume), `newItems` (queue), componente em `exercises/` e `exercises/index.tsx`.
- Windows: se `next dev` falhar com `@swc/helpers`, apague `node_modules` e `package-lock.json` e reinstale.
