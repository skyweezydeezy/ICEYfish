// T-102: Practice's Undo takes back the last play (a land), but refuses once the action showed new information: drawing a card from the
// library cannot be undone ("Can't undo: it showed you new cards"), and nothing changes. Needs playwright, a static server on :8800 and Scryfall.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click('[data-tab=table]');
  const st = () => p.evaluate(() => { const g = window.__isf.game; return { hand: g.hand.length, lib: g.library.length, bf: g.battlefield.length }; });
  let land = null;
  for (let k = 0; k < 14 && !land; k++) {
    await p.click('#tNew'); await p.waitForTimeout(500);
    land = await p.evaluate(() => { const g = window.__isf.game, l = g.hand.find(x => x.card.a.isLand); return l ? l.iid : null; });
  }
  check('a land is in the opening hand', land != null);
  if (land != null) {
    const s0 = await st();
    await p.locator(`#zHand .mtg[data-iid="${land}"]`).click({ force: true }); await p.waitForTimeout(300);
    await p.waitForTimeout(450); await p.locator('#lightbox .lb-act.primary').first().click(); await p.waitForTimeout(700);
    const s1 = await st();
    check('playing the land moved it to the battlefield', s1.hand === s0.hand - 1 && s1.bf === s0.bf + 1, JSON.stringify(s1));
    await p.click('#tUndo'); await p.waitForTimeout(500);
    const s2 = await st();
    check('Undo takes the land back', s2.hand === s0.hand && s2.bf === s0.bf, JSON.stringify(s2));
    // play it again, then draw a card from the library: the draw cannot be undone
    await p.locator(`#zHand .mtg[data-iid="${land}"]`).click({ force: true }); await p.waitForTimeout(300);
    await p.waitForTimeout(450); await p.locator('#lightbox .lb-act.primary').first().click(); await p.waitForTimeout(700);
    await p.click('#zLibrary .card-back'); await p.waitForTimeout(700);
    const s3 = await st();
    check('the library pile drew a card', s3.lib === s1.lib - 1 && s3.hand === s1.hand + 1, JSON.stringify(s3));
    await p.click('#tUndo'); await p.waitForTimeout(500);
    const s4 = await st(), toast = await p.evaluate(() => (document.querySelector('.toast') || {}).innerText || '');
    check('Undo is refused after a draw, and nothing changed', s4.hand === s3.hand && s4.lib === s3.lib && s4.bf === s3.bf, JSON.stringify(s4));
    check('it says why in one line', /Can't undo: it showed you new cards/.test(toast), toast);
  }
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
