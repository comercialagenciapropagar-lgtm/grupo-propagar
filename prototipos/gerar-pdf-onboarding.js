const puppeteer = require('/Users/robertoaraujo/Documents/grupo-propagar/08-social-media-agent/node_modules/puppeteer');
const path = require('path');

const jobs = [
  {
    html: path.resolve(__dirname, 'contrato-parceria-gestor-v2.html'),
    pdf:  path.resolve(__dirname, 'contrato-parceria-gestor-v2.pdf'),
    options: { format: 'A4', margin: { top: '18mm', right: '18mm', bottom: '20mm', left: '18mm' }, printBackground: true },
  },
  {
    html: path.resolve(__dirname, 'onboarding-gestor-trafego.html'),
    pdf:  path.resolve(__dirname, 'onboarding-gestor-trafego.pdf'),
    // Slide 1280x720 (16:9)
    options: { width: '1280px', height: '720px', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } },
  },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    for (const job of jobs) {
      const page = await browser.newPage();
      const url = 'file://' + job.html;
      console.log('→', url);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      // força fontes do Google carregarem
      await page.evaluateHandle('document.fonts.ready');
      await page.pdf({ path: job.pdf, ...job.options });
      await page.close();
      console.log('  PDF gerado:', job.pdf);
    }
  } finally {
    await browser.close();
  }
})();
