// T-086: in a Duel a person casts Chrome Mox and is asked which card to imprint. The sheet lists exactly the legal hand cards (a nonartifact,
// nonland card: no land, no artifact) plus "Don't imprint"; picking one exiles it and the Mox makes its colour; "Don't imprint" exiles nothing.
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DECK = ['2 Chrome Mox', '1 Sol Ring', '4 Lightning Bolt', '4 Opt', '4 Goblin Guide', '22 Mountain', '20 Island'].join('\n');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });
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
  await p.selectOption('#optFormat', '60');
  await p.fill('#deckText', DECK);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-opp', '');
  await p.selectOption('#tab-duel .vs-you', 'human');
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000 });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click());
  for (const t0 = Date.now(); Date.now() - t0 < 60000;) {          // the autopilot answers for the person until it is their main phase
    const st = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return { done: g.phase === 'main' || g.phase === 'block' || !!g.over, sheet: !!document.querySelector('.ch-sheet .ch-auto'), respond: g.phase === 'respond' }; });
    if (st.done) break;
    if (st.sheet) await p.click('.ch-sheet .ch-auto'); else if (st.respond) await p.evaluate(() => { const bt = document.querySelector('#tab-duel .vs-pass'); if (bt) bt.click(); });
    await p.waitForTimeout(150);
  }
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.phase === 'main' || g.phase === 'block' || g.over; }, null, { timeout: 5000 });
  // the hand: two Chrome Moxes, Opt, Lightning Bolt, Sol Ring and a Mountain (Opt and the Bolt are the only legal cards)
  await p.evaluate(() => {
    const gm = window.__isfVersus.duel.game, g = gm.games[0]; g.library.push(...g.hand.splice(0)); g.hand.length = 0;
    for (const n of ['Chrome Mox', 'Chrome Mox', 'Opt', 'Lightning Bolt', 'Sol Ring', 'Mountain']) { const k = g.library.findIndex(x => x.card.name === n && !g.hand.includes(x)); g.hand.push(g.library.splice(k, 1)[0]); }
    window.dispatchEvent(new Event('isf-look'));
  });
  await p.waitForTimeout(500);
  const castMox = async () => {
    const iid = await p.evaluate(() => window.__isfVersus.duel.game.games[0].hand.find(i => i.card.name === 'Chrome Mox').iid);
    await p.click(`#tab-duel .vs-hand .vs-card[data-iid="${iid}"]`);
    await p.waitForSelector('.ch-sheet', { timeout: 15000 });
    if (await p.evaluate(() => !!document.querySelector('.ch-sheet.resolve'))) { await p.click('.ch-sheet .ch-none'); await p.waitForTimeout(300); }          // "does it resolve?": pass
    await p.waitForSelector('.ch-sheet.imprint', { timeout: 15000 });
  };
  await castMox();
  const sheet = await p.evaluate(() => ({ title: document.querySelector('.ch-sheet h3, .ch-sheet .ch-title, .ch-sheet')?.textContent || '', opts: [...document.querySelectorAll('.ch-sheet .ch-opt')].map(o => o.title).sort(), none: (document.querySelector('.ch-sheet .ch-none') || {}).textContent }));
  check('casting Chrome Mox opens the imprint question', /imprint/i.test(sheet.title), sheet.title.slice(0, 60));
  check('the options are exactly the legal cards (Lightning Bolt, Opt): no land, no artifact', sheet.opts.length === 2 && sheet.opts.every(t => /^(Lightning Bolt|Opt)/.test(t)), sheet.opts.join(' | '));
  check('"Don\'t imprint" is offered', sheet.none === "Don't imprint", sheet.none);
  await p.click('.ch-sheet .ch-opt[title^="Opt"]'); await viewerPick(p); await p.click('.ch-sheet .ch-ok');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet'), null, { timeout: 10000 });
  const r1 = await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0], mox = g.battlefield.find(x => x.card.name === 'Chrome Mox'); return { hand: g.hand.map(i => i.card.name), exile: g.exile.map(i => i.card.name), colors: mox && mox.produce ? [...mox.produce.colors].join() : null }; });
  check('picking Opt exiles it from the hand and the Mox makes blue', r1.exile.includes('Opt') && !r1.hand.includes('Opt') && r1.colors === 'U', JSON.stringify(r1));
  await castMox();
  await p.click('.ch-sheet .ch-none');
  await p.waitForFunction(() => !document.querySelector('.ch-sheet'), null, { timeout: 10000 });
  const r2 = await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; return { hand: g.hand.map(i => i.card.name), exile: g.exile.map(i => i.card.name), moxes: g.battlefield.filter(x => x.card.name === 'Chrome Mox').length }; });
  check('"Don\'t imprint": the second Mox is in play and the Bolt stays in hand, nothing more is exiled', r2.moxes === 2 && r2.hand.includes('Lightning Bolt') && r2.exile.length === r1.exile.length, JSON.stringify(r2));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e.message); process.exit(1); });
