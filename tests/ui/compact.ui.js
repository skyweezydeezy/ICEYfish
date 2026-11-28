// T-069 compact layout. Report boxes fold to their header; while a table is open (Practice, a Duel or Pod game) the top bar and tabs get out of
// the way and the table covers the whole screen, with a ☰ button that brings the bar back. Checked at the sizes the user named, upright and
// sideways (iPhones 6.1"-6.9", iPad mini, 11", 13", 1920x1080) and on a dual-screen device in single-screen and spanned modes, where nothing may sit
// under the hinge. Scripted browsers keep the bar and open boxes unless localStorage isf_focus / isf_fold say "on", which this file does.
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const PHONES = [[390, 844], [393, 852], [402, 874], [430, 932], [440, 956]];
const TABLETS = [[744, 1133], [820, 1180], [834, 1194], [1024, 1366], [1032, 1376]];
const both = l => l.flatMap(([w, h]) => [[w, h, ''], [h, w, ' sideways']]);
const SIZES = both(PHONES.concat(TABLETS)).map(([w, h, s]) => [`${w}x${h}${s}`, w, h]);
const FAST = process.env.COMPACT_FAST;                                    // COMPACT_FAST=1: a few sizes only
const ONLY = process.env.COMPACT_ONLY ? new RegExp(process.env.COMPACT_ONLY) : null;               // COMPACT_ONLY=duo: only the sizes whose names match
const pick = l => ONLY ? l.filter(([n]) => ONLY.test(n)) : FAST ? l.filter(([n]) => /^(390x844|844x390|744x1133|1366x1024|440x956)$/.test(n)) : l;
// the dual-screen device (Surface Duo): two 540x720 screens with a 34px hinge; spanned side by side, or stacked when turned
const DUO = [['duo single', 540, 720, null], ['duo single sideways', 720, 540, null], ['duo spanned', 1114, 720, { orientation: 'vertical', offset: 540, maskLength: 34 }], ['duo spanned stacked', 720, 1114, { orientation: 'horizontal', offset: 540, maskLength: 34 }]];

async function setup(b, dev) {
  const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_dice', '0'); } catch (e) {} });          // the 3D dice are not under test here, and they can starve the page of frames for seconds
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} localStorage.setItem('isf_focus', 'on'); localStorage.setItem('isf_fold', 'on'); });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  return { ctx, p };
}
async function loadDeck(p, feature, vp) {
  if (feature) { const c = await p.context().newCDPSession(p); await c.send('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 1, mobile: true, displayFeature: feature }); p.cdp = c; }
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
}
const show = (p, t) => p.evaluate(t => window.__isfShowTab(t), t);
async function startGames(p) {
  await show(p, 'table'); await p.check('#tFast'); await p.fill('#tAutoToN', '4'); await p.click('#tAutoTo', { position: { x: 12, y: 12 } }); await p.waitForTimeout(9000);
  for (const mode of ['duel', 'pod']) {
    await show(p, mode);
    for (const sel of await p.$$(`#tab-${mode} .vs-opp`)) await sel.selectOption('');
    await p.selectOption(`#tab-${mode} .vs-ask`, 'auto'); await p.click(`#tab-${mode} .vs-new`);
    await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return g && (g.phase === 'mull' || g.phase === 'main'); }, mode, { timeout: 60000 });
    await p.evaluate(m => { const k = document.querySelector(`#tab-${m} .vs-keep`); if (k) k.click(); }, mode); await p.waitForTimeout(1200);
    try { for (let k = 0; k < 2; k++) {
      await p.waitForFunction(m => { const g = window.__isfVersus[m].game; return !!g.over || g.phase === 'main' || g.phase === 'block'; }, mode, { timeout: 20000 });
      if (await p.evaluate(m => window.__isfVersus[m].game.phase === 'block', mode)) { await p.evaluate(m => document.querySelector(`#tab-${m} .vs-block-go`).click(), mode); k--; continue; }
      await p.evaluate(m => { const b = document.querySelector(`#tab-${m} .vs-autoturn`); if (b) b.click(); }, mode); await p.waitForTimeout(700); } } catch (e) { /* the board is whatever it is */ }
  }
}
// the elements that must stay off the hinge: cards, piles, buttons, life, names, the stats strip
const HINGE = () => {
  const segs = [...window.viewport.segments]; if (segs.length < 2) return null;
  const a = segs[0], c = segs[1], vert = c.left > a.left;                     // vertical fold: side by side
  const lo = vert ? a.right : a.bottom, hi = vert ? c.left : c.top;
  const sel = '.mtg, .card-back, button, .vs-life, .vs-who, .hud-item, .pile-label, .vs-plate, .vs-steps, .speed-bar';
  const bad = [];
  document.querySelectorAll(sel.split(', ').map(s => 'main ' + s).join(', ')).forEach(e => {
    if (e.hidden || e.closest('[hidden], .panel:not(.active), .table-log, .vs-game:not(.log-open) > .card-box')) return;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const [x0, x1] = vert ? [r.left, r.right] : [r.top, r.bottom];
    if (x1 > lo + 1 && x0 < hi - 1) { const row = e.closest('.vs-row, .vs-piles, .vs-field'), seat = e.closest('.vs-seat'), rr = row && row.getBoundingClientRect(), sr = seat && seat.getBoundingClientRect(); bad.push(e.tagName + '.' + String(e.className) + ' ' + Math.round(x0) + '-' + Math.round(x1) + ' in ' + e.parentElement.className + (rr ? ' row ' + row.className + ' ' + Math.round(rr.left) + '-' + Math.round(rr.right) : '') + (sr ? ' seat ' + seat.className + ' ' + Math.round(sr.left) + '-' + Math.round(sr.right) : '') + ' idx ' + [...e.parentElement.children].indexOf(e) + '/' + e.parentElement.children.length); }
  });
  return { n: bad.length, ex: bad.slice(0, 2).join(' | '), lo: Math.round(lo), hi: Math.round(hi) };
};

