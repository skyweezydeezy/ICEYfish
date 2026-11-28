// T-087 browser test: Atraxa, Praetors' Voice in a game a person plays (Duel). Ending the turn runs "At the beginning of your end step, proliferate": a sheet lists every permanent with
// a counter (the opponent's too), the autopilot's pick is chosen, confirming adds the counters, and the log names what was proliferated (it used to read "nothing happens").
// Needs playwright, a static server on :8800 and internet access to Scryfall (node tests/run.js --ui atraxa-end).
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deck = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', n + '.txt'), 'utf8');
const shot = process.env.VERSUS_SHOTS;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
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
  const loadDeck = async (name, has, extra) => {
    await p.click('[data-tab=deck]');
    await p.fill('#deckText', deck(name) + (extra ? '\n// Specialty\n' + extra : ''));          // the extra test cards make it more than 100: a specialty deck
    await p.click('#loadDeck');
    await p.waitForFunction(n => window.__isf && window.__isf.deck && (window.__isf.cards || []).some(c => c.name === n), has, { timeout: 120000 });
    await p.waitForTimeout(800);
  };
  // the state of the played game; answer everything the game asks with its default until `want` holds
  const state = mode => p.evaluate(m => { const g = window.__isfVersus[m].game; return { phase: g.phase, choice: g.choice ? g.choice.kind : null, over: g.over, turn: g.games[0].turn, step: g.step, acting: g.acting, busy: g.busy }; }, mode);
  const until = async (mode, want, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 90000)) {
      const s = await state(mode);
      if (s.over || want(s)) return s;
      if (s.choice) await p.click('.ch-sheet .ch-auto');
      else if (s.phase === 'block') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-block-go').click(), mode);
      else if (s.phase === 'respond') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-pass').click(), mode);
      await p.waitForTimeout(120);
    }
    throw new Error('timed out waiting for the game');
  };
  const start = async mode => {
    await p.click('[data-tab=' + mode + ']');
    for (const sel of await p.$$('#tab-' + mode + ' .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-' + mode + ' .vs-you', 'human');
    await p.selectOption('#tab-' + mode + ' .vs-ask', 'ask');
    await p.click('#tab-' + mode + ' .vs-new');
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && g.phase === 'mull'; }, mode, { timeout: 90000 });
    await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-keep').click(), mode);
    return until(mode, s => s.phase === 'main');
  };
  // put cards in my hand and permanents on the table, then redraw
  const arrange = async (mode, spec) => {
    await p.evaluate(({ m, spec }) => {
      const G = window.Goldfish, gm = window.__isfVersus[m].game, me = gm.games[0];
      const find = (g, n) => g.deck.unique.find(c => c.name === n);
      const put = (g, c) => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 0; return q; };
      if (spec.clear) { me.hand = []; me.battlefield = []; }
      (spec.hand || []).forEach(n => me.hand.push({ iid: me.nextIid++, card: find(me, n) }));
      (spec.lands || []).forEach(([n, k]) => { for (let i = 0; i < k; i++) put(me, find(me, n)); });
      (spec.mine || []).forEach(n => put(me, find(me, n)));
      gm.games.slice(1).forEach(o => { if (spec.oppClear) { o.battlefield = []; } (spec.opp || []).forEach(n => { const c = find(o, n); if (c) put(o, c); }); });
      if (spec.untap) me.battlefield.forEach(q => { q.tapped = false; });
    }, { m: mode, spec });
    await p.evaluate(m => window.__isfVersus.redraw(m), mode);
  };
  const clickHand = async (mode, name) => { const ok = await p.evaluate(({ m, name }) => { const me = window.__isfVersus[m].game.games[0], c = me.hand.find(i => i.card.name === name), el = c && document.querySelector('#tab-' + m + ' .vs-hand .vs-card.can[data-iid="' + c.iid + '"]'); if (el) el.click(); return !!el; }, { m: mode, name }); if (ok) await viewerPick(p); return ok; };          // T-134: the card opens in the viewer; Cast is its button
  const sheet = () => p.evaluate(() => { const s = document.querySelector('.ch-sheet'); if (!s) return null; return { title: s.querySelector('.ch-title').textContent, text: s.querySelector('.ch-text').textContent, tiles: s.querySelectorAll('.ch-opt').length, shown: [...s.querySelectorAll('.ch-opt')].filter(x => !x.hidden).length, def: [...s.querySelectorAll('.ch-opt.def .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), stars: s.querySelectorAll('.ch-star').length, ok: s.querySelector('.ch-ok').textContent, okOff: s.querySelector('.ch-ok').disabled, none: s.querySelector('.ch-none') ? s.querySelector('.ch-none').textContent : null, names: [...s.querySelectorAll('.ch-opt .ch-name')].map(x => x.textContent.replace(/ ×\d+$/, '')), dest: s.querySelector('.ch-dest b') ? s.querySelector('.ch-dest b').textContent : null, fanned: s.classList.contains('fanned'), picked: s.querySelector('.ch-picked') ? s.querySelector('.ch-picked').textContent : null, notes: [...s.querySelectorAll('.ch-opt .ch-note')].map(x => x.textContent) }; });
  const pickTile = async name => { const ok = await p.evaluate(n => { const b = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => x.querySelector('.ch-name').textContent.replace(/ ×\d+$/, '') === n); if (b) b.click(); return !!b; }, name); await viewerPick(p); return ok; };
  // "does it resolve?": every spell waits on the stack. Pass on your own spell (or let another player's resolve when you have nothing)
  const stackQ = () => p.evaluate(() => { const q = window.__isfChoices.current(); return q && (q.kind === 'resolve' || (q.kind === 'counter' && !q.options.length)) ? q.kind : null; });
  const passStack = async mode => {
    for (let k = 0; k < 8; k++) {
      await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return document.querySelector('.ch-sheet') || (!g.acting && !g.busy) || g.over; }, mode, { timeout: 15000 });          // a sheet, or nothing going on (an action of yours, or another player's turn)
      if (!(await stackQ())) return;
      await p.click('.ch-sheet .ch-none'); await p.waitForTimeout(200);
    }
  };
  const log = (mode, n) => p.$$eval('#tab-' + mode + ' .vs-log .vs-line', (ls, n) => ls.slice(-n).map(l => (l.dataset.step ? '[' + l.dataset.step + '] ' : '') + l.textContent), n || 6);
  await loadDeck('frodo', "Atraxa, Praetors' Voice", "1 Atraxa, Praetors' Voice");
  await start('duel');
  await arrange('duel', { clear: true, lands: [['Swamp', 3], ['Plains', 3]], mine: ["Atraxa, Praetors' Voice", 'Samwise Gamgee', 'Peregrin Took'], oppClear: true, opp: ['Academy Manufactor'] });
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game, me = gm.games[0]; me.battlefield.find(q => q.card.name === 'Samwise Gamgee').counters = 1; gm.games[1].battlefield.find(q => q.card.name === 'Academy Manufactor').counters = 1; window.__isfVersus.redraw('duel'); });
  const cnt = () => p.evaluate(() => { const gm = window.__isfVersus.duel.game; return { sam: gm.games[0].battlefield.find(q => q.card.name === 'Samwise Gamgee').counters || 0, pip: gm.games[0].battlefield.find(q => q.card.name === 'Peregrin Took').counters || 0, opp: gm.games[1].battlefield.find(q => q.card.name === 'Academy Manufactor').counters || 0 }; });
  // Who goes first is random: the opponent may take its turn before mine. So end MY turn whenever the game is at my main phase (once per turn), whatever came before, and wait up to 90 s for the sheet.
  let sh = null, endedTurn = -1; const t0 = Date.now();
  while (Date.now() - t0 < 90000 && !sh) {
    const s = await state('duel');
    if (s.choice === 'target') { const x = await sheet(); if (x && /proliferate/.test(x.title)) { sh = x; break; } }
    if (s.choice) await p.click('.ch-sheet .ch-auto');
    else if (s.phase === 'main' && !s.acting && !s.busy && endedTurn !== s.turn) { endedTurn = s.turn; await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click()); }
    else if (s.phase === 'block') await p.evaluate(() => document.querySelector('#tab-duel .vs-block-go').click());
    else if (s.phase === 'respond') await p.evaluate(() => document.querySelector('#tab-duel .vs-pass').click());
    await p.waitForTimeout(250);
  }
  if (!sh) { check('ending the turn: the end-step trigger asks which permanents to proliferate', false, JSON.stringify(await state('duel'))); await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
  check('ending the turn: the end-step trigger asks which permanents to proliferate', !!sh && /Atraxa, Praetors' Voice: proliferate/.test(sh.title), sh && sh.title);
  check('...the sheet lists your permanent and the opponent\'s that have a counter', sh && sh.tiles === 2, sh && sh.tiles);
  check('...the autopilot\'s pick is your own permanent only (a +1/+1 counter of theirs would help them)', sh && sh.def.length === 1 && sh.def[0] === 'Samwise Gamgee', sh && sh.def.join(','));
  await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 15000 });
  const c1 = await cnt();
  check('confirming adds a counter to Samwise Gamgee and none to the others', c1.sam === 2 && c1.pip === 0 && c1.opp === 1, JSON.stringify(c1));
  const endLog = await p.$$eval('#tab-duel .vs-log .vs-line[data-step=end]', ls => ls.map(l => l.textContent).filter(t => /^You\b/.test(t)));          // my end steps only: the random opponent may have gone first, and its end step can be empty
  check('the log says what was proliferated under the end step, not "nothing happens"', endLog.some(t => /Proliferate: one more of each counter on Samwise Gamgee/.test(t)) && !endLog.some(t => /nothing happens/.test(t)), endLog.join(' || '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
