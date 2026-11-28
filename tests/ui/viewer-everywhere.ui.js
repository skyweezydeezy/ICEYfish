// Every card on every tab can be opened in the card viewer (price, printings, TCGplayer / Card Kingdom / ManaPool):
// a tap or click (T-134: where a card has an action, it is a button in the viewer), or a right-click.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
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
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(2500);
  // open the viewer on the first card matching sel; how = 'click' (card centre), 'corner' (the 🔍) or 'right'
  const opens = async (sel, how = 'click') => {
    const el = await p.$(sel); if (!el) return 'no card';
    await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(200);
    const bb = await el.boundingBox();
    const at = how === 'corner' ? [bb.x + bb.width - 12, bb.y + 12] : how === 'cornerL' ? [bb.x + 12, bb.y + 12] : [bb.x + bb.width / 2, bb.y + Math.min(bb.height / 2, 40)];
    await p.mouse.click(at[0], at[1], how === 'right' ? { button: 'right' } : {});
    await p.waitForTimeout(500);
    const ok = await p.isVisible('#lightbox.show') && (await p.$$eval('.lb-buy', x => x.length)) === 3;
    if (await p.isVisible('#lightbox.show')) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
    return ok;
  };
  check('Deck: curve wall card', await opens('#curveWall .curve-col:nth-child(3) .mtg:last-child') === true);
  check('Deck: land pile', await opens('#landWall .mtg') === true);
  check('Deck: token', await opens('#tokenWall .mtg') === true);
  await p.uncheck('#covOnlyGaps'); await p.waitForTimeout(400);
  check('Deck: card in "How the engine reads your cards"', await opens('#coverage .mtg') === true);
  await p.click('[data-tab=hands]'); await p.click('#drawHand'); await p.waitForTimeout(1500);
  check('Opening Hands: card in the drawn hand', await opens('.fan .mtg:nth-child(4)') === true);
  await p.click('#dealMany'); await p.waitForTimeout(1500);
  const pickedHands = await p.$$eval('.mini-hand.selected', x => x.length);
  check('Opening Hands: sample hand card, a plain tap opens it without picking the hand', await opens('.mini-hand .mtg:nth-child(2)') === true && pickedHands === await p.$$eval('.mini-hand.selected', x => x.length));
  { // T-134: the viewer from a sample hand offers the hand's own buttons, and swipes within that one hand
    await p.click('.mini-hand >> nth=0 >> .mtg >> nth=1'); await p.waitForSelector('#lightbox.show .lb-act', { timeout: 5000 }); await p.waitForTimeout(450);
    const v = await p.evaluate(() => ({ acts: [...document.querySelectorAll('#lightbox .lb-act')].map(x => x.textContent), count: document.querySelector('#lightbox .lb-count').textContent, n: document.querySelectorAll('.mini-hand')[0].querySelectorAll('.mtg').length }));
    check('Opening Hands: the viewer has "Use this hand" and "Goldfish ▶ with this hand", and swipes only through that hand', v.acts.length === 2 && /^Use this hand/.test(v.acts[0]) && /Goldfish/.test(v.acts[1]) && /^\d+ of \d+$/.test(v.count) && +v.count.split(' of ')[1] <= v.n, JSON.stringify(v));
    await p.click('#lightbox .lb-act:has-text("Use this hand")'); await p.waitForTimeout(400);
    check('Opening Hands: pressing it swaps that hand in and closes the viewer', !(await p.isVisible('#lightbox.show')) && (await p.$$eval('.mini-hand.selected', x => x.length)) === 1);
  }
  check('Opening Hands: sample hand card, right-click', await opens('.mini-hand .mtg', 'right') === true);
  await p.click('[data-tab=deck]'); await p.fill('#optN', '500');          // a sample game is all this needs: the default 10,000 games took over two minutes
  await p.click('[data-tab=sim]'); await p.click('#runSim');
  await p.waitForSelector('#sampleButtons button', { timeout: 120000 });
  await p.click('#sampleButtons button'); await p.waitForTimeout(1500);
  check('Simulation: card in a sample game replay', await opens('#replay .mtg') === true);
  check('Simulation: card name in the heatmap', await opens('#heatmap .mtg-ref') === true);
  await p.click('[data-tab=odds]'); await p.waitForTimeout(500);
  await p.evaluate(() => { document.querySelector('#oddsChoose').open = true; }); await p.waitForTimeout(200);          // the picker is folded under "Choose cards" (T-076)
  const sel0 = await p.$$eval('#oddsPicker .mtg.sel', x => x.length);
  check('Draw Odds: picker card, a plain tap opens it without picking the card', await opens('#oddsPicker .mtg') === true && sel0 === await p.$$eval('#oddsPicker .mtg.sel', x => x.length));
  check('Draw Odds: picker card, right-click', await opens('#oddsPicker .mtg', 'right') === true);
  await p.click('#oddsPicker .mtg', { position: { x: 10, y: 60 } }); await p.waitForSelector('#lightbox.show .lb-act', { timeout: 5000 }); await p.waitForTimeout(450);
  check('Draw Odds: the viewer has "Add to the odds" as its button', (await p.$$eval('#lightbox .lb-act', xs => xs.map(x => x.textContent))).join() === 'Add to the odds');
  await p.click('#lightbox .lb-act'); await p.waitForTimeout(500);
  check('Draw Odds: pressing it picks the card (the viewer stays open and now offers "Remove from the odds")', (await p.$$eval('#oddsPicker .mtg.sel', x => x.length)) === sel0 + 1 && (await p.$$eval('#lightbox .lb-act', xs => xs.map(x => x.textContent))).join() === 'Remove from the odds');
  await p.click('#lightbox .lb-act'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Draw Odds: ...and Remove takes it out again', (await p.$$eval('#oddsPicker .mtg.sel', x => x.length)) === sel0);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
