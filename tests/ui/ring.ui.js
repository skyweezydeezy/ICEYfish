const { chromium } = require('playwright');
const fs = require('fs');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
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
  await p.fill('#deckText', fs.readFileSync(require('path').join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(2500);
  await p.click('[data-tab=table]');
  await p.check('#tFast');
  await p.fill('#tAutoToN', '4');
  // play until there is a creature on the battlefield
  await p.click('#tAutoTo', { position: { x: 12, y: 12 } });
  await p.waitForTimeout(9000);
  let creature = await p.$('#zCreatures .mtg');
  for (let i = 0; i < 4 && !creature; i++) { await p.fill('#tAutoToN', String(5 + i)); await p.click('#tAutoTo', { position: { x: 12, y: 12 } }); await p.waitForTimeout(5000); creature = await p.$('#zCreatures .mtg'); }
  check('there is a creature to carry the Ring', !!creature);
  const hud0 = await p.textContent('#hRing'); const n0 = (hud0.match(/(\d+)×/) || [0, 0])[1] | 0;   // the engine now tempts the Ring by itself during autopilot (Frodo, Boromir), so count from there
  check('the HUD shows the Ring state before the manual temptations', hud0 === '—' || /💍/.test(hud0), hud0);
  const tempt = async () => {
    const c = await p.$('#zCreatures .mtg');
    await c.scrollIntoViewIfNeeded();
    await c.click({ button: 'right' });
    await p.waitForSelector('#ctxMenu button:has-text("The Ring tempts you")');
    await p.click('#ctxMenu button:has-text("The Ring tempts you")');
    await p.waitForTimeout(500);
  };
  await tempt();
  check('1st manual temptation: HUD count goes up by one', new RegExp('💍 ' + (n0 + 1) + '×').test(await p.textContent('#hRing')), await p.textContent('#hRing'));
  check('...the Ring panel appears with 1 ability unlocked', !(await p.$eval('#ringPanel', e => e.hidden)) && (await p.$$eval('#ringPanel li.on', x => x.length)) === Math.min(4, n0 + 1));
  check('...the Ring-bearer\'s card is marked', (await p.$$eval('.mtg.ringbearer', x => x.length)) === 1);
  check('...a banner announces it', (await p.$$('.ring-banner')).length >= 1);
  check('...and the game log records it', (await p.$$eval('#gameLog li', ls => ls.some(l => /The Ring tempts you/.test(l.textContent)))));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'ring-ui.png') });
  await tempt();
  check('2nd manual temptation: counter and unlocked abilities advance', new RegExp('💍 ' + (n0 + 2) + '×').test(await p.textContent('#hRing')) && (await p.$$eval('#ringPanel li.on', x => x.length)) === Math.min(4, n0 + 2));
  await p.click('#tUndo'); await p.waitForTimeout(400);
  check('Undo takes the 2nd temptation back', new RegExp('💍 ' + (n0 + 1) + '×').test(await p.textContent('#hRing')) && (await p.$$eval('#ringPanel li.on', x => x.length)) === Math.min(4, n0 + 1));

  // counters from the menu go through the new engine
  const c2 = await p.$('#zCreatures .mtg');
  await c2.click({ button: 'right' });
  await p.waitForSelector('#ctxMenu button:has-text("+1/+1 counter")');
  await p.click('#ctxMenu button:has-text("+1/+1 counter")');
  await p.waitForTimeout(400);
  check('"+1/+1 counter" from the menu shows a counter badge', (await p.$$eval('#zCreatures .ctr', x => x.length)) >= 1);
  console.log('errors:', errs);
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
