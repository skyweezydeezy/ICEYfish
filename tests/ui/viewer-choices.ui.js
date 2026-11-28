// The in-game choices are offered in the card viewer too (the screen with prices and printings), so you do not have to close it first.
// Goldfish table: Tap / counters keep the viewer open and update; Cast closes it and the card is played. 1v1: a castable card in your hand
// offers "Cast" in the viewer, and that plays it exactly as clicking the glowing card does.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/'); await p.waitForTimeout(500);
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(1200);

  // ---- Goldfish table
  // After the test puts cards into the hand, a click on the library pile draws one and so redraws the table. The page clicks it itself: with a long hand the
  // battlefield rows can lie over the pile (a layout problem of the Goldfish Table with 12+ cards in hand), and that must not decide this test.
  const redraw = async () => { await p.evaluate(() => document.querySelector('#zLibrary .card-back').click()); await p.waitForTimeout(500); };
  await p.click('[data-tab=table]'); await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
  await p.evaluate(() => { const g = window.__isf.game; const ns = ['Sol Ring', 'Forest']; ns.forEach(n => { if (g.hand.some(i => i.card.name === n)) return; const k = g.library.findIndex(i => i.card.name === n); if (k >= 0) g.hand.push(g.library.splice(k, 1)[0]); }); });
  await redraw();
  const menu = (zone, name) => p.evaluate(([z, n]) => { const g = window.__isf.game, inst = (z === 'hand' ? g.hand : g.battlefield.map(x => x.inst || x)).find(i => (i.card || i).name === n); const iid = inst.iid; const el = document.querySelector('.table .mtg[data-iid="' + iid + '"]'); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 })); return iid; }, [zone, name]).then(async iid => { await p.waitForTimeout(400); return iid; });          // T-102: a touch menu ignores taps in its first 350 ms (ghost-tap guard)
  await menu('hand', 'Forest'); await p.click('#ctxMenu button:has-text("Play land")'); await p.waitForTimeout(900);
  const lands = await p.evaluate(() => window.__isf.game.battlefield.filter(x => x.card.name === 'Forest').length);
  check('setup: a Forest is on the battlefield', lands >= 1);
  await menu('battlefield', 'Forest');
  await p.click('#ctxMenu button:has-text("View card")'); await p.waitForTimeout(500);
  check('the viewer opens from the menu, with an "In this game" row of choices', await p.isVisible('#lightbox.show') && await p.isVisible('.lb-acts') && /In this game/.test(await p.textContent('.lb-acts')));
  const labels = await p.$$eval('.lb-act', xs => xs.map(x => x.textContent));
  check('the choices include Tap and Move to hand (the same as the table menu), but not "View card"', labels.includes('↻ Tap') && labels.some(l => /Move to hand/.test(l)) && !labels.some(l => /View card/.test(l)), labels.join(' | '));
  await p.click('.lb-act:has-text("Tap")'); await p.waitForTimeout(500);
  const t1 = await p.evaluate(() => window.__isf.game.battlefield.filter(x => x.card.name === 'Forest').some(x => x.tapped));
  check('Tap taps the Forest, and the viewer stays open, now offering Untap', t1 && await p.isVisible('#lightbox.show') && (await p.$$eval('.lb-act', xs => xs.map(x => x.textContent))).includes('↺ Untap'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // a creature: a counter from the viewer keeps it open, still offering the choices, with the counter on the permanent
  await p.evaluate(() => { const g = window.__isf.game; const k = g.library.findIndex(i => /Creature/.test(i.card.type_line || '')); if (k >= 0) g.hand.push(g.library.splice(k, 1)[0]); });
  await redraw();
  const crName = await p.evaluate(() => { const g = window.__isf.game, i = [...g.hand].reverse().find(x => /Creature/.test(x.card.type_line || '')); return i ? i.card.name : null; });
  await menu('hand', crName); await p.click('#ctxMenu button:has-text("Put onto battlefield")'); await p.waitForTimeout(900);
  await menu('battlefield', crName); await p.click('#ctxMenu button:has-text("View card")'); await p.waitForTimeout(500);
  await p.click('.lb-act:has-text("+1/+1 counter")'); await p.waitForTimeout(500);
  const cnt = await p.evaluate(n => { const x = window.__isf.game.battlefield.find(y => y.card.name === n); return x ? x.counters || 0 : -1; }, crName);
  check('a +1/+1 counter from the viewer lands on the creature, and the viewer stays open with its choices', cnt === 1 && await p.isVisible('#lightbox.show') && (await p.$$('.lb-act')).length > 3, crName + ' counters=' + cnt);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // a move closes the viewer and does it
  await menu('battlefield', 'Forest'); await p.click('#ctxMenu button:has-text("View card")'); await p.waitForTimeout(500);
  await p.click('.lb-act:has-text("Sacrifice / destroy")'); await p.waitForTimeout(700);
  check('"Sacrifice / destroy" in the viewer closes it and the Forest goes to the graveyard', !(await p.isVisible('#lightbox.show')) && await p.evaluate(() => window.__isf.game.graveyard.some(i => i.card.name === 'Forest')));
  // a card in hand: Cast closes the viewer and plays it
  await p.evaluate(() => { const g = window.__isf.game; if (!g.hand.some(i => i.card.name === 'Sol Ring')) { const k = g.library.findIndex(i => i.card.name === 'Sol Ring'); if (k >= 0) g.hand.push(g.library.splice(k, 1)[0]); } });
  await redraw();
  await menu('hand', 'Sol Ring'); await p.click('#ctxMenu button:has-text("View card")'); await p.waitForTimeout(500);
  await p.click('.lb-act:has-text("Cast (ignore mana)")'); await p.waitForTimeout(1500);
  check('"Cast (ignore mana)" in the viewer closes it and Sol Ring is on the battlefield', !(await p.isVisible('#lightbox.show')) && await p.evaluate(() => window.__isf.game.battlefield.some(x => x.card.name === 'Sol Ring')));

  // ---- 1v1: a glowing card in your hand offers Cast
  await p.click('[data-tab=duel]');
  for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
  await p.selectOption('#tab-duel .vs-you', 'human'); await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 90000 });
  await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click());
  {          // the opponent may go first: answer its "does it resolve?" questions (the autopilot's pick) and pass its end step
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const st = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return { done: g.phase === 'main' || !!g.over, sheet: !!document.querySelector('.ch-sheet .ch-auto'), respond: g.phase === 'respond' }; });
      if (st.done) break;
      if (st.sheet) await p.click('.ch-sheet .ch-auto'); else if (st.respond) await p.evaluate(() => { const b = document.querySelector('#tab-duel .vs-pass'); if (b) b.click(); });
      await p.waitForTimeout(150);
    }
  }
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.phase === 'main' || !!g.over; }, null, { timeout: 90000 });
  await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[gm.human]; const plain = i => i.card.a.isLand && !/return a land you control|search your library|sacrifice/i.test(i.card.oracle_text || ''); if (!g.hand.some(plain)) { const k = g.library.findIndex(plain); g.hand.push(g.library.splice(k, 1)[0]); } window.__isfVersus.redraw('duel'); });          // a plain land: a bounce land or a fetch land does not add one to the count
  await p.waitForTimeout(500);
  const before = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[gm.human]; return { lands: g.battlefield.filter(x => x.asLand).length, iid: g.hand.find(i => i.card.a.isLand && !/return a land you control|search your library|sacrifice/i.test(i.card.oracle_text || '')).iid }; });
  await p.evaluate(iid => document.querySelector('#tab-duel .vs-hand .vs-card[data-iid="' + iid + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })), before.iid);
  await p.waitForTimeout(500);
  check('1v1: a land you can play offers "Play land" in the viewer', await p.isVisible('#lightbox.show') && (await p.$$eval('.lb-act', xs => xs.map(x => x.textContent))).includes('▶ Play land'), (await p.$$eval('.lb-act', xs => xs.map(x => x.textContent))).join(' | '));
  await p.click('.lb-act:has-text("Play land")'); await p.waitForTimeout(1500);
  const after = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[gm.human]; return g.battlefield.filter(x => x.asLand).length; });
  check('...and Play land plays it, with the viewer closed', after === before.lands + 1 && !(await p.isVisible('#lightbox.show')), `${before.lands} -> ${after}`);
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