// wait until the layout has stopped moving: every card, the table and the hand have the same rect over two animation frames, twice in a row, whatever the load
const settle = async p => { for (let k = 0; k < 2; k++) {
  await p.waitForFunction(() => new Promise(res => { const snap = () => [...document.querySelectorAll('.vs-screen, .table-main, .bf-row, .mtg, .card-back, .vs-hand, #zHand')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round).join(','); }).join('|');
    const a = snap(); requestAnimationFrame(() => requestAnimationFrame(() => res(snap() === a))); }), null, { timeout: 20000, polling: 'raf' });
  await p.waitForTimeout(150); } };
async function checkSize(p, name, w, h, spanned) {
  if (!spanned) await p.setViewportSize({ width: w, height: h }).catch(() => {});
  if (spanned) await p.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true, displayFeature: p.feature });
  await p.waitForTimeout(500);
  await show(p, 'table'); await p.waitForTimeout(700); await settle(p);
  const m = await p.evaluate(() => {
    const hand = [...document.querySelectorAll('#zHand .mtg')].map(e => e.getBoundingClientRect());
    return { focus: document.body.classList.contains('tfocus'), bar: Math.round(document.querySelector('.topbar').getBoundingClientRect().height), ovf: getComputedStyle(document.body).overflowY, page: document.documentElement.scrollHeight, vh: innerHeight, pw: document.documentElement.scrollWidth, vw: innerWidth,
      first: Math.round(Math.min(document.querySelector('.table-controls').getBoundingClientRect().top, document.querySelector('.speed-bar').getBoundingClientRect().top)),
      mainBottom: Math.round(document.querySelector('.table-main').getBoundingClientRect().bottom), n: hand.length, handIn: hand.filter(r => r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.top + 24 <= innerHeight).length,
      rows: [...document.querySelectorAll('.bf-row')].map(e => Math.round(e.getBoundingClientRect().height)) };
  });
  check(`${name}: Practice hides the bar and covers the screen`, m.focus && m.bar === 0 && m.ovf === 'hidden' && m.page <= m.vh + 12 && m.pw <= m.vw + 1 && m.first <= 12 && m.mainBottom <= m.vh + 1, JSON.stringify({ ...m, rows: undefined }));
  check(`${name}: Practice rows have room and every hand card shows its name`, m.rows.every(r => r >= 48) && m.handIn === m.n, `rows ${m.rows} hand ${m.handIn}/${m.n}`);
  if (spanned) { const hg = await p.evaluate(HINGE); check(`${name}: Practice keeps everything off the hinge`, hg && hg.n === 0, hg && `${hg.lo}-${hg.hi}: ${hg.n} ${hg.ex}`); }
  for (const mode of ['duel', 'pod']) {
    await show(p, mode); await p.waitForTimeout(700); await settle(p);
    const d = await p.evaluate(md => {
      const root = document.querySelector('#tab-' + md), scr = root.querySelector('.vs-screen').getBoundingClientRect();
      const hand = [...root.querySelectorAll('.vs-hand .mtg')].map(e => e.getBoundingClientRect()), btn = [...root.querySelectorAll('.vs-me button')].map(e => e.getBoundingClientRect());
      const cards = [...root.querySelectorAll('.vs-stack .mtg, .vs-pile .mtg, .vs-pile .card-back')].map(e => e.getBoundingClientRect());
      return { focus: document.body.classList.contains('tfocus'), bar: Math.round(document.querySelector('.topbar').getBoundingClientRect().height), ovf: getComputedStyle(document.body).overflowY, vh: innerHeight, vw: innerWidth, pw: document.documentElement.scrollWidth,
        top: Math.round(scr.top), bottom: Math.round(scr.bottom), over: !!window.__isfVersus[md].game.over,
        handIn: hand.filter(r => r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.top + 24 <= innerHeight).length, nHand: hand.length, btnIn: btn.every(r => r.width < 2 || (r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.top >= -1)),
        badCard: (() => { const r = [...root.querySelectorAll('.vs-stack .mtg, .vs-pile .mtg, .vs-pile .card-back')].find(e => { const q = e.getBoundingClientRect(); return !(q.width < 2 || (q.left >= -1 && q.right <= innerWidth + 1 && q.top >= -1 && q.bottom <= innerHeight + 1)); }); if (!r) return ''; const q = r.getBoundingClientRect(); const pr = r.parentElement, row = r.closest('.vs-row, .vs-piles, .vs-field'), sr = r.closest('.vs-seat').getBoundingClientRect(); return r.closest('.vs-seat').className + ' card ' + [q.left, q.top, q.right, q.bottom].map(Math.round) + ' parent ' + pr.className + ' ' + Math.round(pr.getBoundingClientRect().right) + ' row ' + (row && row.className) + ' ' + (row && Math.round(row.getBoundingClientRect().right)) + ' seat right ' + Math.round(sr.right) + ' idx ' + [...pr.children].indexOf(r) + '/' + pr.children.length + ' vp ' + innerWidth + 'x' + innerHeight; })(),
        badBtn: (() => { const r = [...root.querySelectorAll('.vs-me button')].find(e => { const q = e.getBoundingClientRect(); return !(q.width < 2 || (q.bottom <= innerHeight + 1 && q.right <= innerWidth + 1 && q.top >= -1)); }); if (!r) return ''; const q = r.getBoundingClientRect(); return r.textContent.trim().slice(0, 20) + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round) + ' vp ' + innerWidth + 'x' + innerHeight; })(),
        cardsIn: cards.every(r => r.width < 2 || (r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1)), cw: cards[0] ? Math.round(cards[0].width) : 0 };
    }, mode);
    check(`${name}: ${mode} hides the bar; the table covers the screen`, d.focus && d.bar === 0 && d.ovf === 'hidden' && d.pw <= d.vw + 1 && d.top >= 0 && d.top <= 10 && d.bottom >= d.vh - 14 && d.bottom <= d.vh + 1, JSON.stringify({ top: d.top, bottom: d.bottom, vh: d.vh, pw: d.pw, vw: d.vw }));
    if (!d.over) check(`${name}: ${mode}: every card in play, your hand and your buttons are on screen`, d.cardsIn && d.btnIn && d.handIn === d.nHand, `cards ${d.cardsIn}, buttons ${d.btnIn}, hand ${d.handIn}/${d.nHand}, card ${d.cw}px ${d.badCard} ${d.badBtn}`);
    if (spanned) { const hg = await p.evaluate(HINGE); check(`${name}: ${mode} keeps everything off the hinge`, hg && hg.n === 0, hg && `${hg.lo}-${hg.hi}: ${hg.n} ${hg.ex}`); }
  }
}

