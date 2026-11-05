-- Conteúdo (semeado por worker/seed/content.sql — gerado pelo pipeline)
CREATE TABLE IF NOT EXISTS lemma (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, pos TEXT NOT NULL, stress_text TEXT NOT NULL,
  gloss_pt TEXT, freq_rank INTEGER, level TEXT
);
CREATE TABLE IF NOT EXISTS form (
  id TEXT PRIMARY KEY, lemma_id TEXT NOT NULL, form_text TEXT NOT NULL, form_stress TEXT NOT NULL,
  "case" TEXT, number TEXT, gender TEXT, tense TEXT, person TEXT, aspect TEXT, animacy TEXT
);
CREATE INDEX IF NOT EXISTS form_lemma ON form(lemma_id);
CREATE TABLE IF NOT EXISTS sentence (
  id TEXT PRIMARY KEY, ru TEXT NOT NULL, ru_stress TEXT NOT NULL, pt TEXT, source TEXT
);

-- Progresso do usuário (usuário único). `seq` = cursor monotônico de sincronização.
CREATE TABLE IF NOT EXISTS card (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT NOT NULL,
  fsrs_state_json TEXT NOT NULL, due INTEGER NOT NULL, updated_at INTEGER NOT NULL, seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS card_due ON card(due);
CREATE TABLE IF NOT EXISTS review_log (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL, rating INTEGER NOT NULL, ts INTEGER NOT NULL,
  response_text TEXT, correct INTEGER NOT NULL, device TEXT, seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS review_seq ON review_log(seq);
CREATE INDEX IF NOT EXISTS review_ts ON review_log(ts);
CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL, seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS setting_seq ON setting(seq);

-- Lembretes externos já enviados (limite de 2 por dia)
CREATE TABLE IF NOT EXISTS reminder_log (
  day TEXT NOT NULL, kind TEXT NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (day, kind)
);
