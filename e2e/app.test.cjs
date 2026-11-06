// E2E (Playwright + node:test) em viewport de iPhone 390x844. Requer `npm run build` antes (out/).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, newPhone, chromium, findUnaccented, OUT } = require('./helpers.cjs');

let server, url, browser, content;
const SHOTS = path.resolve(__dirname, '..', 'docs', 'screens');

test.before(async () => {
  assert.ok(fs.existsSync(path.join(OUT, 'index.html')), 'rode `npm run build` antes dos testes e2e');
  ({ server, url } = await startServer());
  browser = await chromium.launch();
  content = JSON.parse(fs.readFileSync(path.join(OUT, 'data', 'content.json'), 'utf8'));
  fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => {
  await browser?.close();
  server?.close();
});

const ready = (page) => page.waitForSelector('[data-testid=loading]', { state: 'detached', timeout: 15000 });
const strip = (s) => s.normalize('NFC').replace(/́/g, '');
async function next(page) {
  await page.getByTestId('next').click();
  await page.getByTestId('result').waitFor({ state: 'detached' }); // a próxima pergunta já foi renderizada
}
const CASE_EN = { nominativo: 'nom', genitivo: 'gen', acusativo: 'acc' };

async function audit(page, name) {
  const text = await page.evaluate(() => document.body.innerText);
  assert.deepEqual(require('./helpers.cjs').findUnaccented(text), [], `[${name}] palavras russas sem acento`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `[${name}] rolagem horizontal (${overflow}px)`);
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a[href], select, input:not([type=checkbox])')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (Math.min(r.width, r.height) < 43.5) out.push(`${el.tagName}:${(el.textContent || el.getAttribute('aria-label') || '').slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const el of document.querySelectorAll('input[type=checkbox]')) {
      const r = (el.closest('label') || el).getBoundingClientRect();
      if (r.height < 43.5) out.push(`checkbox-label ${Math.round(r.height)}`);
    }
    return out;
  });
  assert.deepEqual(small, [], `[${name}] alvos de toque < 44px`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function doVocabNewRound(page) {
  await page.getByTestId('start').click();
  for (;;) {
    if (await page.getByTestId('summary').isVisible().catch(() => false)) break;
    const nw = page.getByTestId('newword');
    await nw.waitFor({ timeout: 5000 });
    const word = strip(await nw.innerText());
    await page.getByLabel('Resposta em russo').fill(word);
    await page.getByTestId('check').click();
    await page.getByText('Correto!').waitFor();
    await next(page);
  }
}

function gramAnswer(lemmaS, targetText) {
  const lemma = content.lemmas.find((l) => l.s === lemmaS.normalize('NFC'));
  assert.ok(lemma, `lema não encontrado: ${lemmaS}`);
  const parts = targetText.replace('→', '').split('·').map((s) => s.trim());
  const c = CASE_EN[parts[0]];
  const f = content.forms.filter((x) => x.l === lemma.id && x.c === c);
  let cand;
  if (lemma.pos === 'noun') cand = f.find((x) => x.n === (parts[1] === 'plural' ? 'pl' : 'sg'));
  else {
    const pl = parts[1] === 'plural';
    const g = parts[1].startsWith('masculino') ? 'm' : parts[1].startsWith('feminino') ? 'f' : parts[1].startsWith('neutro') ? 'n' : undefined;
    const an = parts[2] === 'animado' ? 'anim' : parts[2] === 'inanimado' ? 'inan' : undefined;
    cand = f.find((x) => (pl ? x.n === 'pl' : x.n === 'sg' && x.g === g) && (an ? x.an === an : true));
  }
  assert.ok(cand, `forma não encontrada ${lemmaS} ${targetText}`);
  return cand.v;
}

test('telas principais: layout mobile, acentos, alvos de toque e capturas', async () => {
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  await page.goto(url + '/');
  await ready(page);
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor();
  await audit(page, 'home');
  await shot(page, '01-hoje');

  await page.goto(url + '/alfabeto/');
  await ready(page);
  await page.getByTestId('letter-grid').waitFor();
  await page.getByRole('button', { name: /^Ж ж/ }).click();
  assert.match(await page.getByTestId('letter-sound').innerText(), /jato/);
  await audit(page, 'alfabeto-letras');
  await shot(page, '02-alfabeto-letras');
  await page.getByRole('tab', { name: 'Regras' }).click();
  await page.getByText('Acento livre e redução vocálica').waitFor();
  await audit(page, 'alfabeto-regras');
  await shot(page, '03-alfabeto-regras');
  await page.getByRole('tab', { name: 'Praticar' }).click();
  await page.getByTestId('start').click();
  await page.getByTestId('mode').waitFor();
  await audit(page, 'alfabeto-praticar');
  await shot(page, '04-alfabeto-praticar');

  await page.goto(url + '/vocabulario/');
  await ready(page);
  await page.getByTestId('start').waitFor();
  await audit(page, 'vocab-menu');
  await page.getByTestId('start').click();
  await page.getByTestId('newword').waitFor();
  await audit(page, 'vocab-novo');
  await shot(page, '05-vocabulario');
  const inp = page.getByLabel('Resposta em russo');
  for (const [attr, val] of [['autocorrect', 'off'], ['autocapitalize', 'off'], ['autocomplete', 'off'], ['spellcheck', 'false']])
    assert.equal(await inp.getAttribute(attr), val, `input ${attr}`);
  await inp.fill(strip(await page.getByTestId('newword').innerText()));
  await page.getByTestId('check').click();
  await page.getByTestId('result').waitFor();
  await audit(page, 'vocab-resultado');

  await page.goto(url + '/gramatica/');
  await ready(page);
  await page.getByTestId('start').click();
  await page.getByTestId('target').waitFor();
  await audit(page, 'gramatica-pergunta');
  await shot(page, '06-gramatica');
  await page.getByLabel('Forma em russo').fill('ъъъ');
  await page.getByTestId('check').click();
  await page.getByTestId('result').waitFor();
  await audit(page, 'gramatica-feedback');
  await shot(page, '07-gramatica-feedback');

  await page.goto(url + '/leitura/');
  await ready(page);
  await page.getByTestId('text-item').first().waitFor();
  await audit(page, 'leitura-lista');
  await shot(page, '08-leitura-lista');
  await page.getByTestId('text-item').first().click();
  await page.getByTestId('coverage').waitFor();
  await page.getByTestId('word').first().click();
  await page.getByTestId('gloss').waitFor();
  await audit(page, 'leitura-texto');
  await shot(page, '09-leitura-texto');

  await page.goto(url + '/config/');
  await ready(page);
  await page.getByRole('heading', { name: 'Configurações' }).waitFor();
  await audit(page, 'config');
  await shot(page, '10-config');
  await page.goto(url + '/sobre/');
  await ready(page);
  await page.getByTestId('attributions').waitFor();
  assert.match(await page.getByTestId('attributions').innerText(), /OpenRussian/);
  await audit(page, 'sobre');
  await shot(page, '11-sobre');
  await ctx.close();
});

test('fluxo de estudo: vocabulário (novo→digitar), reconhecer, acento, casos, painel', async () => {
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  await page.goto(url + '/vocabulario/');
  await ready(page);
  await doVocabNewRound(page);
  await page.getByTestId('exit').click();

  // reconhecimento ru→pt
  await page.getByRole('tab', { name: 'Reconhecer' }).click();
  await page.getByTestId('start').click();
  await page.getByTestId('show').click();
  await page.getByTestId('answer').waitFor();
  await page.getByRole('button', { name: 'Acertei' }).click();
  await page.getByTestId('exit').or(page.getByTestId('show')).first().waitFor();
  if (await page.getByTestId('exit').isVisible()) await page.getByTestId('exit').click();
  else await page.getByLabel('Sair da sessão').click();

  // acento
  await page.getByRole('tab', { name: 'Acento' }).click();
  await page.getByTestId('start').click();
  const first = page.locator('[data-vowel]').first();
  await first.click();
  await page.getByTestId('result').waitFor();
  await page.getByLabel('Sair da sessão').click();

  // gramática gerativa: valida contra a tabela form
  await page.goto(url + '/gramatica/');
  await ready(page);
  await page.getByTestId('start').click();
  let correct = 0;
  for (let i = 0; i < 8; i++) {
    const lemmaS = await page.getByTestId('prompt').innerText();
    const target = await page.getByTestId('target').innerText();
    const variants = gramAnswer(lemmaS, target);
    const input = page.getByLabel('Forma em russo');
    if (i === 0) {
      await input.fill('ъъъ');
      await page.getByTestId('check').click();
      await page.getByText('Ainda não.').waitFor();
      const shown = (await page.getByTestId('answer').innerText()).normalize('NFC');
      assert.equal(shown, variants[0].normalize('NFC'), 'forma correta exibida com acento');
      assert.ok((await page.locator('[data-testid=result] li').count()) >= 1, 'feedback explica a regra');
    } else {
      // digita SEM acento e em MAIÚSCULAS: normalização tolerante
      await input.fill(strip(variants[variants.length - 1]).toUpperCase());
      await page.getByTestId('check').click();
      await page.getByText('Correto!').waitFor();
      correct++;
    }
    await next(page);
  }
  assert.equal(correct, 7);
  await page.getByLabel('Sair da sessão').click();

  // painel
  await page.goto(url + '/');
  await ready(page);
  assert.match(await page.getByTestId('streak').innerText(), /1/);
  const goal = await page.getByTestId('goal').innerText();
  assert.ok(Number(goal.split('/')[0]) >= 10, `meta de hoje: ${goal}`);
  await page.getByTestId('errors').waitFor();
  await audit(page, 'home-depois-de-estudar');
  await shot(page, '12-hoje-depois-de-estudar');
  await ctx.close();
});

test('OFFLINE: fluxo completo após a primeira carga (rede desligada)', async () => {
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  await page.goto(url + '/');
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // passa a ser controlada pelo SW
  await ready(page);
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const c = await caches.open(keys[0]);
    return !!(await c.match('/gramatica/')) && !!(await c.match('/data/content.json')) && !!(await c.match('/leitura/'));
  }, null, { timeout: 20000 });

  await ctx.setOffline(true);
  await page.reload();
  await ready(page);
  await page.getByRole('heading', { name: 'Hoje', exact: true }).waitFor();

  // navega pelas abas e estuda sem rede
  await page.getByRole('link', { name: 'Vocab.' }).click();
  await page.getByTestId('start').waitFor();
  await doVocabNewRound(page);
  await page.getByTestId('exit').click();

  await page.getByRole('link', { name: 'Casos' }).click();
  await page.getByTestId('start').click();
  const lemmaS = await page.getByTestId('prompt').innerText();
  const target = await page.getByTestId('target').innerText();
  await page.getByLabel('Forma em russo').fill(gramAnswer(lemmaS, target)[0]);
  await page.getByTestId('check').click();
  await page.getByText('Correto!').waitFor();
  await next(page);
  await page.getByLabel('Sair da sessão').click();

  await page.getByRole('link', { name: 'Leitura' }).click();
  await page.getByTestId('text-item').first().click();
  await page.getByTestId('word').first().click();
  await page.getByTestId('gloss').waitFor();
  await page.getByRole('button', { name: 'Fechar' }).click();

  await page.getByRole('link', { name: 'Alfabeto' }).click();
  await page.getByTestId('letter-grid').waitFor();

  // tudo foi gravado localmente (IndexedDB)
  const n = await page.evaluate(
    () => new Promise((res, rej) => {
      const r = indexedDB.open('rusapp');
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const q = r.result.transaction('reviews').objectStore('reviews').count();
        q.onsuccess = () => res(q.result);
      };
    }),
  );
  assert.ok(n >= 9, `revisões gravadas offline: ${n}`);
  await ctx.setOffline(false);
  await ctx.close();
});

