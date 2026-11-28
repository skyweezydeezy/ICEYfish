// Browser check: the Second Breakfast deck on the Goldfish Table with autopilot; fetch lands crack and end up in the graveyard, no page errors.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try {
      const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'second-breakfast.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click('[data-tab=table]');
  await p.check('#tFast');
  await p.evaluate(() => { const S = window.__isf, g = S.game; g.hand = g.hand.filter(i => !i.card.a.isLand); const card = S.deck.unique.find(c => /Marsh Flats/.test(c.name)); g.hand.unshift({ iid: g.nextIid++, card }); });       // make sure a fetch land is in the opening hand
  await p.fill('#tAutoToN', '2');
  await p.click('#tAutoTo', { position: { x: 12, y: 12 } });
  await p.waitForFunction(() => window.__isf.game && window.__isf.game.turn >= 2 && window.__isf.game.turnDone, null, { timeout: 60000 });
  const st = await p.evaluate(() => { const g = window.__isf.game; return { fetchInYard: g.graveyard.filter(i => i.card.a.fetchSpec).length, fetchOnTable: g.battlefield.filter(q => q.card.a.fetchSpec).length, lands: g.battlefield.filter(q => q.asLand).length }; });
  check('after the autopilot has played the fetch land no uncracked fetch land is on the table', st.fetchOnTable === 0, JSON.stringify(st));
  const logText = await p.$$eval('#gameLog li', ls => ls.map(l => l.textContent).join('\n'));
  check('Marsh Flats was cracked: it is in the graveyard', st.fetchInYard >= 1, JSON.stringify(st));
  check('the log shows the fetched land coming onto the battlefield', /onto the battlefield/.test(logText));
  console.log('errors:', errs);
  check('no page errors', errs.length === 0);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
