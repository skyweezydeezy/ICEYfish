// T-076: the Odds tab has one "Draw odds (exact math)" box whose graph shows straight away (a default group: all ramp, else card draw, else lands),
// at least 1, named in the title. Choosing cards replaces the group; Clear goes back. The card picker is folded under "Choose cards". The box is not
// folded to its header, on a phone either. Run with isf_fold on, which is what a real user's browser does by itself.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['PC', { viewport: { width: 1360, height: 900 } }], ['iPhone', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} localStorage.setItem('isf_fold', 'on'); });
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
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const t = [...document.querySelectorAll('nav button, .tabs button, [data-tab]')].find(x => /odds/i.test(x.dataset.tab || x.textContent)); t && t.click(); });
    await p.waitForTimeout(800);
    const st = () => p.evaluate(() => ({ title: document.querySelector('#oddsTitle').textContent, bars: document.querySelectorAll('#chartOdds *').length, sel: window.__isf.oddsSel.size, picker: document.querySelectorAll('#oddsPicker .mtg').length,
      chooseOpen: document.querySelector('#oddsChoose').open, boxClosed: document.querySelector('#oddsBox').classList.contains('box-closed'), chartVisible: document.querySelector('#chartOdds').getBoundingClientRect().height > 0 }));
    let s0 = await st();
    check(`${name}: the graph shows with nothing picked`, s0.sel === 0 && s0.bars > 3 && s0.chartVisible, JSON.stringify(s0));
    check(`${name}: the title names the default group, at least 1`, /^At least 1 of \d+ (ramp cards|card-draw cards|lands) \(library \d+\)/.test(s0.title), s0.title);
    check(`${name}: the Draw odds box is not folded`, !s0.boxClosed);
    check(`${name}: "Pick cards on the left" and the second box are gone`, await p.evaluate(() => !/Pick cards on the left/.test(document.body.textContent) && !document.querySelector('#tab-odds .two-col') && document.querySelector('#chartOdds').closest('.card-box') === document.querySelector('#oddsPicker').closest('.card-box')));
    check(`${name}: the card picker is folded under "Choose cards"`, !s0.chooseOpen && s0.picker > 10);
    await p.click('#oddsChoose > summary'); await p.waitForTimeout(300);
    await p.click('#oddsPicker .mtg >> nth=3', { position: { x: 10, y: 60 } }); await p.waitForSelector('#lightbox.show .lb-act'); await p.waitForTimeout(450); await p.click('#lightbox .lb-act:has-text("Add to the odds")'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);          // T-134: a tap opens the card; "Add to the odds" is its button
    const s1 = await st();
    check(`${name}: picking a card replaces the default group`, s1.sel === 1 && /^At least 1 of \d+ cards? \(library/.test(s1.title) && s1.title !== s0.title, s1.title);
    await p.click('#oddsClear'); await p.waitForTimeout(400);
    const s2 = await st();
    check(`${name}: Clear goes back to the default group`, s2.sel === 0 && s2.title === s0.title && s2.bars > 3, s2.title);
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
