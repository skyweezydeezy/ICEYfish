// T-121: in Duel on a phone or an iPad, a person's loop (Basalt Monolith + Kinnan: "Untap Basalt Monolith") reaches the loop sheet, and its
// ∞ ("Infinite") button is on screen, at least 44 px tall, hit-testable at its centre (nothing sits over it), and a tap takes infinite mana.
// Sizes: iPhone 390x844, 375x667, 430x932, sideways 844x390, a Pixel 412x915 and sideways, iPads. Desktop is checked for the plain button.
// Needs playwright, a static server on :8800 (node tests/run.js --ui duel-loop-phone) and internet access to Scryfall.
const { chromium, devices } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const phone = (w, h, base) => ({ ...devices[base || 'iPhone 13'], viewport: { width: w, height: h }, screen: { width: w, height: h }, deviceScaleFactor: 1 });
const RUNS = [
  ['iPhone 390x844', phone(390, 844), true], ['iPhone 375x667', phone(375, 667), true], ['iPhone 430x932', phone(430, 932), true], ['iPhone sideways 844x390', phone(844, 390), true],
  ['Pixel 412x915', phone(412, 915, 'Pixel 7'), true], ['Pixel sideways 915x412', phone(915, 412, 'Pixel 7'), true],
  ['iPad upright', { ...devices['iPad (gen 7)'], deviceScaleFactor: 1 }, true], ['iPad sideways', { ...devices['iPad (gen 7) landscape'], deviceScaleFactor: 1 }, true],
  ['desktop mouse', { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 }, false],
];
const ONLY = process.env.LOOP_ONLY ? new RegExp(process.env.LOOP_ONLY) : null;

