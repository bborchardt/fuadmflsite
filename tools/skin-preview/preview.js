#!/usr/bin/env node
/*
 * Preview the league home page under a different MFL skin, at phone and
 * desktop widths, without changing anything on the live site.
 *
 * MFL's skin picker (For Commissioners > Setup > Appearance Setup > Select a
 * Skin) shows thumbnails, but not your own page with your own modules in it.
 * This does that: it mirrors the live home page, swaps the skin stylesheet,
 * and screenshots the result.
 *
 *   node preview.js                        # current skin, phone + desktop
 *   node preview.js AllAmerican AquaGreen  # compare named skins
 *
 * Skin names are the CamelCase names shown in Appearance Setup, spaces
 * removed ("All American" -> AllAmerican). A name that 404s is reported.
 *
 * Requires: node, and playwright pointed at a local Chromium.
 *   npm i playwright   (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 if a browser exists)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const LEAGUE = process.env.MFL_LEAGUE || '48571';
const YEAR   = process.env.MFL_YEAR   || new Date().getFullYear().toString();
const HOST   = process.env.MFL_HOST   || 'www44.myfantasyleague.com';
const OUT    = path.join(__dirname, 'out');
const WIDTHS = [['phone', 390, 844], ['desktop', 1440, 900]];
const TAB_NAMES = ['Main','Standings','Transactions','Contracts','Calendar','Commish','Links','Live Scoring'];
// which home-page tab to render; MFL_TAB=all walks every tab
const TABS = (process.env.MFL_TAB || '0') === 'all'
  ? TAB_NAMES.map((_, i) => i)
  : [parseInt(process.env.MFL_TAB || '0', 10)];

const CHROME = process.env.CHROME_PATH || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].find(p => fs.existsSync(p));

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

/* Build a local, self-contained copy of the home page. Remote scripts are
   stripped: they cannot reach the API from a local origin, and this harness
   is for judging skin and layout, not live data. */
async function mirror(skin) {
  const base = `https://${HOST}/${YEAR}`;
  let html = await get(`${base}/home/${LEAGUE}`);

  const current = (html.match(/skins17\/([A-Za-z0-9]+)\/\1\.css/) || [])[1];
  const use = skin || current;
  if (!current) throw new Error('could not detect the current skin');

  for (const [name, url] of [
    ['base.css', `https://${HOST}/skins17/MFLBaseCSS.css`],
    ['skin.css', `https://${HOST}/skins17/${use}/${use}.css`],
    ['responsive.css', `https://${HOST}/skins17/${use}/responsive.css`],
  ]) {
    fs.writeFileSync(path.join(OUT, name), await get(url));
  }

  html = html
    .replace(new RegExp(`https://${HOST}/skins17/MFLBaseCSS\\.css`, 'g'), 'base.css')
    .replace(new RegExp(`https://${HOST}/skins17/${current}/${current}\\.css`, 'g'), 'skin.css')
    .replace(new RegExp(`https://${HOST}/skins17/${current}/responsive\\.css`, 'g'), 'responsive.css')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<meta http-equiv="REFRESH"[^>]*>/gi, '')
    // MFL's own page runs show_tab(0) on load, which hides every tab but the
    // first. Stripping the scripts above removes that, so restore it here --
    // otherwise all eight tabs render stacked and the page looks far longer
    // than it really is.
    .replace(/<\/body>/i,
      '<script>(function(){var t=+((location.hash||"#0").substr(1))||0;' +
      'for(var i=0;;i++){var d=document.getElementById("tabcontent"+i);' +
      'if(!d)break;d.style.display=(i===t?"":"none");}})();</script></body>')
    // remote images would hang against a local origin
    .replace(/(<img[^>]+src=")https?:\/\/[^"]*(")/gi, '$1data:image/gif;base64,R0lGODlhAQABAAAAACw=$2');

  fs.writeFileSync(path.join(OUT, 'page.html'), html);
  return { current, use };
}

function serve(dir) {
  const types = { '.html': 'text/html', '.css': 'text/css' };
  const srv = http.createServer((req, res) => {
    const f = path.join(dir, req.url === '/' ? 'page.html' : req.url.split('?')[0]);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

(async () => {
  if (!CHROME) { console.error('No Chromium found. Set CHROME_PATH.'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });

  const skins = process.argv.slice(2);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: CHROME });
  const srv = await serve(OUT);
  const origin = `http://127.0.0.1:${srv.address().port}`;

  for (const skin of (skins.length ? skins : [null])) {
    let info;
    try { info = await mirror(skin); }
    catch (e) { console.error(`skip ${skin}: ${e.message}`); continue; }

    for (const TAB of TABS)
    for (const [label, w, h] of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 500,
      });
      const page = await ctx.newPage();
      await page.goto(`${origin}/page.html#${TAB}`, { waitUntil: 'load' });
      await page.waitForTimeout(400);

      // anything wider than the viewport is a horizontal-scroll bug
      const over = await page.evaluate(() => {
        const c = document.documentElement.clientWidth;
        return [...document.querySelectorAll('table')]
          .filter(e => e.scrollWidth > c + 2)
          .map(e => `${e.id || e.className || 'table'}:${e.scrollWidth}px`);
      });

      const file = path.join(OUT, `${info.use}-tab${TAB}-${label}.png`);
      await page.screenshot({ path: file, fullPage: label === 'phone' });
      const { height } = await page.evaluate(() => ({ height: document.body.scrollHeight }));
      console.log(
        `${info.use.padEnd(12)} tab${TAB} ${(TAB_NAMES[TAB]||'').padEnd(13)} ${label.padEnd(8)}` +
        `${String(w).padStart(5)}px  page=${String(height).padStart(5)}px  ` +
        (over.length ? `OVERFLOWS ${over.join(', ')}` : 'ok')
      );
      await ctx.close();
    }
  }
  srv.close();
  await browser.close();
  console.log(`\nScreenshots in ${OUT}`);
})();
