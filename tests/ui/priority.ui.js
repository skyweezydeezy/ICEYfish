// T-130 browser check: the priority sheet (T-127 stage 1 question kind 'priority') and the Settings → Display "Stop to respond".
// The engine plays a turn with a seated person (opts.priority on) in the page and asks through the real choices.js sheet.
// Covers: a pass at each step; a response with an instant from hand; Smart skips asks when nothing is castable; touch select-first with
// the 350 ms ghost-tap guard; the setting and its opts mapping; the sheet fitting phones (both orientations) and iPad.
// Needs playwright and a static server on :8800 (node tests/run.js --ui priority). No network: the cards come from the set data.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Lightning Bolt', 'Serra Angel', 'Mountain', 'Island', 'Murder', 'Sol Ring'];
const CARDS = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(find));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const mk = async (opts, display) => {
    const ctx = await b.newContext(Object.assign({ serviceWorkers: 'block' }, opts));
    await ctx.addInitScript(d => { try { if (!localStorage.getItem('isf_display')) localStorage.setItem('isf_display', JSON.stringify(Object.assign({ payChoose: false }, d))); const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } catch (e) {} }, display || {});
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), route => route.abort());
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.waitForFunction(() => window.__isfChoices && window.__isfApi && window.Goldfish && window.Decide, null, { timeout: 60000 });
    return p;
  };
  // A match in the page: a (autopilot) plays a turn; b is the seated person with Lightning Bolt (and Mountains when o.mana).
  const setup = async (p, o) => { const r = await setup0(p, o); p.stopPump = pump(p); return r; };
  const setup0 = (p, o) => p.evaluate(({ cards, o }) => {
    const G = window.Goldfish, D = window.Decide, C = window.__isfChoices;
    const deck = G.buildDeck(cards, []), by = n => deck.unique.find(c => c.name === n);
    const O = Object.assign({ turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40 }, o.opts);
    const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
    const a = bare(3), bb = bare(4); G.linkMatch(a, bb); D.seat(bb);
    const put = (g, n) => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 1; return q; };
    for (let i = 0; i < 4; i++) put(a, 'Island');
    put(a, 'Serra Angel');
    if (o.mana) for (let i = 0; i < 3; i++) put(bb, 'Mountain');
    bb.hand.push({ iid: bb.nextIid++, card: by('Lightning Bolt') });
    a.turn = 5; a.activeTurn = true; bb.activeTurn = false;
    window.__t = { a, b: bb, asked: [] };
    window.__run = D.resolve([a, bb], 1, gs => { G.combat(gs[0]); G.castPhase(gs[0]); }, q => { window.__t.asked.push({ kind: q.kind, step: q.step }); return C.ask(q); }).then(() => { window.__t.done = true; }, e => { window.__t.err = String(e && e.stack || e); });
    return true;
  }, { cards: CARDS, o });
  const sheet = p => p.waitForSelector('.ch-sheet.priority', { timeout: 15000 });
  // the old windows still ask for instants at the declare-attackers and end steps (stage 1 does not hook those): answer them "Not now"
  const dismissOld = p => p.evaluate(() => { const s = document.querySelector('.ch-sheet:not(.priority)'); const n = s && s.querySelector('.ch-none'); if (n) { n.click(); return true; } return false; });
  const pump = p => { const t = setInterval(() => dismissOld(p).catch(() => {}), 150); return () => clearInterval(t); };
  const mark = p => p.evaluate(() => { window.__old = document.querySelector('.ch-sheet.priority'); });
  const gone = p => p.waitForFunction(() => document.querySelector('.ch-sheet.priority') !== window.__old, null, { timeout: 15000 });          // this sheet closed (the next question may already be there)
  const stepsAsked = p => p.evaluate(() => window.__t.asked.filter(x => x.kind === 'priority').map(x => x.step));
  const finished = p => p.waitForFunction(() => window.__t.done || window.__t.err, null, { timeout: 30000 });
  const next = p => Promise.race([sheet(p).then(() => 'sheet'), finished(p).then(() => 'done')]).catch(() => 'timeout');
  const passAll = async (p, tap) => { for (let k = 0; k < 16; k++) { if (await next(p) !== 'sheet') break; await sleep(400); await mark(p); await (tap ? p.tap('.pr-pass') : p.click('.pr-pass')); await gone(p); } await finished(p); };
  const big = { viewport: { width: 1360, height: 1000 } };

  // ---- the setting: Settings → Display → Stop to respond, mapped to opts.autoPass, remembered in isf_display
  {
    const p = await mk(big);
    const sel = await p.$('#dispStop');
    check('Display has "Stop to respond": Smart, At every step, Never; Smart by default', !!sel && (await p.$$eval('#dispStop option', os => os.map(o => o.textContent).join('|'))) === 'Smart|At every step|Never' && (await p.$eval('#dispStop', e => e.value)) === 'smart');
    check('Smart (default) adds nothing to the game options; opts.priority is not set in the options (it is on by default in the engine)', await p.evaluate(() => { const o = window.__isfApi.opts(); return o.autoPass === undefined && o.priority === undefined; }));
    await p.click('#displaySettings > summary');
    await p.selectOption('#dispStop', 'never');
    check('"At every step" is opts.autoPass "never" (asks at every step)', await p.evaluate(() => window.__isfApi.opts().autoPass) === 'never');
    await p.selectOption('#dispStop', 'always');
    check('"Never" is opts.autoPass "always" (never asks)', await p.evaluate(() => window.__isfApi.opts().autoPass) === 'always');
    check('the choice is kept in isf_display', await p.evaluate(() => JSON.parse(localStorage.getItem('isf_display')).stop) === 'always');
    await p.reload(); await p.waitForFunction(() => window.__isfApi, null, { timeout: 60000 });
    check('...and is still chosen after a reload', await p.$eval('#dispStop', e => e.value) === 'always' && await p.evaluate(() => window.__isfApi.opts().autoPass) === 'always');
    check('no page errors (setting)', p.errs.length === 0, p.errs.join(' | '));
    await (p.stopPump && p.stopPump(), p.context().close());
    const q = await mk(big, { stop: 'never' });
    check('opts.priority is on by default (no toggle: T-127 stage 6), and the saved setting is read', await q.evaluate(() => { const o = window.__isfApi.opts(); return o.priority !== false && o.autoPass === 'never'; }));
    (q.stopPump && q.stopPump(), await q.context().close());
  }

  // ---- a pass at each step (autoPass 'never' asks at every hooked step)
  {
    const p = await mk(big);
    await setup(p, { opts: { priority: true, autoPass: 'never' }, mana: true });
    let n = 0;
    for (let k = 0; k < 16; k++) {
      if (await next(p) !== 'sheet') break;
      n++;
      if (k === 0) {
        const info = await p.evaluate(() => ({ title: document.querySelector('.ch-sheet.priority .ch-title').textContent, ctx: document.querySelector('.pr-ctx').textContent, passH: document.querySelector('.pr-pass').getBoundingClientRect().height, opts: [...document.querySelectorAll('.pr-opt')].map(e => e.textContent) }));
        check('the sheet names the step and gives one line of context', /\w/.test(info.title) && /turn/.test(info.ctx) && /nothing is on the stack/.test(info.ctx), info.title + ' / ' + info.ctx);
        check('the instant is offered as an option and Pass is big', info.opts.some(t => /Lightning Bolt/.test(t)) && info.passH >= 44, info.opts.join(',') + ' h' + info.passH);
        check('the explanation is folded behind ⓘ', await p.$eval('.ch-info', e => e.hidden));
        await p.click('.ch-i'); check('ⓘ opens it', !(await p.$eval('.ch-info', e => e.hidden))); await p.click('.ch-i');
      }
      await sleep(400); await mark(p); await p.click('.pr-pass'); await gone(p);
    }
    await finished(p);
    const steps = await stepsAsked(p);
    check('a Pass at each step: several steps asked, each passed, the game plays on', n >= 4 && new Set(steps).size >= 4 && await p.evaluate(() => !!window.__t.done && !window.__t.err), steps.join(','));
    check('...nothing was cast by passing: Lightning Bolt is still in hand', await p.evaluate(() => window.__t.b.hand.some(i => i.card.name === 'Lightning Bolt') && window.__t.b.graveyard.length === 0));
    check('no page errors (passes)', p.errs.length === 0, p.errs.join(' | '));
    await (p.stopPump && p.stopPump(), p.context().close());
  }

  // ---- a response with an instant from hand (mouse: one click plays it); the loop then gives you priority again (CR 117.3c)
  {
    const p = await mk(big);
    await setup(p, { opts: { priority: true, autoPass: 'never' }, mana: true });
    await sheet(p); await sleep(400);
    await p.click('.pr-opt >> text=Lightning Bolt');          // T-134: the chip opens the card in the viewer; Cast is its button
    await p.waitForSelector('#lightbox.show .lb-act', { timeout: 5000 }); await sleep(450); await p.click('#lightbox .lb-act:has-text("Cast Lightning Bolt")');
    await p.waitForFunction(() => !window.__t.b.hand.some(i => i.card.name === 'Lightning Bolt'), null, { timeout: 20000 });
    check('clicking the instant opens it in the viewer, and its Cast button casts it (Lightning Bolt left the hand)', true);
    const before = (await stepsAsked(p)).length;
    await passAll(p, false);
    check('the game finished without errors', await p.evaluate(() => !!window.__t.done && !window.__t.err), await p.evaluate(() => window.__t.err));
    check('Lightning Bolt was cast once, not repeated', await p.evaluate(() => window.__t.b.graveyard.filter(i => i.card.name === 'Lightning Bolt').length) === 1);
    check('no page errors (response)', p.errs.length === 0 && before >= 1, p.errs.join(' | '));
    await (p.stopPump && p.stopPump(), p.context().close());
  }

  // ---- Smart: nothing castable (no mana) means no sheet at all; with the mana it asks; "Never" does not ask
  {
    const p = await mk(big);
    await setup(p, { opts: { priority: true }, mana: false });
    await finished(p);
    check('Smart: a person with nothing they can cast is never asked', (await stepsAsked(p)).length === 0 && await p.evaluate(() => !document.querySelector('.ch-sheet')));
    await (p.stopPump && p.stopPump(), p.context().close());
    const q = await mk(big);
    await setup(q, { opts: { priority: true }, mana: true });
    await sheet(q);
    check('Smart: with Lightning Bolt and open mana the sheet appears', (await stepsAsked(q)).length >= 1);
    await passAll(q, false);
    (q.stopPump && q.stopPump(), await q.context().close());
    const r = await mk(big);
    await setup(r, { opts: { priority: true, autoPass: 'always' }, mana: true }); await finished(r);
    check('Never ("always"): not asked even with a castable instant', (await stepsAsked(r)).length === 0);
    (r.stopPump && r.stopPump(), await r.context().close());
  }

  // ---- touch: a tap selects, "Cast" confirms; the ghost-tap guard ignores a tap in the first 350 ms
  {
    const p = await mk({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await setup(p, { opts: { priority: true, autoPass: 'never' }, mana: true });
    await sheet(p);
    await p.tap('.pr-pass');          // right away: the ghost tap of whatever opened the sheet
    await sleep(150);
    check('a tap on Pass in the first 350 ms is ignored', !!(await p.$('.ch-sheet.priority')));
    await sleep(400);
    await p.tap('.pr-opt >> text=Lightning Bolt'); await p.waitForSelector('#lightbox.show .lb-act', { timeout: 5000 });
    check('touch: a tap on the instant only opens it in the viewer (nothing is cast), with Cast as its button', await p.evaluate(() => window.__t.b.hand.some(i => i.card.name === 'Lightning Bolt')) && await p.$$eval('#lightbox .lb-act', xs => xs.length === 1 && /Cast Lightning Bolt/.test(xs[0].textContent)));
    await p.evaluate(() => document.querySelector('#lightbox .lb-act').click());          // within 350 ms of opening: ignored
    await sleep(100);
    check('...and a press on Cast right after it opens is ignored too', await p.evaluate(() => window.__t.b.hand.some(i => i.card.name === 'Lightning Bolt')));
    await sleep(400); await p.tap('#lightbox .lb-act');
    await p.waitForFunction(() => !window.__t.b.hand.some(i => i.card.name === 'Lightning Bolt'), null, { timeout: 20000 });
    check('Cast then plays it', true);
    await passAll(p, true);
    check('no page errors (touch)', p.errs.length === 0, p.errs.join(' | '));
    await (p.stopPump && p.stopPump(), p.context().close());
  }

  // ---- fit: phones (portrait and landscape) and iPad, with a long stack line and many options
  {
    const q = { kind: 'priority', what: null, seat: 1, multi: false, min: 0, max: 1, optional: true, none: 'Pass', source: null, def: [], step: 'blockers', stepName: 'Blockers declared', turnOf: 'A Very Long Opponent Name Indeed',
      title: 'x', text: 'You have priority. Cast an instant or a card with flash, or use an ability, or pass.',
      stack: [{ name: 'Lightning Bolt', who: 'A Very Long Opponent Name Indeed', kind: 'spell', text: 'targeting your Serra Angel with a rather long description of what happens next', card: null }, { name: 'Ability', who: 'You', kind: 'ability', text: '', card: null }],
      options: ['Lightning Bolt', 'Counterspell with a very long card name here', 'Murder', 'Swords to Plowshares', 'Brazen Borrower // Petty Theft', 'Sol Ring: add {C}{C}', 'Fierce Guardianship', 'Force of Will'].map((name, k) => ({ k, name, card: null, iid: k, note: k === 5 ? 'in response: activate ({T})' : '', owner: null, def: false, ability: k === 5 })) };
    q.sig = 'priority/test';
    for (const [name, vp] of [['phone 320', { width: 320, height: 568 }], ['phone 430', { width: 430, height: 932 }], ['phone landscape 568x320', { width: 568, height: 320 }], ['phone landscape 932x430', { width: 932, height: 430 }], ['iPad portrait', { width: 820, height: 1180 }], ['iPad landscape', { width: 1180, height: 820 }]]) {
      const p = await mk({ viewport: vp, hasTouch: true, isMobile: true });
      await p.evaluate(q => { window.__isfChoices.ask(q).catch(() => {}); }, q);
      await sheet(p);
      await sleep(400); await p.tap('.pr-opt >> nth=1');          // a selection adds the Cast button: the sheet must still fit
      const m = await p.evaluate(() => { const s = document.querySelector('.ch-sheet.priority'), r = s.getBoundingClientRect(), pass = document.querySelector('.pr-pass').getBoundingClientRect(), go = document.querySelector('.pr-go').getBoundingClientRect(), W = document.documentElement.clientWidth, H = window.innerHeight;
        return { l: r.left, r: r.right, t: r.top, bt: r.bottom, W, H, passH: pass.height, passIn: pass.top >= r.top - 1 && pass.bottom <= r.bottom + 1 && pass.right <= r.right + 1, goIn: go.width > 0 && go.right <= r.right + 1, hscroll: document.documentElement.scrollWidth > W + 1, sheetScroll: s.scrollWidth > s.clientWidth + 1 }; });
      check(`${name}: the sheet is inside the screen`, m.l >= -0.5 && m.r <= m.W + 0.5 && m.t >= -0.5 && m.bt <= m.H + 0.5, JSON.stringify(m));
      check(`${name}: Pass and Cast are on the sheet, Pass at least 44 px tall; nothing scrolls sideways`, m.passIn && m.goIn && m.passH >= 44 && !m.hscroll && !m.sheetScroll, `h${m.passH}`);
      await (p.stopPump && p.stopPump(), p.context().close());
    }
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
