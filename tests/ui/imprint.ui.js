// The card imprinted on a permanent is shown with it: Isochron Scepter and Chrome Mox on the Goldfish Table (real casts),
// and Isochron Scepter on the 1v1 table. Clicking the imprinted card opens it in the card viewer.
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DECK = ['1 Isochron Scepter', '1 Chrome Mox', '4 Lightning Bolt', '4 Shock', '4 Opt', '4 Goblin Guide', '22 Mountain', '20 Island'].join('\n');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request();
    const c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.selectOption('#optFormat', '60');
  await p.fill('#deckText', DECK);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);

  // ---- Goldfish Table ----
  await p.click('[data-tab=table]');
  await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  // put the two artifacts and a Lightning Bolt in hand, then draw a card so the table is redrawn
  const toHand = names => p.evaluate(ns => { const g = window.__isf.game; ns.forEach(n => { if (g.hand.some(i => i.card.name === n)) return; const k = g.library.findIndex(i => i.card.name === n); if (k >= 0) g.hand.push(g.library.splice(k, 1)[0]); }); }, names);
  await toHand(['Isochron Scepter', 'Lightning Bolt']);
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
  const castFree = async (name, pick) => {
    const iid = await p.evaluate(n => window.__isf.game.hand.find(i => i.card.name === n).iid, name);
    await p.evaluate(id => document.querySelector('#zHand .mtg[data-iid="' + id + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })), iid);
    await p.click('#ctxMenu button:has-text("Cast (ignore mana)")');
    if (pick) {          // T-086: a person is asked which card to imprint (the sheet lists only the legal cards)
      await p.waitForSelector('.ch-sheet', { timeout: 15000 });
      await p.click('.ch-sheet .ch-opt[title^="' + pick + '"]'); await viewerPick(p); await p.click('.ch-sheet .ch-ok');
      await p.waitForFunction(() => !document.querySelector('.ch-sheet'), null, { timeout: 10000 });
    }
    await p.waitForTimeout(1500);
  };
  await castFree('Isochron Scepter', 'Lightning Bolt');
  const sc = await p.evaluate(() => { const g = window.__isf.game, perm = g.battlefield.find(x => x.card.name === 'Isochron Scepter'); const el = document.querySelector('.table .stackgroup.imprint .imprinted-card');
    return { engine: perm && perm.imprinted ? perm.imprinted.card.name : null, shown: el ? el.title : null, tag: el && el.querySelector('.tag') ? el.querySelector('.tag').textContent : null, before: el && el.nextElementSibling ? el.nextElementSibling.dataset.iid == perm.iid : false }; });
  check('Goldfish Table: casting Isochron Scepter imprints the instant you chose from your hand', sc.engine === 'Lightning Bolt', sc.engine);
  check('...and the imprinted card is shown tucked behind the Scepter, labelled', !!sc.shown && sc.shown.startsWith(sc.engine + ':') && /Isochron Scepter/.test(sc.shown) && sc.tag === 'Imprint' && sc.before, sc.shown);
  await p.click('.table .imprinted-card', { position: { x: 6, y: 40 } }); await p.waitForTimeout(500);
  check('...and clicking it opens that card in the viewer', (await p.isVisible('#lightbox.show')) && (await p.textContent('.lb-name')) === sc.engine, await p.textContent('.lb-name').catch(() => ''));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);

  await toHand(['Chrome Mox', 'Shock']);
  await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
  await castFree('Chrome Mox', 'Shock');
  const mox = await p.evaluate(() => { const els = [...document.querySelectorAll('.table .imprinted-card')].map(e => e.title); const log = [...document.querySelectorAll('#gameLog li')].map(l => l.textContent).filter(t => /Imprint: exiled/.test(t)); return { els, log: log[log.length - 1] || '' }; });
  check('Goldfish Table: Chrome Mox exiles a card when it enters', /Chrome Mox makes/.test(mox.log), mox.log.slice(0, 90));
  check('...and that card is shown with the Mox', mox.els.some(t => /imprinted on Chrome Mox/.test(t)), mox.els.join(' | '));

  // ---- 1v1 table ----
  await p.click('[data-tab=duel]');
  await p.selectOption('#tab-duel .vs-opp', '');
  await p.selectOption('#tab-duel .vs-you', 'human');
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000 });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click());
  // the opponent may go first: each spell it casts asks "does it resolve?" (the stack), and its end step may stop for you. Let the
  // autopilot answer for you until it is your main phase.
  for (const t0 = Date.now(); Date.now() - t0 < 60000;) {
    const st = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return { done: g.phase === 'main' || g.phase === 'block' || !!g.over, sheet: !!document.querySelector('.ch-sheet .ch-auto'), respond: g.phase === 'respond' }; });
    if (st.done) break;
    if (st.sheet) await p.click('.ch-sheet .ch-auto'); else if (st.respond) await p.evaluate(() => { const b = document.querySelector('#tab-duel .vs-pass'); if (b) b.click(); });
    await p.waitForTimeout(150);
  }
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.phase === 'main' || g.phase === 'block' || g.over; }, null, { timeout: 5000 });
  const vs = await p.evaluate(() => {
    const G = window.Goldfish, gm = window.__isfVersus.duel.game, g = gm.games[0];
    const take = n => { let i = g.hand.find(x => x.card.name === n); if (!i) { const k = g.library.findIndex(x => x.card.name === n); i = g.library.splice(k, 1)[0]; g.hand.push(i); } return i; };
    take('Lightning Bolt'); const scepter = take('Isochron Scepter');
    G.castCard(g, scepter, true);                           // the engine imprints; then redraw the table
    window.dispatchEvent(new Event('isf-look'));
    const perm = g.battlefield.find(x => x.card.name === 'Isochron Scepter'), el = document.querySelector('#tab-duel .vs-seat.me .vs-stack.imprint .vs-imp');
    return { engine: perm && perm.imprinted ? perm.imprinted.card.name : null, shown: el ? el.title : null };
  });
  check('1v1 table: the card imprinted on Isochron Scepter is shown with it', !!vs.engine && !!vs.shown && vs.shown.startsWith(vs.engine + ':'), vs.shown);
  if (process.env.SHOTS) {
    await p.$eval('#tab-duel .vs-screen', e => { const bar = document.querySelector('.topbar'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - bar.offsetHeight - 4); });
    await p.mouse.move(4, 300); await p.waitForTimeout(1200);
    await p.screenshot({ path: process.env.SHOTS + '/imprint-duel.png' });
  }
  await p.evaluate(() => document.querySelector('#tab-duel .vs-seat.me .vs-imp').click()); await p.waitForTimeout(500);
  check('...and clicking it opens that card in the viewer', (await p.isVisible('#lightbox.show')) && (await p.textContent('.lb-name')) === vs.engine);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e.message); process.exit(1); });
