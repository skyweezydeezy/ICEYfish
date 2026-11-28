// T-129: the speed bar and the control row under it (☰, new, 🎲, ▶, ⏩, 🔁, ⟳, +) must render crisp on iPhone and iPad.
// Soft text and icons come from a layer that is scaled or kept as a bitmap: a transform (scale), a fractional zoom, a filter or backdrop-filter, will-change,
// perspective, an opacity below 1, or an animation that is still attached (a finished fade with fill-mode forwards/both keeps the whole panel on a compositing layer).
// For the strip's elements and every ancestor of them, once the tab's fade has run: none of that. Practice and Duel; iPhones, a Pixel and iPads.
// Also saves a screenshot of the strip at deviceScaleFactor 3 when CRISP_SHOTS names a folder.
// Needs playwright, a static server on :8800 (node tests/run.js --ui crisp-strip) and internet access to Scryfall.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const phone = (w, h, base, dsf) => ({ ...devices[base || 'iPhone 13'], viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: dsf || 3 });
const RUNS = [
  ['iPhone 390x844', phone(390, 844)], ['iPhone 375x667', phone(375, 667)], ['iPhone 430x932', phone(430, 932)], ['iPhone sideways 844x390', phone(844, 390)],
  ['Pixel 412x915', phone(412, 915, 'Pixel 7', 2.625)], ['iPad upright', { ...devices['iPad (gen 7)'], deviceScaleFactor: 2 }], ['iPad sideways', { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 2 }],
];
const ONLY = process.env.CRISP_ONLY ? new RegExp(process.env.CRISP_ONLY) : null, SHOTS = process.env.CRISP_SHOTS;

// every ancestor (and the element) that could make the strip a scaled or bitmap layer
const audit = sels => sels.flatMap(sel => {
  const e = document.querySelector(sel); if (!e) return [sel + ': missing'];
  const bad = [];
  for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
    const c = getComputedStyle(x), tag = x.tagName.toLowerCase() + (x.id ? '#' + x.id : '') + '.' + String(x.className).split(' ')[0];
    if (c.transform !== 'none') bad.push(`${tag} transform ${c.transform}`);
    if (c.zoom && c.zoom !== '1') bad.push(`${tag} zoom ${c.zoom}`);
    if (c.filter !== 'none') bad.push(`${tag} filter`);
    if (c.backdropFilter && c.backdropFilter !== 'none') bad.push(`${tag} backdrop-filter`);
    if (c.willChange !== 'auto') bad.push(`${tag} will-change ${c.willChange}`);
    if (c.perspective !== 'none') bad.push(`${tag} perspective`);
    if (+c.opacity < 1) bad.push(`${tag} opacity ${c.opacity}`);
    if (x.getAnimations().length) bad.push(`${tag} animation ${x.getAnimations().map(a => a.animationName || a.constructor.name).join(',')}`);
  }
  return bad.map(b => sel + ': ' + b);
});

(async () => {
  const b = await chromium.launch();
  for (const [name, dev] of RUNS) {
    if (ONLY && !ONLY.test(name)) continue;
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    const settle = () => p.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))).then(() => new Promise(r => setTimeout(r, 300))));

    // ---- Practice: speed bar + control row ----
    await p.click('[data-tab=table]'); await settle();
    const dsf = await p.evaluate(() => devicePixelRatio);
    check(`${name}: Practice: the page is not zoomed (visual viewport scale 1)`, await p.evaluate(() => !window.visualViewport || window.visualViewport.scale === 1));
    const pr = await p.evaluate(audit, ['.speed-bar', '.table-controls', '#tLoop', '#tNew']);
    check(`${name}: Practice: the speed bar and the control row sit on no scaled, filtered or animated layer`, pr.length === 0, pr.slice(0, 4).join(' | '));
    if (SHOTS) { const bx = await (await p.$('.speed-bar')).boundingBox(), w = dev.viewport.width; await p.screenshot({ path: path.join(SHOTS, `practice-${name.replace(/ /g, '-')}-x${dsf}.png`), clip: { x: 0, y: Math.max(0, bx.y - 6), width: w, height: 130 } }); }

    // ---- Duel: the table's bar ----
    await p.click('[data-tab=duel]');
    for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-duel .vs-you', 'auto'); await p.fill('#tab-duel .vs-rounds', '5');
    await p.click('#tab-duel .vs-new');
    await p.waitForSelector('#tab-duel .vs-bar .speed-bar', { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    await p.click('#tab-duel .vs-bar .vs-play').catch(() => {});          // a pause stops the autopilot moving the table about while it is checked
    await settle();
    const du = await p.evaluate(audit, ['#tab-duel .vs-top', '#tab-duel .vs-bar', '#tab-duel .speed-bar', '#tab-duel .vs-loopbtn']);
    check(`${name}: Duel: the table's bar sits on no scaled, filtered or animated layer`, du.length === 0, du.slice(0, 4).join(' | '));
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
