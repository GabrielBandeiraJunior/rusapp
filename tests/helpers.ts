import { build } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import { Miniflare } from 'miniflare';

export async function makeWorker(opts: { token?: string } = {}) {
  await build({
    entryPoints: ['worker/src/index.ts'], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    outfile: 'worker/dist/index.js', logLevel: 'silent', mainFields: ['module', 'main'],
  });
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'worker/dist/index.js',
    compatibilityDate: '2025-01-01',
    d1Databases: { DB: `test-${Math.random().toString(36).slice(2)}` },
    bindings: { APP_TOKEN: opts.token ?? 'secret-token' },
  });
  const db = await mf.getD1Database('DB');
  const dir = 'worker/migrations';
  for (const f of readdirSync(dir).sort()) {
    const sql = readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  }
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
    mf.dispatchFetch(typeof input === 'string' ? input : input.toString(), init as never)) as unknown as typeof fetch;
  return { mf, db, fetchImpl, base: 'http://worker.test' };
}
