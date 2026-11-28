// T-134: a tap on a card opens it in the viewer (Practice, Duel, Pod), and a real touch swipe on the enlarged card moves to the neighbour in the
// same group (the hand, in hand order), stops at the ends, ignores a vertical drag, and keeps the 350 ms ghost-tap guard. The touches are
// real (Chrome's touch input through CDP), not synthesized pointer events. Needs playwright and a static server on :8800 (node tests/run.js --ui tap-swipe).
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
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(1500);
  await require('../ui-seed').pin(p);          // the same games on every run
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (dx, dy) => {
    const r = await p.evaluate(() => { const f = document.querySelector('#lightbox .lb-faces').getBoundingClientRect(); return { x: f.left + f.width / 2, y: f.top + f.height / 2 }; });
    const pt = (x, y) => [{ x, y, id: 1 }], x0 = r.x - dx / 2, y0 = r.y - dy / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + dx * i / 6, y0 + dy * i / 6) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(400);
  };
  const info = () => p.evaluate(() => ({ show: document.getElementById('lightbox').classList.contains('show'), name: (document.querySelector('#lightbox .lb-name') || {}).textContent, count: (document.querySelector('#lightbox .lb-count') || {}).textContent, acts: [...document.querySelectorAll('#lightbox .lb-act')].map(x => x.textContent) }));
  // the same checks on every screen: tap the last card of the hand, swipe to the one before it, right again, then back to the end
  const screen = async (name, handSel, namesOf, arg) => {
    const names = await p.evaluate(namesOf, arg);
    const uniq = [...new Set(names)], N = uniq.length;
    const els = await p.$$(handSel); await els[els.length - 1].tap(); await p.waitForSelector('#lightbox.show', { timeout: 10000 }); await p.waitForTimeout(500);
    let i = await info();
    check(`${name}: a tap on the last hand card opens the viewer at "${N} of ${N}" with the card shown`, i.show && i.count === `${N} of ${N}` && i.name === uniq[N - 1], JSON.stringify(i));
    await swipe(-120, 0);
    i = await info(); check(`${name}: swiping left at the last card stays (no wrap)`, i.name === uniq[N - 1] && i.count === `${N} of ${N}`, i.count);
    await swipe(120, 0);
    i = await info(); check(`${name}: swiping right moves to the card before it, in hand order`, i.name === uniq[N - 2] && i.count === `${N - 1} of ${N}`, JSON.stringify(i));
    await swipe(10, 200);
    i = await info(); check(`${name}: a vertical drag does not move`, i.name === uniq[N - 2], i.name);
    await swipe(-120, 0);
    i = await info(); check(`${name}: swiping left comes back, with that card's own viewer`, i.name === uniq[N - 1] && i.show, i.name);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  };
  // ---- the screens whose cards have no game action: Build, Mulligan (the hand and the sample hands), Odds. A tap opens the viewer, a swipe moves inside that group.
  const group = async (name, sel) => {          // the last card of the group is the one that is not overlapped
    await p.locator(sel).last().evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
    await p.locator(sel).last().tap(); await p.waitForSelector('#lightbox.show', { timeout: 10000 }); await p.waitForTimeout(500);
    const a = await info(), [i0, n] = (a.count || '').split(' of ').map(Number);
    check(`${name}: a tap opens the viewer, with where you are in the group ("${a.count}")`, a.show && n > 1 && !!a.name, JSON.stringify(a));
    await swipe(i0 < n ? -120 : 120, 0);
    const b2 = await info();
    check(`${name}: a swipe moves to the neighbour in the group`, b2.count === `${i0 + (i0 < n ? 1 : -1)} of ${n}` && b2.name !== a.name, `${a.count} -> ${b2.count}`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    return n;
  };
  await p.click('[data-tab=deck]'); await p.waitForTimeout(500);
  await group('Build: the curve', '#curveWall .mtg');
  await group('Build: the lands', '#landWall .mtg');
  await p.click('[data-tab=hands]'); await p.click('#drawHand'); await p.waitForTimeout(1500);
  await group('Mulligan: the hand', '#handStage .mtg');
  await p.click('#dealMany'); await p.waitForTimeout(1500);
  const nHand = await group('Mulligan: a sample hand', '.mini-hand >> nth=0 >> .mtg');
  check('Mulligan: a sample hand swipes only through its own seven cards', nHand <= 7, String(nHand));
  await p.click('[data-tab=odds]'); await p.waitForTimeout(500); await p.evaluate(() => { document.querySelector('#oddsChoose').open = true; }); await p.waitForTimeout(200);
  await group('Odds: the picker', '#oddsPicker .mtg');
  // ---- Practice
  await p.click('[data-tab=table]'); await p.click('#tNew'); await p.waitForTimeout(800);
  await screen('Practice', '#zHand .mtg', () => window.__isf.game.hand.map(i => i.card.name));
  // ---- Duel and Pod: keep the seven, then the table
  for (const [mode, tab] of [['duel', '#tab-duel'], ['pod', '#tab-pod']]) {
    await p.click(`[data-tab=${mode}]`);
    for (const sel of await p.$$(`${tab} .vs-opp`)) await sel.selectOption('').catch(() => {});
    await p.selectOption(`${tab} .vs-you`, 'human'); await p.selectOption(`${tab} .vs-ask`, 'ask'); await p.click(`${tab} .vs-new`);
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && g.phase === 'mull'; }, mode, { timeout: 60000 });
    await screen(`${mode === 'duel' ? 'Duel' : 'Pod'} mulligan hand`, `${tab} .vs-hand .vs-card`, m => { const g = window.__isfVersus[m].game; return g.games[g.human].hand.map(i => i.card.name); }, mode);
    await p.evaluate(t => document.querySelector(t + ' .vs-keep').click(), tab);
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && (g.phase === 'main' || g.over); }, mode, { timeout: 60000 });
    await p.waitForTimeout(800);
    await screen(`${mode === 'duel' ? 'Duel' : 'Pod'} game hand`, `${tab} .vs-hand .vs-card`, m => { const g = window.__isfVersus[m].game; return g.games[g.human].hand.map(i => i.card.name); }, mode);
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
