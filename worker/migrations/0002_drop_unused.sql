-- Remove o que o Worker não usa mais: lembretes (Telegram), cache de cartões (cada aparelho recalcula por replay)
-- e as tabelas de conteúdo (o app lê public/data/content.json).
DROP TABLE IF EXISTS reminder_log;
DROP TABLE IF EXISTS card;
DROP TABLE IF EXISTS lemma;
DROP TABLE IF EXISTS form;
DROP TABLE IF EXISTS sentence;