(async () => {
  const b = await chromium.launch();
  for (const [name, dev, touch] of RUNS) {
    if (ONLY && !ONLY.test(name)) continue;
    const tapIt = (p, sel) => touch ? p.tap(sel) : p.click(sel);
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } catch (e) {} });
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
    await p.fill('#deckText', ['30 Island', '4 Basalt Monolith', '4 Kinnan, Bonder Prodigy', '22 Brainstorm'].join('\n'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck && window.__isf.cards.some(c => c.name === 'Basalt Monolith'), null, { timeout: 90000 });
    await p.click('[data-tab=duel]');
    for (const sel of await p.$$('#tab-duel .vs-opp')) await sel.selectOption('');
    await p.selectOption('#tab-duel .vs-you', 'human'); await p.selectOption('#tab-duel .vs-ask', 'ask');
    await p.click('#tab-duel .vs-new');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 40000 });
    await p.evaluate(() => document.querySelector('#tab-duel .vs-keep').click());
    for (let k = 0; k < 120; k++) {          // the opponent may play first: answer whatever it asks with the autopilot until it is the person's main phase
      if (await p.evaluate(() => { const g = window.__isfVersus.duel.game; return !!g && g.phase === 'main' && !document.querySelector('.ch-sheet'); })) break;
      const auto = await p.$('.ch-sheet .ch-auto'); if (auto) await auto.click().catch(() => {});
      await p.waitForTimeout(500);
    }
    // the 🔁 Loop setting: the setup row's checkbox is hidden once the table fills the phone, so the table's bar carries a toggle too
    const lb = '#tab-duel .vs-bar .vs-loopbtn';
    check(`${name}: the 🔁 Loop toggle is on the table's bar`, await p.locator(lb).count() === 1);
    await p.locator(lb).evaluate(e => e.scrollIntoView({ block: 'nearest', inline: 'center' })).catch(() => {});
    const lr = await p.evaluate(sel => { const e = document.querySelector(sel), x = e.getBoundingClientRect(), h = document.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2); return { l: x.left, r: x.right, t: x.top, b: x.bottom, h: x.height, w: x.width, hit: !!h && (h === e || e.contains(h)), vw: innerWidth, vh: innerHeight }; }, lb);
    check(`${name}: Loop is fully on screen and nothing covers its centre`, lr.l >= 0 && lr.r <= lr.vw && lr.t >= 0 && lr.b <= lr.vh && lr.hit, JSON.stringify(lr));
    if (touch) check(`${name}: Loop is at least 44 px (high and wide)`, lr.h >= 43.5 && lr.w >= 43.5, Math.round(lr.w) + 'x' + Math.round(lr.h));
    const was = await p.$eval('#tab-duel .vs-loop', e => e.checked);
    await tapIt(p, lb); await p.waitForTimeout(300);
    const now = await p.$eval('#tab-duel .vs-loop', e => e.checked);
    check(`${name}: a tap toggles Loop and the button shows it`, now === !was && (await p.$eval(lb, e => e.classList.contains('on') && e.getAttribute('aria-pressed') === 'true')) === now, `${was} -> ${now}`);
    await tapIt(p, lb); await p.waitForTimeout(300);
    check(`${name}: a second tap switches it off again`, (await p.$eval('#tab-duel .vs-loop', e => e.checked)) === was);
    await p.evaluate(() => {
      const gm = window.__isfVersus.duel.game, g = gm.games[0], G = window.Goldfish, card = n => g.deck.unique.find(c => c.name === n);
      const put = n => { const x = G.enterWithTriggers(g, { iid: g.nextIid++, card: card(n) }, {}, []); x.sick = false; x.tapped = false; x.enteredTurn = 1; return x; };
      g.battlefield = []; g.infMana = null; g.loopMana = null; put('Basalt Monolith'); put('Kinnan, Bonder Prodigy'); window.__isfVersus.redraw('duel');
    });
    await p.waitForTimeout(700);
    const mon = '#tab-duel .vs-seat.me .mtg.vs-act';
    check(`${name}: the Monolith glows as usable`, await p.locator(mon).count() >= 1);
    // 1. the card, then its ability, then "Untap Basalt Monolith"
    await p.locator(mon).first().evaluate(e => e.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => {});
    touch ? await p.locator(mon).first().tap() : await p.locator(mon).first().click();
    await p.waitForTimeout(600);
    await p.waitForSelector('#lightbox.show .lb-act.primary', { timeout: 5000 }); await p.waitForTimeout(450); await (touch ? p.tap('#lightbox .lb-act.primary') : p.click('#lightbox .lb-act.primary'));          // T-134: the card opens in the viewer; its ability is the button
    await p.waitForSelector('.ch-sheet', { timeout: 10000 });
    await p.locator('.ch-sheet .ch-opt', { hasText: 'Untap Basalt Monolith' }).first().click(); await viewerPick(p);
    await tapIt(p, '.ch-sheet .ch-ok');
    // 2. the loop sheet, and its ∞ button
    await p.waitForSelector('.ch-sheet.combo .ch-mana-inf', { timeout: 15000 });
    const r = await p.evaluate(() => {
      const e = document.querySelector('.ch-sheet.combo .ch-mana-inf'), x = e.getBoundingClientRect(), h = document.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2);
      return { t: x.top, b: x.bottom, l: x.left, r: x.right, w: x.width, h: x.height, hit: !!h && (h === e || e.contains(h)), vw: innerWidth, vh: innerHeight, label: e.getAttribute('aria-label') };
    });
    check(`${name}: the ∞ button is fully on screen`, r.t >= 0 && r.b <= r.vh && r.l >= 0 && r.r <= r.vw, `${Math.round(r.t)}-${Math.round(r.b)} of ${r.vh}, ${Math.round(r.l)}-${Math.round(r.r)} of ${r.vw}`);
    check(`${name}: nothing covers its centre (hit test)`, r.hit);
    if (touch) check(`${name}: it is a real tap target (at least 44 px high)`, r.h >= 43.5, Math.round(r.h) + ' px');
    check(`${name}: it is named for assistive tech`, /Infinite mana/.test(r.label || ''), r.label);
    // 3. a tap runs the loop: the game holds infinite mana
    await tapIt(p, '.ch-sheet.combo .ch-mana-inf');
    await p.waitForSelector('.ch-sheet.combo', { state: 'detached', timeout: 15000 });
    await p.waitForTimeout(500);
    const s = await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; return { inf: !!g.loopMana && !!g.loopMana.inf, floating: g.floating.length, pool: (document.querySelector('#tab-duel .vs-seat.me') || {}).innerText || '' }; });
    check(`${name}: a tap takes infinite mana (the loop runs)`, s.inf || s.floating >= 25, JSON.stringify({ inf: s.inf, floating: s.floating }));
    check(`${name}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
