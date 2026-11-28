// Cyclonic Rift's on-screen effect (card-effects.js) in a real Duel game: a tornado, and exactly the opponent's returned cards fly
// into their hand. Needs playwright, a static server on :8800 and internet access to Scryfall (to load a deck).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => localStorage.setItem('isf_sound', JSON.stringify({ bg: false, music: false, sfx: false })));
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try { const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', deckText); await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-opp', ''); await p.selectOption('#tab-duel .vs-you', 'auto');
  await p.click('#tab-duel .vs-new');
  await p.waitForSelector('#tab-duel .vs-next', { timeout: 30000 });
  const oppCount = () => p.evaluate(() => { const g = __isfVersus.duel.game.games[1]; return g.battlefield.filter(q => !q.asLand).length; });
  for (let i = 0; i < 30 && (await oppCount()) < 3; i++) { await p.click('#tab-duel .vs-next'); await p.waitForTimeout(250); }
  const before = await oppCount();
  const domBefore = await p.$$eval('#tab-duel .vs-seat.opp .vs-pc[data-iid]', x => x.length);
  // what an overloaded Rift does: every nonland permanent of the opponent back to hand. Then the effect runs, then the table redraws.
  const r = await p.evaluate(() => {
    const gm = __isfVersus.duel.game, o = gm.games[1], gone = o.battlefield.filter(q => !q.asLand);
    gone.forEach(q => { o.battlefield.splice(o.battlefield.indexOf(q), 1); if (!q.card.token) o.hand.push({ card: q.card, iid: q.iid }); });
    __isfFx.events([{ type: 'cast', inst: { card: { name: 'Cyclonic Rift' } } }], { mode: 'duel' });
    const ghosts = document.querySelectorAll('.fx-ghost').length, tornado = !!document.querySelector('.fx-tornado');
    __isfVersus.redraw('duel');
    return { gone: gone.length, ghosts, tornado };
  });
  check('the opponent has cards in play to blow away', before >= 3 && domBefore > before, before + ' nonland, ' + domBefore + ' pictures');
  check('a tornado appears over the battlefield', r.tornado);
  check('exactly the returned cards fly (lands stay)', r.ghosts === r.gone && r.gone === before, JSON.stringify(r));
  await p.waitForTimeout(1200);
  check('mid-way, the cards are on their way', (await p.$$eval('.fx-ghost', x => x.filter(e => getComputedStyle(e).transform !== 'none').length)) === r.ghosts);
  await p.waitForTimeout(2000);
  check('afterwards nothing is left on screen', !(await p.$('.fx-ghost')) && !(await p.$('.fx-tornado')));
  check('the opponent\'s lands are still there', (await p.$$eval('#tab-duel .vs-seat.opp .vs-pc[data-iid]', x => x.length)) === domBefore - before);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
