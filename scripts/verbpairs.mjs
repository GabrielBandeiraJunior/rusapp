// Gera public/data/verbpairs.json a partir do snapshot OpenRussian (data/source/verbs.tsv):
// pares [de, para] de aspecto (imperfectivo<->perfectivo) em que AMBOS os verbos existem em content.json.
import { readFileSync, writeFileSync } from 'node:fs';

const content = JSON.parse(readFileSync('public/data/content.json', 'utf8'));
const verbs = new Map(content.lemmas.filter((l) => l.pos === 'verb').map((l) => [l.t, l]));
const rows = readFileSync('data/source/verbs.tsv', 'utf8').split(/\r?\n/).filter(Boolean);
const head = rows[0].split('\t');
const pairs = [];
for (const line of rows.slice(1)) {
  const f = line.split('\t');
  const o = Object.fromEntries(head.map((k, i) => [k, f[i]]));
  const a = verbs.get(o.bare);
  if (!a || !o.partner) continue;
  for (const raw of o.partner.split(/\s*,\s*/)) {
    const b = verbs.get(raw.replace(/'/g, ''));
    if (b && b.asp && a.asp && b.asp !== a.asp && !pairs.some(([x, y]) => x === a.id && y === b.id)) pairs.push([a.id, b.id]);
  }
}
// o snapshot lista o parceiro de um lado só: tornar simétrico
for (const [a, b] of [...pairs]) if (!pairs.some(([x, y]) => x === b && y === a)) pairs.push([b, a]);
pairs.sort((x, y) => verbs.get(x[0].slice(2)).r - verbs.get(y[0].slice(2)).r);
writeFileSync('public/data/verbpairs.json', JSON.stringify(pairs));
console.log(`${pairs.length} pares de aspecto`);
