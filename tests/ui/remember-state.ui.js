// Remember state (remember.js): after a reload the page comes back where it was: the open tab, the loaded deck, the settings on each tab,
// the opening hand on Mulligan and the Practice game in the middle (the same game: zones, life, the random generator), with its log.
// The game then plays on. Reset (Saved decks) forgets it all but keeps the saved decks; a state saved by another version is forgotten.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); localStorage.setItem('isf_dice', '0'); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const restored = () => p.waitForFunction(() => document.body.dataset.restored === '1', null, { timeout: 90000 });
  const reload = async () => { await p.waitForTimeout(700); await p.reload(); await restored(); await p.waitForTimeout(600); };
  await p.goto('http://127.0.0.1:8800/'); await restored();
  await p.evaluate(() => { localStorage.setItem('gf_decks', JSON.stringify({ 'Kept deck': '1 Sol Ring' })); localStorage.setItem('isf_tutorial', '{"seen":{"deck":1}}'); localStorage.setItem('isf_tutorial_off', '1'); });          // a saved deck: Reset must keep it
  const list = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
  await p.fill('#deckText', list);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(500);

  // settings on three tabs
  await p.fill('#optTurns', '12'); await p.uncheck('#optCmdrFirst');
  await p.click('[data-tab=odds]'); await p.click('#oddsChoose > summary'); await p.fill('#oddsK', '2');          // "At least k" sits in the folded Choose cards (T-076); the value comes back into the closed box after the reload
  await p.click('[data-tab=duel]'); await p.fill('#tab-duel .vs-rounds', '31'); await p.selectOption('#tab-duel .vs-you', 'auto');
  // an opening hand after one mulligan
  await p.click('[data-tab=hands]'); await p.click('#drawHand'); await p.click('#mullHand'); await p.waitForTimeout(300);
  const hand = await p.evaluate(() => window.__isfApi.hand.get().g.hand.map(c => c.card.name).join('|'));
  // a Practice game, played to turn 3
  await p.click('[data-tab=table]'); await p.waitForFunction(() => window.__isf.game && !window.__isf.busy, null, { timeout: 30000 });
  await p.fill('#tAutoToN', '3'); await p.check('#tFast');
  await p.click('#tAutoTo', { position: { x: 12, y: 12 } });
  await p.waitForFunction(() => { const g = window.__isf.game; return g && g.turn === 3 && g.turnDone && !window.__isf.busy; }, null, { timeout: 90000 });
  const before = await p.evaluate(() => ({ dump: window.Decide.dump([window.__isf.game]), log: document.querySelector('#gameLog').children.length, turn: window.__isf.game.turn, life: window.__isf.game.damage }));
  const size = await p.evaluate(() => ['isf_state', 'isf_state_game', 'isf_state_hand'].reduce((n, k) => n + (localStorage.getItem(k) || '').length, 0));

  await reload();
  const after = await p.evaluate(() => {
    const S = window.__isf, g = S.game, q = s => document.querySelector(s);
    return { tab: document.body.dataset.view, active: (q('.tab.active') || {}).dataset.tab, deck: !!S.deck && S.deck.unique.length, cmdr: S.deck && S.deck.commanders.map(c => c.card.name).join(),
      turns: q('#optTurns').value, cmdrFirst: q('#optCmdrFirst').checked, oddsK: q('#oddsK').value, rounds: q('#tab-duel .vs-rounds').value, you: q('#tab-duel .vs-you').value,
      dump: g && window.Decide.dump([g]), log: q('#gameLog').children.length, box: q('#deckText').value.length,
      hand: (window.__isfApi.hand.get() || { g: { hand: [] } }).g.hand.map(c => c.card.name).join('|'), mulls: (window.__isfApi.hand.get() || {}).mulls,
      toast: q('#toast').textContent };
  });
  check('after a reload the open tab is Practice again', after.tab === 'table' && after.active === 'table', after.tab + ' / ' + after.active);
  check('...the deck is loaded again (Frodo)', after.deck > 50 && /Frodo/.test(after.cmdr), after.cmdr);
  check('...the Build settings are back (12 turns, commander first off)', after.turns === '12' && after.cmdrFirst === false, after.turns + ' ' + after.cmdrFirst);
  check('...the Odds setting is back (at least 2)', after.oddsK === '2', after.oddsK);
  check('...the Duel setup is back (31 rounds, the autopilot plays my deck)', after.rounds === '31' && after.you === 'auto', after.rounds + ' ' + after.you);
  check('...the Practice game is the same game, turn 3 (zones, life, counters, the random generator)', after.dump === before.dump, !after.dump ? 'no game' : after.dump === before.dump ? 'same' : 'differs');
  check('...with its log', after.log === before.log && after.log > 3, `${before.log} → ${after.log}`);
  check('...the opening hand on Mulligan is the same hand, after 1 mulligan', after.hand === hand && after.mulls === 1, after.hand.slice(0, 60));
  check('...the decklist box still holds the list', after.box > 100);
  check('...and a small "Restored" toast says so', /Restored/.test(after.toast), after.toast);
  check(`what is stored is modest (${Math.round(size / 1024)} KB)`, size > 0 && size < 400000, size);

  // the restored game plays on
  await p.click('#tAuto');
  await p.waitForFunction(() => { const g = window.__isf.game; return g && g.turn === 4 && !window.__isf.busy; }, null, { timeout: 60000 }).catch(() => {});
  check('the restored game plays on (autopilot: turn 4)', await p.evaluate(() => window.__isf.game.turn === 4));

  // another tab, a reload: that tab
  await p.click('[data-tab=odds]');
  await reload();
  check('after switching to Odds and reloading, Odds is open', await p.evaluate(() => document.body.dataset.view === 'odds'));

  // the scroll position comes back
  await p.click('[data-tab=deck]'); await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(200);
  const y0 = await p.evaluate(() => Math.round(window.scrollY));
  await reload(); await p.waitForTimeout(300);
  const y1 = await p.evaluate(() => Math.round(window.scrollY));
  check('the scroll position on Build comes back', y0 > 300 && Math.abs(y1 - y0) < 40, `${y0} → ${y1}`);

  // a state saved by another version (an update) is forgotten
  // (the next version is deployed: version.js says one more; without a service worker that is the version the page runs)
  const bump = async route => { try { const r = await route.fetch(); await route.fulfill({ response: r, body: (await r.text()).replace(/ISF_VERSION = (\d+)/, (m, n) => 'ISF_VERSION = ' + (+n + 1)) }); } catch (e) { /* the page moved on */ } };
  await ctx.route('**/version.js*', bump);
  await reload();
  await ctx.unroute('**/version.js*', bump);
  const upd = await p.evaluate(() => ({ tab: document.body.dataset.view, deck: !!window.__isf.deck, kept: localStorage.getItem('isf_state') }));
  check('after an update the old state is forgotten: Build, no deck loaded', upd.tab === 'deck' && !upd.deck, JSON.stringify(upd).slice(0, 80));

  // Reset: everything goes, the saved decks stay
  await p.click('[data-tab=table]'); await p.waitForTimeout(300);
  await reload();
  await p.click('#manageDecks');
  check('Reset is one button in Saved decks', await p.isVisible('#dmReset') && (await p.textContent('#dmReset')) === 'Reset');
  p.once('dialog', d => d.accept());
  await Promise.all([p.waitForNavigation({ timeout: 20000 }).catch(() => {}), p.click('#dmReset')]);
  await restored(); await p.waitForTimeout(500);
  const rs = await p.evaluate(() => ({ tab: document.body.dataset.view, deck: !!window.__isf.deck, game: !!window.__isf.game, box: document.querySelector('#deckText').value, turns: document.querySelector('#optTurns').value,
    keys: Object.keys(localStorage).filter(k => /^isf_state/.test(k)), tut: localStorage.getItem('isf_tutorial'), tutOff: localStorage.getItem('isf_tutorial_off'), saved: Object.keys(JSON.parse(localStorage.getItem('gf_decks') || '{}')) }));
  check('after Reset: Build, no deck, no game, an empty decklist box, default settings', rs.tab === 'deck' && !rs.deck && !rs.game && rs.box === '' && rs.turns === '10', JSON.stringify(rs));
  check('...nothing of the state is stored', rs.keys.length === 0 || (rs.keys.length === 1 && rs.keys[0] === 'isf_state'), rs.keys.join());
  check('...the tours show again (isf_tutorial cleared), the test switch isf_tutorial_off stays', rs.tut === null && rs.tutOff === '1', rs.tut + ' / ' + rs.tutOff);
  check('...and the saved decks are still there', rs.saved.includes('Kept deck'), rs.saved.join());
  await reload();
  check('a reload after Reset still starts fresh', await p.evaluate(() => document.body.dataset.view === 'deck' && !window.__isf.deck));
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
