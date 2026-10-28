// Convert the shared guide to a selectable A4 PDF. No app, database or external content is loaded.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS rendering CLI. */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function render(args) {
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  for (const key of ['--html', '--output', '--metadata']) assert(options[key], `Missing ${key}`);
  const metadata = JSON.parse(fs.readFileSync(options['--metadata'], 'utf8'));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(path.resolve(options['--html'])).href);
    const commands = await page.locator('pre code').evaluateAll(elements => elements.map(el => ({ id: el.id, text: el.textContent })));
    assert.deepEqual(commands, metadata.commands);
    assert.equal(commands.length, 20);
    assert.equal(await page.locator('[data-copy]').count(), commands.length);
    await page.locator('details').evaluateAll(elements => elements.forEach(el => { el.open = true; }));
    assert.equal(await page.locator('details[open]').count(), 14);
    for (const command of commands) {
      await page.locator(`[data-copy="${command.id}"]`).click();
      const pasted = await page.evaluate(() => navigator.clipboard.readText());
      assert.equal(pasted.replace(/\r\n/g, '\n'), command.text, `Copy mismatch: ${command.id}`);
    }
    // Denied browser clipboard permissions must retain exact selected text for Ctrl+C.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
      document.execCommand = () => false;
    });
    await page.locator('[data-copy="resume"]').click();
    await page.waitForFunction(() => document.querySelector('#copy-status').textContent.includes('Ctrl+C'));
    assert.equal(await page.evaluate(() => window.getSelection().toString()), commands.find(c => c.id === 'resume').text);
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach(el => { el.open = false; });
      window.print = () => {};
    });
    await page.locator('#print').click();
    assert.equal(await page.locator('details[open]').count(), 14);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    assert.equal(await page.locator('details[open]').count(), 0);
    const base = `https://github.com/${metadata.repository}/releases/download/v${metadata.version}`;
    await page.evaluate(({ version, date, htmlUrl }) => {
      document.title = `InfraScope ${version} - Windows 11 / vSphere kurulum kılavuzu`;
      document.querySelectorAll('details').forEach(el => { el.open = true; });
      const intro = document.querySelector('.hero > p:not(.lead)');
      intro.replaceChildren(document.createTextNode('PDF sürümü - komutlar seçilebilir metindir. Tek tıkla kopyalamak için '));
      const link = document.createElement('a');
      link.href = htmlUrl; link.textContent = 'HTML kılavuzunu indirin';
      intro.append(link, document.createTextNode('. Komutları yalnız ilgili adımda, belirtilen PowerShell penceresinde uygulayın.'));
      document.querySelector('#hatalar > p').textContent = 'Aşağıdaki hata çözümlerinin tamamı PDF sürümünde açıktır. Sorun giderme komutlarını yalnız ilgili hata için kullanın.';
      document.querySelector('.footer').textContent = `InfraScope ${version} | Windows 11 / vSphere | ${date}`;
      const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) if (!walker.currentNode.parentElement.closest('pre,code')) {
        walker.currentNode.textContent = walker.currentNode.textContent.replace(/[\u2010-\u2015\u2212]/g, '-');
      }
      window.getSelection().removeAllRanges();
    }, { version: metadata.version, date: metadata.date_label, htmlUrl: `${base}/${metadata.html_name}` });
    await page.addStyleTag({ content: `
      @page{size:A4;margin:16mm 15mm 18mm}
      @media print{
        body{font-size:10pt;line-height:1.5}.hero{min-height:220mm;padding:10mm 0 0}
        .hero h1{font-size:30pt;line-height:1.18;margin:14pt 0 20pt}.hero .lead{font-size:14pt;line-height:1.5}.hero .meta{margin:20pt 0}
        section{break-before:page;margin:0}h2{font-size:18pt;margin-bottom:14pt}.eyebrow{margin-bottom:7pt}
        .note{margin:12pt 0;padding:10pt 12pt}.command{margin:12pt 0;break-inside:avoid}
        .cmd-head{font-size:8pt;padding:6pt 9pt}pre{padding:10pt;line-height:1.55}
        pre code{font-size:8pt;white-space:pre;overflow-wrap:normal;word-break:normal}
        .faq{padding:10pt 0;break-inside:avoid}.faq summary{font-size:11pt}.faq p,.faq li{font-size:10pt}
        .small{font-size:9pt}.expected{font-size:10pt}.footer{margin-top:14pt}
        #yedek{line-height:1.4}#yedek p{margin:6pt 0}#yedek h3{margin:11pt 0 6pt}#yedek li{margin:4px 0}
        #yedek .command{margin:7pt 0}#yedek pre{padding:7pt 10pt}#yedek .cmd-head{padding:5pt 9pt}#yedek .note{padding:8pt 12pt;margin:8pt 0}
      }` });
    await page.emulateMedia({ media: 'print' });
    await page.locator('pre code').evaluateAll(elements => elements.forEach(el => {
      const ctx = document.createElement('canvas').getContext('2d');
      const css = getComputedStyle(el), preCss = getComputedStyle(el.parentElement);
      ctx.font = css.font;
      const padding = parseFloat(preCss.paddingLeft) + parseFloat(preCss.paddingRight);
      const available = Math.min(el.parentElement.clientWidth - padding, 180 * 96 / 25.4 - padding - 2);
      const longest = Math.max(...el.textContent.split('\n').map(line => ctx.measureText(line).width));
      if (longest > available) el.style.fontSize = `${parseFloat(css.fontSize) * available / longest * .99}px`;
      if (parseFloat(getComputedStyle(el).fontSize) < 9) throw new Error('Command line too long for legible A4 PDF');
    }));
    const safe = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    await page.pdf({ path: options['--output'], format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, tagged: true, outline: true,
      headerTemplate: `<div style="width:100%;font-family:Arial;font-size:8px;color:#60756a;padding:0 15mm;display:flex;justify-content:space-between"><span>InfraScope</span><span>Windows 11 / vSphere - ${safe(metadata.version)}</span></div>`,
      footerTemplate: `<div style="width:100%;font-family:Arial;font-size:8px;color:#60756a;padding:0 15mm;display:flex;justify-content:space-between"><span>${safe(metadata.date_label)} | Müşteri kurulum kılavuzu</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(path.dirname(options['--output']), `guide-browser-checks-${metadata.version}.json`),
      JSON.stringify({ html_copy_buttons: commands.length, denied_clipboard_selection: true, print_faq_expansion: true, browser_errors: errors.length }));
  } finally { await browser.close(); }
}

render(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
