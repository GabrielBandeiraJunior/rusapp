// Pós-build: preenche out/sw.js com a lista de arquivos a pré-cachear e uma versão (hash do conteúdo).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = 'out';
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(OUT);

const urls = new Set();
const hash = createHash('sha1');
for (const f of files.sort()) {
  const rel = relative(OUT, f).split(sep).join('/');
  if (rel === 'sw.js' || rel.endsWith('.map') || rel === '404.html') continue;
  hash.update(rel).update(readFileSync(f));
  if (rel === 'index.html') urls.add('/');
  else if (rel.endsWith('/index.html')) urls.add('/' + rel.slice(0, -'index.html'.length));
  urls.add('/' + rel);
}
const version = hash.digest('hex').slice(0, 12);
const tpl = readFileSync(join(OUT, 'sw.js'), 'utf8');
writeFileSync(join(OUT, 'sw.js'), tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify([...urls].sort())));
console.log(`[sw] ${urls.size} URLs, versão ${version}`);
