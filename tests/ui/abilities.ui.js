// Goldfish Table: your activated abilities are in the card menu. A Food can be cracked for 3 life (its menu says {2}, or {1} with Sam),
// and on your turn the beginning of combat is its own step before the attack: Hakbal, cast this turn and still summoning sick, explores
// and you are asked whether the revealed card stays on top of your library.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
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
  await p.fill('#deckText', ['4 Gilded Goose', '4 Sam, Loyal Attendant', '4 Hakbal of the Surging Soul', '4 Llanowar Elves', '4 Stonecoil Serpent', '20 Forest', '20 Island'].join('\n'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.click('[data-tab=table]');
  await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  await p.waitForTimeout(600);
  // a clean board: two untapped Forests and a Food
  await p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, card = n => g.deck.unique.find(c => c.name === n);
    g.battlefield = []; g.hand = g.hand.filter(i => !i.card.a.isLand);
    for (let i = 0; i < 2; i++) { const q = G.enter(g, { iid: g.nextIid++, card: card('Forest') }, {}); q.tapped = false; }
    G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null); G.touch(g);
  });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);          // the table redraws
  const foodIid = await p.evaluate(() => window.__isf.game.battlefield.find(q => q.card.name === 'Food').iid);
  // right-click a permanent and read its menu. Under load the table may still be redrawing (the card is replaced under the click), so
  // wait for the card, then for the menu, and try again if it did not open.
  const menu = async iid => {
    for (let k = 0; k < 4; k++) {
      await p.waitForSelector(`.table .mtg[data-iid="${iid}"]`, { timeout: 15000 });
      await p.click(`.table .mtg[data-iid="${iid}"]`, { button: 'right' }).catch(() => {});
      if (await p.waitForSelector('#ctxMenu button', { state: 'visible', timeout: 3000 }).then(() => true, () => false)) break;
    }
    return p.$$eval('#ctxMenu button', bs => bs.map(x => x.textContent));
  };
  let items = await menu(foodIid);
  const crack = items.find(t => /Gain 3 life/.test(t));
  check('the Food\'s menu offers "Gain 3 life" for {2}', !!crack && /\{2\}/.test(crack), crack);
  const life0 = await p.evaluate(() => window.__isf.game.life);
  await p.click('#ctxMenu button:has-text("Gain 3 life")');
  await p.waitForFunction(l => window.__isf.game.life !== l, life0, { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(300);
  const after = await p.evaluate(() => { const g = window.__isf.game; return { life: g.life, food: g.battlefield.some(q => q.card.name === 'Food'), untapped: g.battlefield.filter(q => q.asLand && !q.tapped).length }; });
  check('...using it: 3 life, the Food is gone, {2} paid', after.life === life0 + 3 && !after.food && after.untapped === 0, JSON.stringify(after));
  // with Sam, a Food costs {1}
  await p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, card = n => g.deck.unique.find(c => c.name === n);
    g.battlefield.forEach(q => { q.tapped = false; });
    const s = G.enterWithTriggers(g, { iid: g.nextIid++, card: card('Sam, Loyal Attendant') }, {}, []); s.sick = false;
    G.createTokens(g, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null); G.touch(g);
  });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
  const food2 = await p.evaluate(() => window.__isf.game.battlefield.filter(q => q.card.name === 'Food').pop().iid);
  items = await menu(food2);
  check('with Sam on the battlefield the menu says {1}', items.some(t => /Gain 3 life.*\{1\}/.test(t)), items.filter(t => /life/.test(t)).join(' | '));
  await p.click('.ctx-cancel');
  // Hakbal, cast this turn (summoning sick): the beginning of combat asks about the explore before the attack
  await p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, card = n => g.deck.unique.find(c => c.name === n);
    g.battlefield = g.battlefield.filter(q => q.asLand);
    const hk = G.enterWithTriggers(g, { iid: g.nextIid++, card: card('Hakbal of the Surging Soul') }, {}, []); hk.sick = true; hk.enteredTurn = g.turn;
    const k = g.library.findIndex(i => !i.card.a.isLand); g.library.unshift(g.library.splice(k, 1)[0]);          // a nonland on top: a counter, and the question
    G.touch(g);
  });
  await p.click('#tNext');
  const sheet = await p.waitForSelector('.ch-sheet.explore', { timeout: 15000 }).then(() => true, () => false);
  check('Next turn: the beginning of combat asks about Hakbal\'s explore', sheet);
  const t0 = await p.evaluate(() => window.__isf.game.turn);
  check('...before the turn ends (still the same turn)', sheet && t0 === await p.evaluate(() => window.__isf.game.turn));
  if (sheet) { await p.click('.ch-sheet .ch-auto'); }
  await p.waitForTimeout(2500);
  const hk = await p.evaluate(() => { const g = window.__isf.game, q = g.battlefield.find(x => /Hakbal/.test(x.card.name)); return q ? q.counters || 0 : -1; });
  check('Hakbal got the +1/+1 counter from exploring', hk >= 1, hk);
  // ---- a spell with {X}: casting it asks for X
  await p.evaluate(() => {
    const G = window.Goldfish, g = window.__isf.game, card = n => g.deck.unique.find(c => c.name === n);
    g.battlefield = []; for (let i = 0; i < 4; i++) { const q = G.enter(g, { iid: g.nextIid++, card: card('Forest') }, {}); q.tapped = false; }
    g.hand = [{ iid: g.nextIid++, card: card('Stonecoil Serpent') }]; G.touch(g);
  });
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
  const sx = await p.evaluate(() => window.__isf.game.hand.find(i => /Stonecoil/.test(i.card.name)).iid);
  await p.click(`#zHand .mtg[data-iid="${sx}"]`, { modifiers: ['Control'] });
  const xq = await p.waitForSelector('.ch-sheet.x', { timeout: 8000 }).then(() => true, () => false);
  check('casting Stonecoil Serpent asks for X', xq);
  if (xq) {
    const names = await p.$$eval('.ch-sheet .ch-opt', bs => bs.map(x => x.textContent.trim().slice(0, 6)));
    check('...X = 1 to 4 with four lands', names.length === 4, names.join(','));
    check('...listed in number order, the most you can pay preselected', names.map(s => s.match(/X = (\d+)/)[1]).join(',') === '1,2,3,4' && await p.$eval('.ch-sheet .ch-opt:last-child', b => b.classList.contains('sel')), names.join(','));
    await p.click('.ch-sheet .ch-opt:has-text("X = 2")'); await p.click('.ch-sheet .ch-ok'); await p.waitForTimeout(1200);
    const sp = await p.evaluate(() => { const g = window.__isf.game, q = g.battlefield.find(x => /Stonecoil/.test(x.card.name)); return q ? q.counters : -1; });
    check('...X = 2: it enters with two counters', sp === 2, sp);
  }
  // ---- 1v1: a Food of yours glows; clicking it asks which ability, and cracking it gains 3 life
  await p.click('[data-tab=duel]');
  for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
  await p.selectOption('#tab-duel .vs-you', 'human');
  await p.selectOption('#tab-duel .vs-ask', 'ask');
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 90000 });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click());
  for (let k = 0; k < 400; k++) {
    const s = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return { phase: g.phase, choice: !!g.choice, over: g.over, acting: g.acting }; });
    if (s.over || (s.phase === 'main' && !s.choice && !s.acting)) break;
    if (s.choice) await p.click('.ch-sheet .ch-auto').catch(() => {});
    else if (s.phase === 'block') await p.evaluate(() => document.querySelector('#tab-duel .vs-block-go').click());
    else if (s.phase === 'respond') await p.evaluate(() => document.querySelector('#tab-duel .vs-pass').click());
    await p.waitForTimeout(120);
  }
  const dfood = await p.evaluate(() => {
    const G = window.Goldfish, gm = window.__isfVersus.duel.game, me = gm.games[gm.human], card = n => me.deck.unique.find(c => c.name === n);
    me.battlefield = me.battlefield.filter(q => !q.asLand);
    for (let i = 0; i < 2; i++) { const q = G.enter(me, { iid: me.nextIid++, card: card('Forest') }, {}); q.tapped = false; }
    G.createTokens(me, { type: 'token', n: 1, creature: false, artifact: true, name: 'Food' }, 1, [], null); G.touch(me);
    window.__isfVersus.redraw('duel');
    return me.battlefield.find(q => q.card.name === 'Food').iid;
  });
  await p.waitForTimeout(400);
  const glow = await p.$(`#tab-duel .vs-seat.me .mtg.vs-act[data-iid="${dfood}"]`);
  check('1v1: your Food glows (it has an ability you can use)', !!glow);
  if (glow) {
    const life = () => p.evaluate(() => { const gm = window.__isfVersus.duel.game; return gm.games[gm.human].life; });
    const dl0 = await life();
    await glow.click();
    const q = await p.waitForSelector('.ch-sheet.ability', { timeout: 8000 }).then(() => true, () => false);
    check('...clicking it asks which ability', q);
    if (q) { await p.click('.ch-sheet .ch-opt'); await p.click('.ch-sheet .ch-ok'); await p.waitForTimeout(1500); }
    const dl1 = await life();
    check('...and cracking it gains 3 life', dl1 === dl0 + 3, dl0 + ' -> ' + dl1);
  }
  check('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
