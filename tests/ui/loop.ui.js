// Loop: Practice plays game after game until the goldfish is dead and reports each one; pressing Loop again stops it.
// Duel with the autopilot in your seat and Loop ticked: when a game ends the next one starts by itself, with a running tally.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
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
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(800);

  // ---- Practice: Loop plays game after game ----
  await p.click('[data-tab=table]');
  await p.fill('#tAutoToN', '2');          // the turn box does not stop a looped game: it plays until the goldfish is dead
  await p.click('#tLoop');
  check('Practice: the Loop button lights up when pressed', await p.$eval('#tLoop', b => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true'));
  await p.waitForFunction(() => /Loop · game 1/.test(document.body.innerText), null, { timeout: 90000 });
  const r1 = await p.evaluate(() => (document.body.innerText.match(/Loop · game 1: [^\n·]*/) || [''])[0]);
  check('Practice: the first looped game plays on past the turn box until the goldfish is dead, then reports', /goldfish dead on turn ([3-9]|[12]\d)/.test(r1), r1);
  await p.waitForFunction(() => /Loop · game 2/.test(document.body.innerText), null, { timeout: 90000 });
  check('Practice: a second game starts and plays by itself, with no question asked', !(await p.$('.ch-sheet:not([hidden]) .ch-auto')));
  await p.click('#tLoop');
  await p.waitForFunction(() => !document.querySelector('#tLoop').classList.contains('on'), null, { timeout: 30000 });
  await p.waitForTimeout(4000);
  const busy = await p.evaluate(() => window.__isf.busy);
  const t1 = await p.evaluate(() => window.__isf.game && window.__isf.game.turn); await p.waitForTimeout(3000);
  const t2 = await p.evaluate(() => window.__isf.game && window.__isf.game.turn);
  check('Practice: pressing Loop again stops it', !busy && t1 === t2, `busy ${busy}, turn ${t1} → ${t2}`);

  // ---- Duel: Loop with the autopilot in your seat ----
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-opp', '');
  await p.selectOption('#tab-duel .vs-you', 'auto');
  await p.fill('#tab-duel .vs-rounds', '6');
  await p.check('#tab-duel .vs-loop');
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => /Loop · 1 game/.test(document.querySelector('#tab-duel .vs-info').textContent), null, { timeout: 240000 });
  await p.waitForFunction(() => /Loop · 2 games/.test(document.querySelector('#tab-duel .vs-info').textContent), null, { timeout: 240000 });
  check('Duel: after a game ends, the next starts by itself and the tally counts 2 games', true, await p.$eval('#tab-duel .vs-info', e => e.textContent.slice(0, 120)));
  await p.uncheck('#tab-duel .vs-loop');
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
