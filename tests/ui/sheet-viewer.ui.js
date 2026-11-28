// T-134: every card in a question sheet opens in the viewer when it is tapped (user: "The card on the stack is not selectable"). The counter sheet
// ("X casts Y: does it resolve?") shows the spell, the stack and the answer cards: the shown cards open read-only, an answer opens with its answer as the
// button, the answers swipe as their own group, closing the viewer returns to the sheet with nothing chosen, and the viewer keeps the shop links and printings.
// Needs playwright and a static server on :8800 (node tests/run.js --ui sheet-viewer).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_tutorial', '{"seen":{"deck":1,"hands":1,"table":1,"duel":1,"pod":1}}'); } catch (e) { /* blocked */ } });
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
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8')); await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck && window.__isfChoices, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  // the counter sheet: the spell being cast, one item on the stack, and two answers
  await p.evaluate(() => {
    const u = window.__isf.deck.unique.filter(c => !c.a.isLand), [spell, onStack, a1, a2] = u;
    window.__ans = null;
    window.__isfChoices.ask({ kind: 'counter', title: 'Zimone casts ' + spell.name + ': does it resolve?', text: 'You may answer.', multi: false, min: 1, max: 1, def: [], none: 'Let it resolve', noAuto: true,
      spell, spellNote: 'on the stack', stack: [{ name: onStack.name, who: 'Zimone', kind: 'spell', card: onStack }],
      options: [{ k: 0, name: a1.name, card: a1, note: 'Counter it with ' + a1.name + ': exile a card and pay 1 life' }, { k: 1, name: a2.name, card: a2, note: 'Counter it with ' + a2.name }] }).then(a => { window.__ans = a; });
  });
  await p.waitForSelector('.ch-sheet', { timeout: 10000 });
  await p.evaluate(() => { const d = document.querySelector('.ch-stack'); if (d) d.open = true; });
  const info = () => p.evaluate(() => ({ show: document.getElementById('lightbox').classList.contains('show'), name: (document.querySelector('#lightbox .lb-name') || {}).textContent, count: (document.querySelector('#lightbox .lb-count') || {}).textContent, acts: [...document.querySelectorAll('#lightbox .lb-act')].map(x => x.textContent), shop: document.querySelectorAll('#lightbox .lb-buy').length }));
  const spellName = await p.$eval('.ch-spell .mtg', e => window.__isfApi.cardOf(e).name);
  await p.tap('.ch-spell .mtg'); await p.waitForSelector('#lightbox.show', { timeout: 5000 }); await p.waitForTimeout(600);
  let i = await info();
  check('the spell shown in the sheet opens in the viewer, read-only (no action button)', i.show && i.name === spellName && i.acts.length === 0, JSON.stringify(i));
  await p.tap('#lightbox .lb-x'); await p.waitForTimeout(300);
  check('closing it returns to the sheet with nothing chosen', !(await p.isVisible('#lightbox.show')) && await p.isVisible('.ch-sheet') && await p.$$eval('.ch-opt.sel', xs => xs.length) === 0 && await p.evaluate(() => window.__ans === null));
  const stackName = await p.$eval('.ch-stack-item .mtg', e => window.__isfApi.cardOf(e).name);
  await p.tap('.ch-stack-item .mtg'); await p.waitForSelector('#lightbox.show', { timeout: 5000 }); await p.waitForTimeout(600);
  i = await info();
  check('a card on the stack opens in the viewer, read-only', i.show && i.name === stackName && i.acts.length === 0, JSON.stringify(i));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('Esc closes it and the sheet is still open', !(await p.isVisible('#lightbox.show')) && await p.isVisible('.ch-sheet'));
  await p.tap('.ch-opt >> nth=0'); await p.waitForSelector('#lightbox.show', { timeout: 5000 }); await p.waitForTimeout(600);
  i = await info();
  check('an answer card opens with its answer as the button', i.show && i.acts.length === 1 && /^Counter it with .*: exile a card and pay 1 life$/.test(i.acts[0]), JSON.stringify(i));
  check('the answers are their own swipe group ("1 of 2")', i.count === '1 of 2', i.count);
  check('the viewer keeps the shop links and the printings', i.shop === 3 && await p.$('#lightbox .lb-prints') !== null, String(i.shop));
  const cdp = await ctx.newCDPSession(p);
  const r = await p.evaluate(() => { const f = document.querySelector('#lightbox .lb-faces').getBoundingClientRect(); return { x: f.left + f.width / 2, y: f.top + f.height / 2 }; });
  const pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(r.x + 60, r.y) });
  for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(r.x + 60 - 120 * k / 6, r.y) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(500);
  i = await info();
  check('a swipe moves to the other answer, with its own button ("2 of 2")', i.count === '2 of 2' && i.acts.length === 1 && /^Counter it with /.test(i.acts[0]), JSON.stringify(i));
  await p.waitForTimeout(450);
  await p.click('#lightbox .lb-act.primary'); await p.waitForTimeout(500);
  check('pressing the answer closes the viewer and chooses it in the sheet (nothing is sent yet)', !(await p.isVisible('#lightbox.show')) && await p.$$eval('.ch-opt.sel', xs => xs.length) === 1 && await p.evaluate(() => window.__ans === null));
  await p.click('.ch-ok'); await p.waitForTimeout(400);
  check('Confirm sends the chosen answer (the second one)', await p.evaluate(() => window.__ans === 1), String(await p.evaluate(() => window.__ans)));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
