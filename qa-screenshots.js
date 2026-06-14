const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const target = 'file://' + path.resolve(__dirname, 'index.html');
const outDir = path.resolve(__dirname, 'qa-shots');
fs.mkdirSync(outDir, { recursive: true });

const sections = [
  { name: 'hero', selector: 'header.hero' },
  { name: 'services', selector: '#services' },
  { name: 'why', selector: '#why' },
  { name: 'process', selector: '#process' },
  { name: 'contact', selector: '#contact' },
  { name: 'footer', selector: 'footer' },
];

async function setLang(page, lang) {
  await page.evaluate((lang) => {
    localStorage.setItem('site-language', lang);
  }, lang);
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate((lang) => {
    const btn = document.querySelector(`.lang-btn[data-lang="${lang}"]`);
    if (btn) btn.click();
  }, lang);
  await page.waitForTimeout(300);
}

async function captureVariant(browser, variantName, lang, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(target, { waitUntil: 'networkidle' });
  await setLang(page, lang);

  await page.screenshot({ path: path.join(outDir, `${lang}-${variantName}-full.png`), fullPage: true });

  for (const section of sections) {
    const locator = page.locator(section.selector).first();
    await locator.evaluate((el) => {
      el.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(300);
    await locator.screenshot({ path: path.join(outDir, `${lang}-${variantName}-${section.name}.png`) });
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const lang of ['en', 'ua']) {
      await captureVariant(browser, 'desktop', lang, {
        viewport: { width: 1440, height: 2200 },
        deviceScaleFactor: 1,
      });

      await captureVariant(browser, 'mobile', lang, {
        ...devices['iPhone 13'],
      });
    }
  } finally {
    await browser.close();
  }

  console.log(outDir);
})();
