import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, 'posts-png');
const htmlPath = join(__dirname, 'posts-roberta-renda-casa.html');

await mkdir(outputDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 10000, deviceScaleFactor: 2 });
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });

// Wait for fonts
await page.waitForFunction(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 2000));

const screenshots = [
  { selector: '.post1', name: '01-frase-impacto' },
  { selector: '.slide-1', name: '02-carrossel-capa' },
  { selector: '.slide-tip:nth-of-type(2)', name: '03-carrossel-forma1' },
  { selector: '.slide-tip:nth-of-type(3)', name: '04-carrossel-forma2' },
  { selector: '.slide-tip:nth-of-type(4)', name: '05-carrossel-forma3' },
  { selector: '.slide-tip:nth-of-type(5)', name: '06-carrossel-forma4' },
  { selector: '.slide-tip:nth-of-type(6)', name: '07-carrossel-forma5' },
  { selector: '.slide-cta', name: '08-carrossel-cta' },
  { selector: '.post3', name: '09-frase-emocional' },
];

for (const { selector, name } of screenshots) {
  try {
    const el = await page.$(selector);
    if (!el) {
      console.log(`⚠ Não encontrou: ${selector}`);
      continue;
    }

    // Remove ALL scale transforms in ancestors
    await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) {
        let parent = element.parentElement;
        while (parent) {
          parent.style.transform = 'none';
          parent.style.marginBottom = '0';
          parent = parent.parentElement;
        }
        element.style.transform = 'none';
      }
    }, selector);

    const path = join(outputDir, `${name}.png`);
    await el.screenshot({ path, type: 'png' });
    console.log(`✓ ${name}.png`);
  } catch (err) {
    console.log(`✗ ${name}: ${err.message}`);
  }
}

await browser.close();
console.log(`\nPronto! PNGs salvos em: ${outputDir}`);
