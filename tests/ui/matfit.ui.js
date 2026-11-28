// Moving the playmat to taste: a three-finger drag on a playmat moves it, spreading the fingers zooms in; the Adjust button in the
// playmat picker does the same with one finger or a mouse (and Reset puts it back). Saved per playmat, kept after a reload, and used on
// every surface that shows that playmat: the Goldfish table, the opening-hands stage and your seat at the 1v1 table.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const shot = process.env.SHOTS;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); } catch (e) {} });
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
  await p.waitForTimeout(600);
  await p.evaluate(() => { localStorage.removeItem('isf_matfit'); window.__isfLooks.set({ mat: 'dragon', sleeve: 'dragon' }); });
  await p.click('[data-tab=table]'); await p.waitForTimeout(400);
  const bg = sel => p.$eval(sel, e => { const cs = getComputedStyle(e); return { pos: cs.backgroundPosition, size: cs.backgroundSize }; });
  const b0 = await bg('.table-main');
  check('a playmat starts centred, filling the table', /50%/.test(b0.pos) && /cover/.test(b0.size), JSON.stringify(b0));

  // ---- three fingers: drag left and spread
  const cdp = await ctx.newCDPSession(p);
  const box = await p.$eval('.table-main', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const pts = (dx, sp) => [[-40, 0], [40, 0], [0, 40]].map(([ox, oy], i) => ({ x: box.x + dx + ox * sp, y: box.y + oy * sp, id: i }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0, 1) });
  for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(-20 * k, 1 + 0.1 * k) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(200);
  const f1 = (await p.evaluate(() => window.__isfLooks.fit())).dragon, b1 = await bg('.table-main');
  check('three fingers dragged and spread: the playmat zooms in and moves', !!f1 && f1.z > 1.3 && f1.x !== 50 && /px/.test(b1.size), JSON.stringify(f1) + ' ' + JSON.stringify(b1));
  if (shot) await p.screenshot({ path: path.join(shot, 'matfit-table.png') });
  await p.click('[data-tab=hands]'); await p.waitForTimeout(400);
  const bh = await bg('.hand-stage');
  check('the opening-hands stage shows the same playmat in the same place', bh.pos.split(',')[0].trim() === `${f1.x}% ${f1.y}%`, JSON.stringify(bh));
  await p.reload(); await p.waitForTimeout(600);
  check('it is remembered after a reload', JSON.stringify((await p.evaluate(() => window.__isfLooks.fit())).dragon) === JSON.stringify(f1));

  // ---- the Adjust button: one-finger (mouse) drag, wheel zoom, Reset, Done
  await p.click('[data-tab=table]'); await p.waitForTimeout(300);
  await p.evaluate(() => window.__isfLooks.open());
  await p.click('#lkAdjust'); await p.waitForTimeout(200);
  check('Adjust closes the picker and puts a drag layer over the playmat', !(await p.isVisible('#lookPicker')) && await p.isVisible('.mat-adjust') && await p.isVisible('.mat-adjust-bar'));
  const lb = await p.$eval('.mat-adjust', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(lb.x, lb.y); await p.mouse.down(); await p.mouse.move(lb.x + 120, lb.y + 30, { steps: 5 }); await p.mouse.up();
  const f2 = (await p.evaluate(() => window.__isfLooks.fit())).dragon;
  check('dragging on it moves the playmat', f2.x < f1.x && f2.x > 30, JSON.stringify(f1) + ' -> ' + JSON.stringify(f2));
  await p.mouse.move(lb.x, lb.y); await p.mouse.wheel(0, -200); await p.waitForTimeout(100);
  check('scrolling zooms', (await p.evaluate(() => window.__isfLooks.fit())).dragon.z > f2.z);
  await p.click('.mat-adjust-bar [data-a=reset]');
  check('Reset puts it back in the middle, filling the table', !(await p.evaluate(() => window.__isfLooks.fit())).dragon && /cover/.test((await bg('.table-main')).size));
  await p.click('.mat-adjust-bar [data-a=done]');
  check('Done removes the layer', !(await p.$('.mat-adjust')) && !(await p.$('.mat-adjust-bar')));

  // ---- your seat at the 1v1 table uses the same setting
  await p.evaluate(() => localStorage.setItem('isf_matfit', JSON.stringify({ dragon: { x: 20, y: 70, z: 1.5 } }))); await p.reload(); await p.waitForTimeout(600);
  await p.click('[data-tab=deck]');          // a reload reopens the tab you were on (remember.js)
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.click('[data-tab=duel]');
  for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
  await p.selectOption('#tab-duel .vs-you', 'human');
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 90000 });
  await p.waitForTimeout(400);
  const seat = await p.$eval('#tab-duel .vs-seat.me', e => ({ mat: e.dataset.mat, pos: getComputedStyle(e).backgroundPosition }));
  check('your seat at the 1v1 table shows your playmat where you put it', seat.mat === 'dragon' && seat.pos.split(',')[0].trim() === '20% 70%', JSON.stringify(seat));
  check('no page errors', !errs.length, errs[0]);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
