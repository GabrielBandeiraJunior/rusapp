const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const OUT = path.resolve(__dirname, '..', 'out');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.join(OUT, p);
      if (!file.startsWith(OUT)) { res.writeHead(403).end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function newPhone(browser, extra = {}) {
  const d = devices['iPhone 13'];
  return browser.newContext({ ...d, viewport: { width: 390, height: 844 }, serviceWorkers: 'allow', ...extra });
}

const VOWELS = 'аеёиоуыэюя';
/** Tokens cirílicos com ≥2 vogais, sem acento/ё e que não são afixos (-ого, +ов, /ев…). */
function findUnaccented(text) {
  const bad = [];
  const re = /[Ѐ-ӿ́]+/g;
  let m;
  while ((m = re.exec(text.normalize('NFC')))) {
    const tok = m[0];
    const vowels = [...tok].filter((c) => VOWELS.includes(c.toLowerCase())).length;
    const prev = text[m.index - 1] || '';
    if (vowels < 2 || tok.includes('́') || tok.toLowerCase().includes('ё')) continue;
    if ('-+/(→'.includes(prev) || prev === '–') continue; // afixo / terminação
    if (text[m.index + tok.length] === '-') continue;
    bad.push(tok);
  }
  return bad;
}

module.exports = { startServer, newPhone, chromium, findUnaccented, OUT };
