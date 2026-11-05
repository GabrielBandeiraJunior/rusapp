import { fetchAll } from './fetch.ts';
import { build } from './build.ts';

const refresh = process.argv.includes('--refresh');
const skipFetch = process.argv.includes('--no-fetch');
if (!skipFetch) {
  const rep = await fetchAll(refresh);
  for (const r of rep) console.log(`[fetch] ${r.name}: ${r.status}${r.error ? ' — ' + r.error : ''}`);
}
const summary = build();
console.log('[build]', JSON.stringify(summary));
