// Phone tap menu and card viewer: one tap opens the menu, tapping outside or Back closes it, and the viewer
// moves between cards, lists printings and links to shops. Runs as an iPhone (touch, no hover).
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
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
  await p.tap('[data-tab=table]'); await p.check('#tFast'); await p.fill('#tAutoToN', '3'); await p.tap('#tAutoTo', { position: { x: 12, y: 12 } }); await p.waitForTimeout(8000);
  const hand = await p.$('#zHand .mtg'); await hand.scrollIntoViewIfNeeded();
  const nHand = () => p.$$eval('#zHand .mtg', x => x.length), n0 = await nHand();
  const edge = { position: { x: 10, y: 60 } };   // hand cards overlap; tap the visible left edge
  await hand.tap(edge); await p.waitForTimeout(400);
  check('one tap on a card opens it in the viewer, and plays nothing', await p.isVisible('#lightbox.show') && !(await p.isVisible('#ctxMenu')) && n0 === await nHand());
  check('the viewer leads with the main action as a button', /Cast|Play land/.test(await p.$eval('#lightbox .lb-act', e => e.textContent)));
  await p.tap('#lightbox .lb-x'); await p.waitForTimeout(300);
  check('✕ closes it and does nothing else', !(await p.isVisible('#lightbox.show')) && n0 === await nHand());
  await hand.tap(edge); await p.waitForTimeout(600); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('Esc closes it too', !(await p.isVisible('#lightbox.show')));
  await hand.tap(edge); await p.waitForTimeout(3000);
  const name0 = await p.textContent('.lb-name'), count0 = await p.textContent('.lb-count');
  check('View card opens the viewer with a position count', /^\d+ of \d+$/.test(count0), name0 + ' ' + count0);
  await p.tap('.lb-nav.next'); await p.waitForTimeout(300);
  check('next moves to another card', (await p.textContent('.lb-name')) !== name0);
  await p.tap('.lb-nav.prev'); await p.waitForTimeout(300);
  check('previous moves back', (await p.textContent('.lb-name')) === name0);
  // printings come live from Scryfall: wait for them rather than a fixed time; if this card has a single printing, step to one with more
  for (let k = 0; k < 6; k++) {
    await p.waitForFunction(() => document.querySelectorAll('.lb-print').length > 0 || /not available/.test((document.querySelector('.lb-strip') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
    if ((await p.$$eval('.lb-print', x => x.length)) > 1) break;
    await p.tap('.lb-nav.next'); await p.waitForTimeout(300);
  }
  const nPrint = await p.$$eval('.lb-print', x => x.length);
  check('printings are listed with prices', nPrint > 1, nPrint + ' printings');
  const shop = await p.$$eval('.lb-buy', x => x.map(a => a.href));
  check('shop links for TCGplayer, Card Kingdom and ManaPool', shop.length === 3 && /tcgplayer\.com/.test(shop[0]) && /cardkingdom\.com/.test(shop[1]) && /manapool\.com/.test(shop[2]));
  // the link follows the printing: a product page when Scryfall knows the printing's TCGplayer id, a search link when it does not.
  // So try printings until one has an id (the check still fails when none does).
  // T-112: tapping a printing of a card of your deck uses it at once (no Use button) and says so. The card's own printing says nothing new,
  // so try printings until one shows the message and a product link (the check still fails when none does).
  let linked = false, said = false;
  for (let k = 0; k < Math.min(nPrint, 8) && !(linked && said); k++) {
    await (await p.$$('.lb-print'))[k].tap();
    await p.waitForFunction(() => /Now using/.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 4000, polling: 200 }).catch(() => {});
    said = /Now using/.test(await p.textContent('#toast').catch(() => ''));
    linked = await p.$eval('.lb-buy', a => /tcgplayer\.com\/product\/\d+/.test(a.href)).catch(() => false);
  }
  check('tapping a printing of your own card uses it at once (no Use button), and its shop links follow it', !(await p.$('.lb-use')) && linked, JSON.stringify({ linked, nPrint, name: name0 }));
  check('using it confirms with a message', said);
  await p.tap('.lb-x'); await p.waitForTimeout(200);
  check('Close closes the viewer', !(await p.isVisible('#lightbox.show')));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
