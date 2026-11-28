// T-061: combo play in the Goldfish Table (needs playwright, a static server on :8800 and internet access to Scryfall).
// An assembled combo is acknowledged with a banner and asked about; each answer does what it says; infinite mana shows ∞ in the mana pool.
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try { const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.selectOption('#optFormat', '60');
  await p.fill('#deckText', ['30 Island', '2 Isochron Scepter', '2 Dramatic Reversal', '2 Sol Ring', '2 Arcane Signet', '2 Walking Ballista', '20 Brainstorm'].join('\n'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck && window.__isf.cards.some(c => c.name === 'Dramatic Reversal'), null, { timeout: 90000 });
  await p.click('[data-tab=table]');
  await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  // the board: Isochron Scepter holding Dramatic Reversal, Sol Ring, three Islands; Arcane Signet and Walking Ballista in hand. Casting the Signet completes the loop.
  const setup = () => p.evaluate(() => {
    const g = window.__isf.game, G = window.Goldfish, card = n => g.deck.unique.find(c => c.name === n), mk = n => ({ iid: g.nextIid++, card: card(n) });
    g.battlefield = []; g.hand = []; g.floating = []; g.infMana = null; g.comboAsked = null; g.killTurn = null; g.winBy = null; g.comboWin = null; g.turn = Math.max(g.turn, 3); g.landThisTurn = null;
    const put = n => { const p = G.enterWithTriggers(g, mk(n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
    for (let k = 0; k < 3; k++) put('Island'); put('Sol Ring');
    const sc = put('Isochron Scepter'); sc.imprinted = { iid: g.nextIid++, card: card('Dramatic Reversal') };
    const sig = mk('Arcane Signet'), ba = mk('Walking Ballista'); g.hand.push(sig, ba); return sig.iid;
  });
  const cast = async iid => { await p.click('#zLibrary .card-back'); await p.waitForTimeout(500); await p.click(`#zHand .mtg[data-iid="${iid}"]`, { modifiers: ['Control'] }); };
  const sheet = () => p.waitForSelector('.ch-sheet.combo', { timeout: 15000 });
  const state = () => p.evaluate(() => { const g = window.__isf.game; return { kill: g.killTurn, by: g.winBy && g.winBy.kind, inf: !!g.infMana, floating: g.floating.length }; });

  let iid = await setup(); await cast(iid); await sheet();
  const txt = await p.textContent('.ch-sheet.combo');
  check('a banner says a combo is assembled, with its name and cards', /Combo assembled/.test(txt) && /Scepter loop/.test(txt) && /Isochron Scepter/.test(txt) && /Walking Ballista/.test(txt), txt.slice(0, 160));
  const names = await p.$$eval('.ch-sheet.combo .ch-opt .ch-name', e => e.map(x => x.textContent));
  check('the options fit the outcome: win, ∞, numbers, don\'t go off now', names.some(n => /Spend it: win/.test(n)) && names.some(n => /∞/.test(n)) && names.some(n => /^25 mana/.test(n)) && names.some(n => /Don't go off now/.test(n)), names.join(' | '));
  check('"How much mana?" has a number box', await p.isVisible('.ch-sheet.combo .ch-mana-n'));
  check('the autopilot\'s pick (win) is starred', (await p.$$eval('.ch-sheet.combo .ch-opt.def .ch-name', e => e.map(x => x.textContent))).join('').includes('win'));
  const pick = async re => { const i = names.findIndex(n => re.test(n)); await p.click(`.ch-sheet.combo .ch-opt >> nth=${i}`); await viewerPick(p); await p.click('.ch-sheet.combo .ch-ok'); await p.waitForSelector('.ch-sheet.combo', { state: 'detached', timeout: 15000 }); await p.waitForTimeout(400); };
  await pick(/Don't go off now/);
  let s = await state();
  check('"Don\'t go off now": no win, no ∞', s.kill == null && !s.inf, JSON.stringify(s));
  iid = await setup(); await cast(iid); await sheet();
  await p.fill('.ch-sheet.combo .ch-mana-n', '7'); await p.click('.ch-sheet.combo .ch-mana-go'); await p.waitForSelector('.ch-sheet.combo', { state: 'detached', timeout: 15000 }); await p.waitForTimeout(400);
  s = await state();
  check('a typed number of mana: that many in the pool, no ∞, no win', s.kill == null && !s.inf && s.floating >= 7, JSON.stringify(s));
  check('...the pool shows the number', !(await p.$('#hMana .mana-kind.inf')));
  iid = await setup(); await cast(iid); await sheet();
  await p.click('.ch-sheet.combo .ch-mana-inf'); await p.waitForSelector('.ch-sheet.combo', { state: 'detached', timeout: 15000 }); await p.waitForTimeout(500);
  s = await state();
  check('∞: no win yet, the game holds infinite mana', s.kill == null && s.inf, JSON.stringify(s));
  check('the mana pool shows ∞ in place of numbers', (await p.$$eval('#hMana .mana-kind.inf', e => e.map(x => x.textContent))).length >= 1 && /∞/.test(await p.textContent('#hMana')) && !/\d×/.test(await p.textContent('#hMana')), await p.textContent('#hMana'));
  iid = await setup(); await cast(iid); await sheet();
  await p.click('.ch-sheet.combo .ch-auto'); await p.waitForSelector('.ch-sheet.combo', { state: 'detached', timeout: 15000 }); await p.waitForTimeout(500);
  s = await state();
  check('the autopilot\'s answer plays the combo out: a combo win', s.kill != null && s.by === 'combo', JSON.stringify(s));
  check('the log says a combo was assembled', (await p.textContent('#gameLog')).includes('Combo assembled'));
  check('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