(async () => {
  const b = await chromium.launch();
  const phone = devices['iPhone 13'];
  // 1. the menu, the folds and the Settings button, once, on an iPhone
  if (!ONLY) { const { ctx, p } = await setup(b, { ...phone, viewport: { width: 390, height: 844 } });
    await loadDeck(p);
    const sh = () => p.evaluate(() => { const bx = [...document.querySelectorAll('#tab-deck .card-box[data-fold]')].find(x => /^Curve wall/.test(x.textContent.trim())); return bx ? { closed: bx.classList.contains('box-closed'), bodyShown: [...bx.children].filter(c => !c.matches('.box-head')).some(c => c.getBoundingClientRect().height > 0) } : null; });
    const f0 = await sh();
    check('Curve wall starts folded to its header', f0 && f0.closed && !f0.bodyShown, JSON.stringify(f0));
    await p.evaluate(() => [...document.querySelectorAll('#tab-deck .card-box[data-fold] h2')].find(h => /^Curve wall/.test(h.textContent)).click());
    const f1 = await sh();
    check('a click on the header opens it', f1 && !f1.closed && f1.bodyShown, JSON.stringify(f1));
    await show(p, 'table'); await p.waitForTimeout(600);
    await p.click('.table-controls .focus-menu'); await p.waitForTimeout(300);
    const open = await p.evaluate(() => { const t = document.querySelector('.topbar').getBoundingClientRect(); return { h: Math.round(t.height), top: Math.round(t.top), tab: !!document.querySelector('.tab[data-tab=duel]').offsetParent }; });
    check('☰ brings the tabs back over the table', open.h > 20 && open.top >= 0 && open.tab, JSON.stringify(open));
    await p.click('.tab[data-tab=duel]'); await p.waitForTimeout(500);
    check('picking a tab leaves the table and shows the tab\'s page', await p.evaluate(() => document.body.dataset.view === 'duel' && !document.body.classList.contains('tfocus') && !!document.querySelector('#tab-duel .vs-new').offsetParent));
    for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-duel .vs-ask', 'auto'); await p.click('#tab-duel .vs-new');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000 }); await p.waitForTimeout(700);
    await p.click('#tab-duel .vs-logtog'); await p.waitForTimeout(400);
    check('the 📜 button opens the game log as a drawer over the table', await p.evaluate(() => { const c = document.querySelector('#tab-duel .vs-game > .card-box').getBoundingClientRect(); return c.bottom <= innerHeight + 1 && c.top < innerHeight - 40; }));
    await p.click('#tab-duel .vs-logtog'); await p.waitForTimeout(300);
    await p.click('#tab-duel .focus-menu'); await p.waitForTimeout(300); await p.click('.topbar .focus-leave'); await p.waitForTimeout(400);
    check('Settings leaves the table and brings the Duel settings back', await p.evaluate(() => !document.body.classList.contains('tfocus') && !!document.querySelector('#tab-duel .vs-new').offsetParent && !!document.querySelector('.topbar').offsetParent));
    check('no page errors (menu and folds)', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
    await ctx.close(); }
  // 2. the named sizes on a touch device, upright and sideways
  if (pick(SIZES).length) { const { ctx, p } = await setup(b, { ...phone, viewport: { width: 390, height: 844 } });
    await loadDeck(p); await startGames(p);
    for (const [name, w, h] of pick(SIZES)) await checkSize(p, name, w, h, false);
    check('no page errors (touch sizes)', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
    await ctx.close(); }
  // 3. the default PC
  if (!ONLY || ONLY.test('1920x1080')) { const { ctx, p } = await setup(b, { viewport: { width: 1920, height: 1080 } });
    await loadDeck(p); await startGames(p);
    await checkSize(p, '1920x1080 desktop', 1920, 1080, false);
    check('no page errors (desktop)', p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
    await ctx.close(); }
  // 4. the dual-screen device
  for (const [name, w, h, feature] of DUO) {
    if (ONLY && !ONLY.test(name)) continue;
    const { ctx, p } = await setup(b, { ...phone, viewport: { width: w, height: h } });
    p.feature = feature;
    await loadDeck(p, feature, [w, h]);
    const segs = await p.evaluate(() => [...window.viewport.segments].length);
    check(`${name}: the browser reports ${feature ? 2 : 1} screen(s)`, segs === (feature ? 2 : 1), segs);
    await startGames(p);
    await checkSize(p, name, w, h, !!feature);
    check(`${name}: no page errors`, p.errs.length === 0, p.errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
