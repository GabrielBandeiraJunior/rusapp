// Gera os PNGs do app (192, 512, apple-touch 180) a partir de public/icons/icon.svg usando o Chromium do Playwright.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [name, size, radius] of [['icon-192', 192, true], ['icon-512', 512, true], ['apple-touch-icon', 180, false]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const body = svg.replace(/<svg /, `<svg width="${size}" height="${size}" `);
  // apple-touch-icon: sem cantos arredondados (o iOS aplica a máscara)
  await page.setContent(`<body style="margin:0;background:transparent">${radius ? body : body.replace(/ rx="\d+"/, '')}</body>`);
  writeFileSync(`public/icons/${name}.png`, await page.screenshot({ omitBackground: true }));
  await page.close();
}
await browser.close();
console.log('ícones gerados');
