/**
 * Render carrossel #1 (8 slides 1080x1080 PNG)
 * Embute fotos como base64 data URI pra evitar crash do Puppeteer com file:// imagens.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREVIEW = resolve(__dirname, '../content/carrossel-01-visibilidade-preview.html');
const OUT_DIR = resolve(__dirname, '../content/carrossel-01');
const HTML_DIR = resolve(OUT_DIR, '_html');
const FOTOS_DIR = '/Users/robertoaraujo/agente de instagram/instagram-agent/fotos';

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(HTML_DIR, { recursive: true });

const FONTS_LINK = `<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,700;0,900;1,400;1,700;1,900&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Manrope:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700;800&family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">`;

console.log('📂 Lendo preview...');
const previewHtml = readFileSync(PREVIEW, 'utf-8');

const cssMatch = previewHtml.match(/<style>([\s\S]*?)<\/style>/);
let css = cssMatch ? cssMatch[1] : '';

console.log('🖼️  Convertendo fotos pra base64...');
const photoCache = {};
const fileUrlRegex = /url\('file:\/\/([^']+)'\)/g;
const photosUsed = new Set();
let m;
while ((m = fileUrlRegex.exec(css)) !== null) photosUsed.add(m[1]);

for (const path of photosUsed) {
  if (!existsSync(path)) {
    console.warn(`⚠️  Foto não encontrada: ${path}`);
    continue;
  }
  const buf = readFileSync(path);
  const ext = path.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
  const dataUri = `data:image/${ext};base64,${buf.toString('base64')}`;
  photoCache[path] = dataUri;
  console.log(`   ✓ ${basename(path)} (${(buf.length / 1024).toFixed(0)}KB)`);
}

css = css.replace(fileUrlRegex, (_, path) => {
  return photoCache[path] ? `url('${photoCache[path]}')` : `url('file://${path}')`;
});

const allMatches = [
  ...previewHtml.matchAll(/<div class="slide (s\d+)">([\s\S]*?)(?=<!-- =|<\/div>\s*<\/div>\s*<div class="footer">)/g),
];

const slides = [];
for (const m2 of allMatches) {
  const slideClass = m2[1];
  const inner = m2[2];
  const fullSlide = `<div class="slide ${slideClass}">${inner}`;
  slides.push({ class: slideClass, html: fullSlide });
}

console.log(`📦 ${slides.length} slides extraídos.`);

const overrideCSS = `
html, body {
  width: 1080px;
  height: 1080px;
  overflow: hidden;
  margin: 0;
  padding: 0;
  background: transparent;
}
.slide {
  width: 1080px !important;
  height: 1080px !important;
  aspect-ratio: unset !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  margin: 0 !important;
  position: relative !important;
}
`;

console.log('📝 Gerando HTML standalone de cada slide...');
for (let i = 0; i < slides.length; i++) {
  const num = String(i + 1).padStart(2, '0');
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Slide ${num}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${FONTS_LINK}
<style>
${css}
${overrideCSS}
</style>
</head>
<body>
${slides[i].html}
</body>
</html>`;
  writeFileSync(resolve(HTML_DIR, `slide-${num}.html`), html);
}

console.log('🚀 Iniciando Puppeteer...');
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  protocolTimeout: 120000,
});

async function renderSlide(num, htmlPath, pngPath, attempt = 1) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: pngPath, type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 } });
    console.log(`✅ slide-${num}.png`);
  } catch (err) {
    console.warn(`   ⚠️  slide-${num} falhou (tentativa ${attempt}): ${err.message}`);
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000));
      try { await page.close(); } catch {}
      return renderSlide(num, htmlPath, pngPath, attempt + 1);
    }
    throw err;
  } finally {
    try { await page.close(); } catch {}
  }
}

for (let i = 0; i < slides.length; i++) {
  const num = String(i + 1).padStart(2, '0');
  const htmlPath = resolve(HTML_DIR, `slide-${num}.html`);
  const pngPath = resolve(OUT_DIR, `slide-${num}.png`);
  await renderSlide(num, htmlPath, pngPath);
}

await browser.close();
console.log(`\n🎉 ${slides.length} PNGs em: ${OUT_DIR}`);
