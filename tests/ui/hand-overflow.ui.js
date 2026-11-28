// A huge hand never covers your buttons. In a 1v1 game you play, with 40 cards in hand, on a PC, an iPad (both ways round) and an iPhone:
// every button in your controls can still be tapped (the button itself is what is under the finger), no hand card overlaps a button,
// and the hand stays inside the screen.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DEVS = [['PC', { viewport: { width: 1440, height: 900 } }], ['iPad landscape', { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1 }],
  ['iPad portrait', { ...devices['iPad (gen 7)'], deviceScaleFactor: 1 }], ['iPhone', { ...devices['iPhone 13'], deviceScaleFactor: 1 }]];
const shot = process.env.SHOTS;
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of DEVS) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
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
    await p.addInitScript(() => { try { const k = 'isf_sound'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.bg = false; localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} });          // the one-time music question is answered already
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForTimeout(800);
    const until = async (cond, arg, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(cond, arg)) return; await p.waitForTimeout(120); } throw new Error('timed out waiting for the game'); };
    await p.click('[data-tab=duel]');
    for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-duel .vs-you', 'human');
    await p.click('#tab-duel .vs-new');
    await until(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; });
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
    await until(() => { const g = window.__isfVersus.duel.game; return !!g.over || g.phase === 'main'; });
    await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[gm.human]; while (g.hand.length < 40 && g.library.length) g.hand.push(g.library.shift()); window.__isfVersus.redraw('duel'); });
    await p.$eval('#tab-duel .vs-screen', e => { const bar = document.querySelector('.topbar'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - bar.offsetHeight - 4); });
    await p.waitForTimeout(700);
    await p.evaluate(() => { const a = document.querySelector('#bgAsk'); if (a && a.offsetParent) { const no = [...a.querySelectorAll('button')].find(b => /no/i.test(b.textContent)) || a.querySelector('button'); if (no) no.click(); } });          // answer the one-time music question first, as a person would
    await p.waitForTimeout(300);
    if (shot) await p.screenshot({ path: path.join(shot, `hand40-${name.replace(/ /g, '-')}.png`) });
    const m = await p.evaluate(() => {
      const root = document.querySelector('#tab-duel'), hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      const hand = [...root.querySelectorAll('.vs-hand .mtg')].map(e => e.getBoundingClientRect()), btns = [...root.querySelectorAll('.vs-me button')].filter(e => e.offsetParent);
      const covered = btns.filter(e => { const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y); return !top || !(top === e || e.contains(top)); }).map(e => { const r = e.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); let q = top, path = []; while (q && path.length < 5) { path.push(q.tagName + (q.id ? '#' + q.id : '') + (q.className ? '.' + q.className.toString().split(' ')[0] : '')); q = q.parentElement; } return e.textContent.trim() + ' (under ' + path.join(' < ') + ')'; });
      const overlap = btns.filter(e => hand.some(r => hit(r, e.getBoundingClientRect()))).map(e => e.textContent.trim());
      const hb = root.querySelector('.vs-hand').getBoundingClientRect();
      return { n: hand.length, btns: btns.length, covered, overlap, handIn: hand.every(r => r.left >= hb.left - 1 && r.right <= hb.right + 1 && r.right <= innerWidth + 1), pageW: document.documentElement.scrollWidth, vw: innerWidth };
    });
    check(`${name}: 40 cards in hand, ${m.btns} buttons, every button can be tapped`, m.n === 40 && m.btns > 0 && !m.covered.length, m.covered.join(', ') || undefined);
    check(`${name}: no hand card lies over a button`, !m.overlap.length, m.overlap.join(', ') || undefined);
    check(`${name}: the hand stays inside its own area and the screen (no sideways scrolling)`, m.handIn && m.pageW <= m.vw + 1, `${m.pageW} / ${m.vw}`);
    check(`${name}: no page errors`, !errs.length, errs[0]);
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
