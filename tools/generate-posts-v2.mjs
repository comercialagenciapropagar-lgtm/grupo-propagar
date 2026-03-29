import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, 'posts-png-v2');
const htmlPath = join(__dirname, 'posts-roberta-v2.html');

await mkdir(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 20000, deviceScaleFactor: 2 });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for fonts and images
await page.waitForFunction(() => document.fonts.ready);
await page.waitForFunction(() => {
  const imgs = document.querySelectorAll('img');
  return Array.from(imgs).every(img => img.complete && img.naturalHeight > 0);
});
await new Promise(r => setTimeout(r, 2000));

const screenshots = [
  { selector: '#post-coragem', name: '01-coragem-historia-concurso' },
  { selector: '#post-autoridade', name: '02-autoridade-quem-e-roberta' },
  { selector: '#post-fe', name: '03-fe-maternidade-presenca' },
  { selector: '.slide-hist-capa', name: '04-carrossel-capa-jornada' },
  { selector: '.slide-timeline:nth-of-type(2)', name: '05-carrossel-jornalismo' },
  { selector: '.slide-timeline:nth-of-type(3)', name: '06-carrossel-concurso' },
  { selector: '.slide-timeline:nth-of-type(4)', name: '07-carrossel-virada' },
  { selector: '.slide-timeline:nth-of-type(5)', name: '08-carrossel-hoje' },
  { selector: '.slide-hist-cta', name: '09-carrossel-cta' },
];

// Remove ALL scale transforms
await page.evaluate(() => {
  document.querySelectorAll('.scale-wrapper, .scale-wrapper-carousel').forEach(el => {
    el.style.transform = 'none';
    el.style.marginBottom = '0';
  });
});

for (const { selector, name } of screenshots) {
  try {
    const el = await page.$(selector);
    if (!el) {
      console.log(`⚠ Não encontrou: ${selector}`);
      continue;
    }

    const path = join(outputDir, `${name}.png`);
    await el.screenshot({ path, type: 'png' });
    console.log(`✓ ${name}.png`);
  } catch (err) {
    console.log(`✗ ${name}: ${err.message}`);
  }
}

await browser.close();
console.log(`\nPronto! PNGs salvos em: ${outputDir}`);
