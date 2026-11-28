// T-090 browser test: Sylvan Library in a game a person plays (Duel). At the beginning of their draw step they are asked "draw two additional cards?", then, for each of the
// two cards, "pay 4 life to keep it" or put it on top of the library; the log says what was drawn, the life paid and what went back. Needs playwright, a static server on :8800
// and internet access to Scryfall (node tests/run.js --ui sylvan-library).
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
  const clickHand = (mode, name) => p.evaluate(({ m, name }) => { const me = window.__isfVersus[m].game.games[0], c = me.hand.find(i => i.card.name === name), el = c && document.querySelector('#tab-' + m + ' .vs-hand .vs-card.can[data-iid="' + c.iid + '"]'); if (el) el.click(); return !!el; }, { m: mode, name });
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
  await loadDeck('frodo', 'Sylvan Library', '1 Sylvan Library');
  await start('duel');
  await arrange('duel', { clear: true, lands: [['Swamp', 3], ['Plains', 3]], mine: ['Sylvan Library'] });
  const snap = () => p.evaluate(() => { const me = window.__isfVersus.duel.game.games[0]; return { life: me.life, hand: me.hand.length, lib: me.library.length, top: me.library.slice(0, 3).map(i => i.card.name) }; });
  const before = await snap();
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  let q1 = null;
  const t1 = Date.now(); while (Date.now() - t1 < 90000 && !q1) {          // time-based: the opponent may take a long turn first
    const s = await state('duel');
    if (s.choice === 'may') { const x = await sheet(); if (/Sylvan Library/.test(x.title)) { q1 = x; break; } }
    if (s.choice) await p.click('.ch-sheet .ch-auto');
    else if (s.phase === 'block') await p.evaluate(() => document.querySelector('#tab-duel .vs-block-go').click());
    else if (s.phase === 'respond') await p.evaluate(() => document.querySelector('#tab-duel .vs-pass').click());
    await p.waitForTimeout(250);
  }
  check('at the beginning of your draw step you are asked "Sylvan Library: draw two additional cards?"', !!q1 && q1.title === 'Sylvan Library: draw two additional cards?' && q1.names.join() === 'Draw two cards,Do not draw', q1 && q1.title + ' / ' + q1.names.join());
  const mid = await snap();
  await pickTile('Draw two cards'); await p.click('.ch-sheet .ch-ok');
  await p.waitForSelector('.ch-sheet', { timeout: 15000 });
  const q2 = await sheet();
  check('...then, for the first card, "pay 4 life to keep <card>?" with Pay 4 life / Put it on top', /^Sylvan Library: pay 4 life to keep .+\?$/.test(q2.title) && q2.names.slice().sort().join() === 'Pay 4 life,Put it on top' && /You have \d+ life/.test(q2.text), q2.title + ' / ' + q2.names.join());
  const first = q2.title.match(/keep (.+)\?$/)[1];
  await pickTile('Pay 4 life'); await p.click('.ch-sheet .ch-ok');
  await p.waitForSelector('.ch-sheet', { timeout: 15000 });
  const q3 = await sheet();
  check('...and for the second card', /^Sylvan Library: pay 4 life to keep .+\?$/.test(q3.title), q3.title);
  await pickTile('Put it on top'); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet') && !window.__isfVersus.duel.game.acting, null, { timeout: 20000 });
  const after = await snap();
  check('one card kept for 4 life, the other on top: life -4', after.life === mid.life - 4, mid.life + ' -> ' + after.life);
  await p.waitForFunction(() => [...document.querySelectorAll('#tab-duel .vs-log .vs-line[data-step=draw]')].some(l => /Sylvan Library/.test(l.textContent)), null, { timeout: 20000 }).catch(() => {});          // the step is logged when it ends
  const dlog = await p.$$eval('#tab-duel .vs-log .vs-line[data-step=draw]', ls => ls.map(l => l.textContent));
  check('the draw-step log says what was drawn, the life paid and what went back', dlog.some(t => /Sylvan Library: drew .+; paid 4 life to keep .+; .+ went back on top of the library/.test(t)), dlog.join(' || '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
