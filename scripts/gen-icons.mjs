// Gera os PNGs dos ícones a partir do SVG (usa o Chromium/Playwright do ambiente).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `public/icons/${name}`, omitBackground: true });
  await page.close();
}
await browser.close();