test('SYNC ponta a ponta: dois aparelhos (contextos) contra o Worker + D1 emulado via HTTP', async () => {
  const { build } = require('esbuild');
  const { Miniflare } = require('miniflare');
  const { readdirSync, readFileSync } = fs;
  await build({ entryPoints: [path.resolve(__dirname, '../worker/src/index.ts')], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: path.resolve(__dirname, '../worker/dist/index.js'), logLevel: 'silent' });
  const mf = new Miniflare({
    modules: true, scriptPath: path.resolve(__dirname, '../worker/dist/index.js'), compatibilityDate: '2025-01-01',
    d1Databases: { DB: 'e2e-db' }, bindings: { APP_TOKEN: 'e2e-token', ALLOWED_ORIGIN: url }, port: 0, host: '127.0.0.1',
  });
  try {
    const workerUrl = (await mf.ready).toString().replace(/\/$/, '');
    const db = await mf.getD1Database('DB');
    const dir = path.resolve(__dirname, '../worker/migrations');
    for (const f of readdirSync(dir).sort()) {
      const sql = readFileSync(path.join(dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
    }
    const connect = async (page) => {
      await page.goto(url + '/config/');
      await ready(page);
      await page.getByLabel('URL do Worker').fill(workerUrl);
      await page.getByLabel('Token').fill('e2e-token');
      await page.getByRole('button', { name: 'Salvar e sincronizar' }).click();
      await page.getByTestId('sync-state').getByText(/Em dia/).waitFor({ timeout: 15000 });
    };
    const goal = async (page) => {
      await page.goto(url + '/');
      await ready(page);
      return Number((await page.getByTestId('goal').innerText()).split('/')[0]);
    };
    const A = await (await newPhone(browser)).newPage();
    const B = await (await newPhone(browser)).newPage();
    await connect(A);
    await A.goto(url + '/vocabulario/');
    await ready(A);
    await doVocabNewRound(A); // 8 revisões novas no aparelho A
    await A.getByTestId('exit').click();
    await connect(A); // força sync
    const ga = await goal(A);
    assert.ok(ga >= 8);
    await connect(B); // B é um aparelho novo: puxa tudo
    assert.equal(await goal(B), ga, 'B recebeu as revisões de A');
    // B estuda mais; A sincroniza e converge
    await B.goto(url + '/vocabulario/');
    await ready(B);
    await B.getByRole('tab', { name: 'Reconhecer' }).click();
    await B.getByTestId('start').click();
    await B.getByTestId('show').click();
    await B.getByRole('button', { name: 'Fácil' }).click();
    await B.getByTestId('progress').filter({ hasText: /^2\// }).waitFor(); // revisão gravada → próxima pergunta
    await connect(B);
    const gb = await goal(B);
    assert.equal(gb, ga + 1);
    await connect(A);
    assert.equal(await goal(A), gb, 'A convergiu com B');
    const total = await db.prepare('SELECT COUNT(*) AS n FROM review_log').first();
    assert.equal(total.n, gb, 'servidor guarda todas as revisões, sem duplicar');
  } finally {
    await mf.dispose();
  }
});

test('continuar de onde parou: sai no meio da sessão e retoma pela tela inicial', async () => {
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  await page.goto(url + '/vocabulario/');
  await ready(page);
  await page.getByTestId('start').click();
  for (let i = 0; i < 2; i++) {
    const word = strip(await page.getByTestId('newword').innerText());
    await page.getByLabel('Resposta em russo').fill(word);
    await page.getByTestId('check').click();
    await next(page);
  }
  assert.match(await page.getByTestId('progress').innerText(), /^3\//);
  await page.getByLabel('Sair da sessão').click(); // abandona no meio
  await page.goto(url + '/');
  await ready(page);
  const card = page.getByTestId('continue-card');
  await card.waitFor();
  assert.match(await card.innerText(), /2\/\d+/);
  assert.ok((await page.getByTestId('path').count()) === 1, 'caminho de aprendizado visível');
  assert.match(await page.getByTestId('streak-days').innerText(), /\d/);
  await page.screenshot({ path: path.join(SHOTS, '00-inicio.png'), fullPage: false });
  await card.click();
  await ready(page);
  await page.getByTestId('progress').waitFor();
  assert.match(await page.getByTestId('progress').innerText(), /^3\//, 'retoma na questão 3');
  await ctx.close();
});

test('novos recursos: casos extras, frases, verbos, erros, backup, tema e teclado', async () => {
  const ctx = await newPhone(browser, { acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const now = Date.now();
  const rev = (card, correct, i) => ({ id: `seed:${i}`, card, rating: correct ? 3 : 1, ts: now - 2 * 86400e3 + i, resp: '', correct: correct ? 1 : 0, dev: 'seed' });
  const backup = {
    app: 'russo', v: 1, exportedAt: now, settings: [],
    reviews: [
      rev('vprod|v:делать', true, 1), rev('vprod|v:сделать', true, 2), rev('vprod|v:идти', true, 3), rev('vprod|v:ходить', true, 4),
      rev('gram|n:дом|prep|sg|-|-', false, 5),
    ],
  };

  // --- backup: importar
  await page.goto(url + '/config/');
  await ready(page);
  await page.getByTestId('import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByTestId('backup-msg').waitFor();
  assert.match(await page.getByTestId('backup-msg').innerText(), /Importado: 5/);
  await page.getByTestId('import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nada":1}') });
  await page.waitForFunction(() => /não é um backup/.test(document.querySelector('[data-testid=backup-msg]')?.textContent || ''));
  // --- backup: exportar
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()]);
  const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(exported.app, 'russo');
  assert.ok(exported.reviews.length >= 5);
  // --- tema escuro manual
  await page.getByLabel('Tema').selectOption('dark');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await audit(page, 'config');
  await page.getByLabel('Tema').selectOption('auto');

  // --- Casos: preposicional (aba, mini-lição, exercício)
  await page.goto(url + '/gramatica/');
  await ready(page);
  await page.getByRole('tab', { name: 'Prep.' }).click();
  await page.getByTestId('lesson').waitFor();
  await page.getByTestId('lesson').locator('summary').click();
  assert.match(await page.getByTestId('lesson').innerText(), /в до́ме/);
  await audit(page, 'casos-prep');
  for (const tab of ['Nom.', 'Acus.', 'Gen.', 'Dat.', 'Inst.', 'Prep.']) {
    await page.getByRole('tab', { name: tab }).click();
    const d = page.getByTestId('lesson').locator('details');
    if (!(await d.evaluate((el) => el.open))) await page.getByTestId('lesson').locator('summary').click();
    await audit(page, 'licao-' + tab);
  }
  await page.getByTestId('start').click();
  const target = await page.getByTestId('target').innerText();
  assert.match(target, /preposicional/);
  const lemmaText = strip(await page.getByTestId('prompt').innerText());
  const lem = content.lemmas.find((l) => l.t === lemmaText && l.pos === 'noun');
  const f = content.forms.find((x) => x.l === lem.id && x.c === 'prep' && x.n === (/plural/.test(target) ? 'pl' : 'sg'));
  await page.getByLabel('Forma em russo').fill(strip(f.v[0]));
  await page.getByTestId('check').click();
  assert.match(await page.getByTestId('result').innerText(), /Correto/);
  await page.getByTestId('next').click();
  await page.getByLabel('Sair da sessão').click();

  // --- teclado russo na tela
  await page.goto(url + '/gramatica/');
  await ready(page);
  await page.getByRole('tab', { name: 'Dat.' }).click();
  await page.getByTestId('start').click();
  await page.getByTestId('kb-toggle').click();
  await page.getByTestId('kb').getByRole('button', { name: 'д', exact: true }).click();
  assert.equal(await page.getByLabel('Forma em russo').inputValue(), 'д');
  await page.getByTestId('kb').getByRole('button', { name: 'Apagar' }).click();
  assert.equal(await page.getByLabel('Forma em russo').inputValue(), '');
  await audit(page, 'teclado');
  await page.getByTestId('kb-toggle').click();

  // --- Casos em frases
  await page.goto(url + '/gramatica/');
  await ready(page);
  await page.getByRole('tab', { name: 'Em frases' }).click();
  await page.getByTestId('start').click();
  assert.match(await page.getByTestId('prompt').innerText(), /______/);
  await page.getByLabel('Palavra que falta').fill('zzz');
  await page.getByTestId('check').click();
  assert.match(await page.getByTestId('result').innerText(), /Ainda não/);
  assert.ok((await page.getByTestId('answer').innerText()).length > 1);
  await audit(page, 'frases');
  await next(page); // grava o erro
  await page.getByLabel('Sair da sessão').click();

  // --- Verbos: conjugação, aspecto, movimento
  await page.goto(url + '/verbos/');
  await ready(page);
  await page.getByTestId('start').click();
  assert.match(await page.getByTestId('target').innerText(), /presente|futuro|passado/);
  await page.getByLabel('Forma verbal em russo').fill('zzz');
  await page.getByTestId('check').click();
  assert.match(await page.getByTestId('result').innerText(), /Ainda não/);
  await audit(page, 'verbos-conj');
  await next(page); // grava o erro
  await page.goto(url + '/verbos/');
  await ready(page);
  await page.getByRole('tab', { name: 'Aspecto' }).click();
  await page.getByTestId('start').click();
  const from = strip(await page.getByTestId('prompt').innerText());
  const pairs = JSON.parse(fs.readFileSync(path.join(OUT, 'data', 'verbpairs.json'), 'utf8'));
  const [, toId] = pairs.find(([a]) => content.lemmas.find((l) => l.id === a).t === from);
  await page.getByLabel('Par de aspecto em russo').fill(toId.slice(2));
  await page.getByTestId('check').click();
  assert.match(await page.getByTestId('result').innerText(), /Correto/);
  await page.goto(url + '/verbos/');
  await ready(page);
  await page.getByRole('tab', { name: 'Movimento' }).click();
  assert.match(await page.getByTestId('motion-lesson').innerText(), /иду́/);
  await audit(page, 'verbos-mov');

  // --- Meus erros (inclui o erro semeado e os desta sessão)
  await page.goto(url + '/');
  await ready(page);
  await page.getByTestId('errors-card').waitFor();
  await page.getByTestId('errors-card').click();
  await ready(page);
  { const cnt = await page.getByTestId('error-count').innerText(); assert.ok(Number(cnt) >= 2, 'erros listados: ' + cnt); }
  await page.getByTestId('start').click();
  assert.ok(await page.getByTestId('progress').count());
  await audit(page, 'erros');

  assert.deepEqual(errors, [], 'erros de JS na página');
  await ctx.close();
});
