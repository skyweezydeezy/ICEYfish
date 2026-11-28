// T-099: Duel shows floating mana ("⚠ N floating") on the person's main step, and End turn asks before the mana is lost.
const { chromium } = require('playwright');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try { const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/'); await p.waitForTimeout(800);
  const opt = await p.$$eval('#savedDecks option', os => (os.find(o => /builtin:/.test(o.value)) || {}).value);
  await p.selectOption('#savedDecks', opt); await p.waitForFunction(() => window.__isfApi && __isfApi.S.cards && __isfApi.S.cards.length, null, { timeout: 90000 });
  await p.click('.tab[data-tab="duel"]'); await p.waitForTimeout(600);
  await p.click('#tab-duel .vs-new');
  await p.waitForSelector('#tab-duel .vs-keep', { state: 'attached', timeout: 60000 }); await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click());
  // the main step: poll until End turn is there, then act in the same breath (the autopilot's steps redraw the page)
  // T-132: who goes first is random; if the opponent does, it may cast a spell the seated person can answer and a "does it resolve?" sheet opens first. Answer it with its default ("Not now"/auto) and go on, so the test no longer depends on the die.
  const reached = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      if (await p.evaluate(() => !!document.querySelector('#tab-duel .vs-end') && window.__isfVersus.duel.game.human != null && !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting)) return true;
      await p.evaluate(() => { const x = document.querySelector('.ch-sheet .ch-none') || document.querySelector('.ch-sheet .ch-auto') || document.querySelector('.ch-sheet .ch-ok'); if (x) x.click(); });
      await p.waitForTimeout(100);
    }
    return false;
  })();
  if (!reached) console.log('STATE', JSON.stringify(await p.evaluate(() => ({ ask: [...document.querySelectorAll('#tab-duel .vs-ask')].map(e => e.innerText.slice(0, 160)), btns: [...document.querySelectorAll('#tab-duel button')].filter(e => e.offsetParent).map(e => e.className.split(' ').pop()), sheet: [...document.querySelectorAll('.ch-sheet')].map(e => e.className) }))));
  const mine = () => p.evaluate(() => { const gm = window.__isfVersus.duel.game; return gm && gm.human != null; });
  check('a Duel with a seated person is on its main step', await p.$('#tab-duel .vs-end') !== null && await mine());
  const turn0 = await p.evaluate(() => window.__isfVersus.duel.game.games[window.__isfVersus.duel.game.human].turn);
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[gm.human]; g.floating.push({ src: null, colors: new Set(['C']), floating: true }, { src: null, colors: new Set(['C']), floating: true }); window.__isfVersus.redraw('duel'); });
  const w = await p.$('#tab-duel .vs-ask .mana-warn');
  check('the main step shows "⚠ 2 floating"', !!w && /⚠ 2 floating: lost at the end of the turn/.test(await w.textContent()), w && await w.textContent());
  let msg = null; p.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click()); await p.waitForTimeout(800);
  check('End turn asks first: "2 floating mana will be lost…"', /2 floating mana will be lost/.test(msg || ''), msg);
  check('declining keeps the turn going', await p.evaluate(t => { const gm = window.__isfVersus.duel.game; return gm.games[gm.human].turn === t && gm.games[gm.human].floating.length === 2; }, turn0));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));
  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
