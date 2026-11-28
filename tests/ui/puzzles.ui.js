// T-115: the Puzzle tab (puzzle.js, puzzles.json). The tab is in the bar; the picker lists the 12 hand-built puzzles by type and difficulty; one puzzle is played
// through the page and won (the intended line), one is lost with hints after it (never the answer) and the lesson behind an ⓘ; a fast win plays across turns;
// progress and the streak are kept; the page fits an iPhone and an iPad. Needs playwright and a static server on :8800 (node tests/run.js --ui puzzles).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const CACHE = path.join(os.tmpdir(), 'isf-scryfall-cache');                     // answers kept between runs: a rerun does not hit Scryfall's rate limit
try { fs.mkdirSync(CACHE, { recursive: true }); } catch (e) { /* read-only */ }
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const KEY = 'isf_puzzle2';
(async () => {
  const b = await chromium.launch();
  const mk = async (w, h, mobile) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block', hasTouch: !!mobile, isMobile: !!mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_tutorial', '{"seen":{"deck":1,"hands":1,"table":1,"duel":1,"pod":1,"sim":1,"odds":1,"compare":1,"tune":1},"welcome":1}'); } } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
      const f = path.join(CACHE, crypto.createHash('sha1').update(q.method() + q.url() + (q.postData() || '')).digest('hex'));
      try { if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: { ...c, 'content-type': 'application/json' }, body: fs.readFileSync(f) }); } catch (e) { /* no cache */ }
      try {
        const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
        const body = Buffer.from(await res.arrayBuffer());
        if (res.status === 200) { try { fs.writeFileSync(f, body); } catch (e) { /* read-only */ } }
        route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/'); await p.waitForFunction(() => window.ISFPuzzle && window.__isfApi && window.__isfChoices, null, { timeout: 90000 });
    return { ctx, p, errs };
  };

  const data = await (await fetch('http://127.0.0.1:8800/puzzles.json')).json();
  const { ctx, p, errs } = await mk(1180, 860);
  check('the Puzzle tab is in the bar and not hidden', await p.evaluate(() => { const t = document.querySelector('[data-tab=puzzle]'); return !!t && !t.hidden && t.getBoundingClientRect().width > 0; }));
  await p.click('[data-tab=puzzle]'); await p.waitForSelector('.pz-pick', { timeout: 20000 });
  check('the Puzzle tab is the active panel', await p.evaluate(() => document.body.dataset.view === 'puzzle' && document.getElementById('tab-puzzle').classList.contains('active')));
  check('the picker lists the 12 puzzles, two types of three levels, two each', await p.$$eval('.pz-pick', xs => xs.length) === 12 && await p.$$eval('.pz-type', xs => xs.map(x => x.dataset.type).join()) === 'fast,endgame' && await p.$$eval('.pz-type[data-type=fast] .pz-level[data-level=hard] .pz-pick', xs => xs.length) === 2);
  check('the score shows solved, streak, best streak, no-hint solves and hints used', /0 of 12 solved/.test(await p.$eval('.pz-score', e => e.textContent)) && /Streak/.test(await p.$eval('.pz-score', e => e.textContent)) && /Hints used/.test(await p.$eval('.pz-score', e => e.textContent)));
  const settle = async () => {                                     // answer any question the engine asks the person, then wait until the table is idle again
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(250);
      if (await p.$('.ch-sheet')) { const ok = await p.$('.ch-sheet .ch-ok:not([disabled])'); const auto = await p.$('.ch-sheet .ch-auto'); if (auto) await auto.click(); else if (ok) await ok.click(); else await p.evaluate(() => { const c = document.querySelector('.ch-sheet .ch-opt, .ch-sheet button'); if (c) c.click(); }); continue; }
      const busy = await p.evaluate(() => { const s = window.ISFPuzzle.state(); return !s || s.busy || s.phase === 'setup'; });
      if (!busy) return;
    }
  };
  const open = async id => { await p.click('.pz-pick[data-id="' + id + '"]'); await p.waitForSelector('.pz-card', { timeout: 60000 }); await settle(); };
  // T-134: a tap on a card opens it in the viewer and what it can do is a button there (the 350 ms ghost-tap guard holds for a moment)
  const tap = async (sel, label) => { await p.click(sel); await p.waitForSelector('#lightbox.show .lb-act'); await p.waitForTimeout(400); await p.locator('#lightbox .lb-act', { hasText: label }).first().click(); };
  const cast = async name => { await tap('.pz-card[data-name="' + name + '"]', /^(Cast|Play) /); await settle(); };
  const attackAll = async () => { await p.click('.pz-atk'); await p.click('.pz-all'); await settle(); };

  // ---- Rocks before the dragon, paid for by hand: the person taps through the imprint choice and the payment sheet (T-119)
  await open('fast-1');
  // T-134: a tap opens the card; a card with one action still opens, with that one button; the tap that opened it cannot press it; a card with nothing to do is for reading
  await p.click('.pz-card[data-name="Mountain"]'); await p.waitForSelector('#lightbox.show .lb-act');
  check('a tap on a card in hand opens it in the viewer with its one action as a button (and nothing was played)', await p.$$eval('#lightbox .lb-act', xs => xs.length === 1 && /^Play Mountain/.test(xs[0].textContent)) && await p.$$eval('.pz-card', xs => xs.length) === 7);
  check('the viewer from a puzzle keeps the buy links, the printings and the rules lines beside the action', await p.$$eval('#lightbox .lb-shop a', xs => xs.length >= 3 && xs.some(a => /tcgplayer/.test(a.href)) && xs.some(a => /cardkingdom/.test(a.href)) && xs.some(a => /manapool/.test(a.href))) && await p.$('#lightbox .lb-prints') !== null);
  await p.evaluate(() => { document.querySelector('#lightbox .lb-x').click(); document.querySelector('.pz-card[data-name="Mountain"]').click(); document.querySelector('#lightbox .lb-act').click(); }); await p.waitForTimeout(100);
  check('the ghost-tap guard: a press within 350 ms of opening does nothing', await p.$eval('#lightbox', e => e.classList.contains('show')) && await p.$$eval('.pz-card', xs => xs.length) === 7);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  check('Esc closes the viewer', await p.$eval('#lightbox', e => !e.classList.contains('show')));
  await p.click('.pz-card[data-name="Goldspan Dragon"]'); await p.waitForSelector('#lightbox.show .lb-act');
  check('a card you cannot cast yet shows its button greyed with the reason', await p.$eval('#lightbox .lb-act', b => b.disabled && /Not enough mana/.test(b.textContent)));
  await p.keyboard.press('Escape');
  await cast('Mountain'); await cast('Sol Ring'); await p.click('.pz-pass'); await settle();
  await cast('Mountain');
  await tap('.pz-card[data-name="Chrome Mox"]', /^Cast /); await p.waitForSelector('.ch-sheet.imprint', { timeout: 15000 });
  check('Chrome Mox asks which card to imprint (a person has to choose)', await p.$eval('.ch-sheet.imprint', e => /Lightning Bolt/.test(e.textContent) && /Goldspan Dragon/.test(e.textContent)));
  await p.click('.ch-sheet .ch-opt[title="Lightning Bolt"]'); await p.click('.ch-sheet .ch-ok'); await settle();
  await cast('Lotus Petal');
  await tap('.pz-card[data-name="Goldspan Dragon"]', /^Cast /); await p.waitForSelector('.ch-sheet.pay', { timeout: 15000 });
  const chips = await p.$$eval('.ch-sheet.pay .ch-paychip', xs => xs.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check('the pay sheet is shown for Goldspan Dragon: more sources than the cost needs (the Display setting does not hide it here)', chips.length === 6 && /Lotus Petal/.test(chips.join()) && /Chrome Mox/.test(chips.join()) && /\{3\}\{R\}\{R\}/.test(await p.$eval('.ch-sheet.pay', e => e.textContent)), chips.join(' | '));
  for (const c of await p.$$('.ch-sheet.pay .ch-paychip')) { const t = await c.textContent(), on = await c.evaluate(e => e.classList.contains('sel')); if (on !== !/Lotus Petal/.test(t)) await (await c.$('.ch-opt')).click(); }
  check('Confirm is on once the five chosen sources pay the cost exactly', await p.$eval('.ch-sheet.pay .ch-ok', e => !e.disabled));
  await p.click('.ch-sheet.pay .ch-ok'); await settle();
  check('the dragon is on the table and the Petal was kept', await p.$eval('.pz-bf', e => /Goldspan Dragon/.test(e.innerHTML)) && await p.$$eval('.pz-bf .pz-perm', xs => xs.some(x => x.dataset.name === 'Lotus Petal')));
  await attackAll();
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('Rocks before the dragon is solved through the person\'s own choices', await p.$eval('.pz-banner', e => e.classList.contains('win')));
  await p.click('.pz-list'); await p.waitForSelector('.pz-pick');

  // ---- a loss: the endgame "Dragons in pairs", attacking with Atarka alone
  await open('end-2');
  const t0 = await p.$eval('.pz-body', e => e.textContent);
  check('a puzzle shows its premise, the goal, the opponent\'s life and a hidden hand count, never its cards', /Turn 10/.test(t0) && /Win this turn/.test(t0) && await p.$eval('[data-life=opp]', e => /15 life/.test(e.textContent)) && /no cards in hand/.test(t0));
  await attackAll(); await p.click('.pz-pass'); await settle();
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('a wrong play plays out and ends as a loss (streak stays 0)', await p.$eval('.pz-banner', e => e.classList.contains('lose')) && /Streak 0/.test(await p.$eval('.pz-banner', e => e.textContent)));
  const lossText = await p.$eval('#tab-puzzle', e => e.textContent);
  check('after the loss no solution is shown (no line, no "Goldspan" move list)', !/A line that works|The answer|solution/i.test(lossText) && await p.$('.pz-sol') === null);
  check('hints are offered after the loss, one at a time', await p.$eval('.pz-hints', e => !e.hidden) && await p.$$eval('.pz-hintlist li', xs => xs.length) === 0);
  await p.click('.pz-hint');
  const h1 = await p.$$eval('.pz-hintlist li', xs => xs.map(x => x.textContent));
  check('a hint says what to look at, and is not the line', h1.length === 1 && h1[0] === data.puzzles.find(x => x.id === 'end-2').hints[0] && !/cast Goldspan Dragon (before|then)/i.test(h1[0]));
  await p.click('.pz-hint'); await p.click('.pz-hint');
  check('three hints in all; then no more', await p.$$eval('.pz-hintlist li', xs => xs.length) === 3 && await p.$eval('.pz-hint', e => e.hidden));
  check('the lesson sits behind an ⓘ, closed at first', await p.$eval('.pz-lbody', e => e.hidden) && /ⓘ/.test(await p.$eval('.pz-lbtn', e => e.textContent)));
  await p.click('.pz-lbtn');
  check('opening it names the mechanic and explains the rule', await p.$eval('.pz-lbody', e => !e.hidden && /Double strike/.test(e.textContent) && /deals combat damage twice/.test(e.textContent)));

  // ---- a win: try again and play the intended line (cast the haste dragon, then attack)
  await p.click('.pz-again'); await p.waitForSelector('.pz-card', { timeout: 60000 }); await settle();
  await cast('Goldspan Dragon'); await attackAll();
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('the intended line wins (Solved, streak 1)', await p.$eval('.pz-banner', e => e.classList.contains('win') && /Solved/.test(e.textContent) && /Streak 1/.test(e.textContent)));
  check('a win offers the lesson too (behind its ⓘ), and no hints', await p.$eval('.pz-lbtn', e => !!e) && await p.$eval('.pz-hints', e => e.hidden));
  await p.click('.pz-list'); await p.waitForSelector('.pz-pick');
  check('the picker ticks the solved puzzle and counts it', await p.$eval('.pz-pick[data-id="end-2"]', e => e.classList.contains('solved')) && /2 of 12 solved/.test(await p.$eval('.pz-score', e => e.textContent)) && /Streak\s*1/.test(await p.$eval('.pz-score', e => e.textContent)));

  // ---- a fast win across three turns: Dorks and colours
  await open('fast-2');
  check('a fast win starts at turn 1 with a seven-card hand and the premise', await p.$$eval('.pz-card', xs => xs.length) === 7 && /turn 1/i.test(await p.$eval('.pz-goal', e => e.textContent)));
  const turn = async (...names) => { for (const n of names) await cast(n); await p.click('.pz-pass'); await settle(); };
  await cast('Forest'); await cast('Llanowar Elves'); await p.click('.pz-pass'); await settle();
  check('the opponent\'s turn is played and it is your turn 2', await p.$eval('.pz-goal', e => /your turn 2 of 3/.test(e.textContent)));
  await cast('Mountain'); await cast('Elvish Mystic'); await p.click('.pz-pass'); await settle();
  await cast('Mountain'); await cast('Goldspan Dragon'); await attackAll();
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('the three-turn line wins on turn 3', await p.$eval('.pz-banner', e => e.classList.contains('win')));
  // ---- a medium fast win from the 40-life set: the pieces of the combo are cast one by one, in order
  await p.click('.pz-list'); await p.waitForSelector('.pz-pick'); await open('fast-3');
  check('a medium fast win starts the opponent at 40, shows only a hand count, and has no Go off button', await p.$eval('[data-life=opp]', e => /40 life/.test(e.textContent)) && await p.$('.pz-combo') === null && await p.$('.pz-hid') !== null);
  await cast('Island'); await p.click('.pz-pass'); await settle();
  await cast('Swamp'); await cast('Ornithopter'); await cast('Lotus Petal'); await cast('Demonic Consultation'); await cast("Thassa's Oracle");
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check('bait, rock, Consultation, then Oracle: the player casts every piece and wins against the hidden Force of Will', await p.$eval('.pz-banner', e => e.classList.contains('win')));
  // a planeswalker: Jace's loyalty ability is a button (fast-4)
  await p.click('.pz-list'); await p.waitForSelector('.pz-pick'); await open('fast-4');
  await cast('Island'); await cast('Sol Ring'); await p.click('.pz-pass'); await settle();
  await cast('Island'); await cast('Ornithopter'); await cast('Lotus Petal'); await cast('Jace, Wielder of Mysteries');
  await tap('.pz-perm[data-name^="Jace"]', /^\+1/); await settle();
  await p.waitForSelector('.pz-banner', { timeout: 30000 });
  check("Jace's +1 is a button and the draw from an empty library wins", await p.$eval('.pz-banner', e => e.classList.contains('win')));
  check('the best streak and progress are kept in localStorage', await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); return s && s.solved['end-2'] && s.solved['fast-2'] && s.solved['fast-3'] && s.solved['fast-4'] && s.solved['fast-1'] && s.best >= 4; }, KEY));
  check('no page errors on the desktop', errs.length === 0, errs.join(' | '));
  await p.reload(); await p.waitForFunction(() => window.ISFPuzzle, null, { timeout: 60000 });
  await p.click('[data-tab=puzzle]'); await p.waitForSelector('.pz-pick');
  check('after a reload the solved puzzles are still ticked', await p.$$eval('.pz-pick.solved', xs => xs.length) === 5);
  await ctx.close();

  // ---- every common phone width, portrait and landscape, and the iPad: no horizontal scroll, nothing clipped (T-119)
  const probe = () => {
    const vw = document.documentElement.clientWidth, bad = [], r = e => e.getBoundingClientRect();
    const doc = document.documentElement.scrollWidth <= vw + 1 || 'page scrolls sideways ' + document.documentElement.scrollWidth + ' > ' + vw;
    const tabs = document.querySelector('.tabs'), tabsOk = tabs.scrollWidth <= tabs.clientWidth + 1 && [...document.querySelectorAll('.tab')].every(t => { const x = r(t); return x.width > 0 && x.left >= -1 && x.right <= vw + 1; });
    for (const e of document.querySelectorAll('#tab-puzzle *')) {
      if (e.closest('[hidden]') || e.closest('details:not([open]) > :not(summary)')) continue;
      const x = r(e); if (!x.width || !x.height) continue;
      if (x.left < -1 || x.right > vw + 1) bad.push((e.className && e.className.baseVal === undefined ? '.' + String(e.className).split(' ')[0] : e.tagName) + ' ' + Math.round(x.left) + '..' + Math.round(x.right));
      if (e.scrollWidth > e.clientWidth + 1 && /^(P|LI|SPAN|BUTTON|H2|B|DIV)$/.test(e.tagName) && getComputedStyle(e).overflowX !== 'visible' && !/pz-tiles|ch-/.test(String(e.className))) bad.push('clipped text in ' + (String(e.className) || e.tagName));
    }
    return { vw, doc, tabsOk, bad: [...new Set(bad)].slice(0, 6) };
  };
  const sizes = [[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [568, 320], [740, 360], [667, 375], [844, 390], [896, 414], [932, 430], [820, 1180], [1180, 820]];
  for (const [w, h] of sizes) {
    const name = `${w}x${h}`, m = await mk(w, h, true), q = m.p;
    const ok = async label => { const r = await q.evaluate(probe); check(`${name}: ${label} fits (no sideways scroll, nothing clipped, every tab visible)`, r.doc === true && r.tabsOk && !r.bad.length, JSON.stringify(r)); };
    await q.click('[data-tab=puzzle]'); await q.waitForSelector('.pz-pick', { timeout: 20000 }); await ok('the picker');
    await q.click('.pz-pick[data-id="fast-1"]'); await q.waitForSelector('.pz-card', { timeout: 60000 });
    await q.waitForFunction(() => { const s = window.ISFPuzzle.state(); return s && !s.busy && s.phase === 'me'; }, null, { timeout: 30000 });
    await ok('a puzzle table with a seven-card hand');
    const bar = await q.evaluate(() => { const e = document.querySelector('.pz-pass').getBoundingClientRect(); return { w: Math.round(e.width), hgt: Math.round(e.height) }; });
    check(`${name}: the buttons are big enough to tap`, bar.hgt >= 36 && bar.w >= 64, JSON.stringify(bar));
    const tiles = await q.$$eval('.pz-card', xs => xs.map(x => Math.round(x.getBoundingClientRect().width)));
    check(`${name}: the hand's cards are tappable (wide enough)`, tiles.length === 7 && tiles.every(w2 => w2 >= 36), tiles.join(','));
    if (w === 390 && h === 844) {          // T-134: swipe through the hand in the viewer (touch pointer events), in screen order, stopping at the ends
      const swipe = (dx, dy) => q.evaluate(([dx, dy]) => { const f = document.querySelector('#lightbox .lb-faces'), r = f.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const ev = (t, X, Y) => f.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerType: 'touch', clientX: X, clientY: Y })); ev('pointerdown', x, y); ev('pointerup', x + dx, y + dy); }, [dx, dy]);
      const nm = () => q.textContent('#lightbox .lb-name'), cnt = () => q.textContent('#lightbox .lb-count');
      const names = [...new Set(await q.$$eval('.pz-card', xs => xs.map(x => x.dataset.name)))], N = names.length;          // two copies of one card are one entry in the viewer
      await q.click('.pz-card >> nth=0'); await q.waitForSelector('#lightbox.show .lb-act');
      check(`${name}: the viewer shows where you are in the hand ("1 of N")`, (await cnt()) === `1 of ${N}` && (await nm()) === names[0], await cnt());
      await swipe(120, 0); await q.waitForTimeout(150);
      check(`${name}: swiping right at the first card stays (no wrap)`, (await nm()) === names[0] && await q.$eval('.lb-nav.prev', e => e.disabled));
      await swipe(-15, -200); await q.waitForTimeout(150);
      check(`${name}: a vertical swipe does not move`, (await nm()) === names[0]);
      await swipe(-120, 10); await q.waitForTimeout(150);
      check(`${name}: swiping left moves to the next card in screen order, with its own actions`, (await nm()) === names[1] && (await cnt()) === `2 of ${N}` && await q.$$eval('#lightbox .lb-act', xs => xs.length >= 1));
      await q.$eval('#lightbox .lb-act', b => b.click()); await q.waitForTimeout(100);
      check(`${name}: the ghost-tap guard holds after a swipe`, await q.$eval('#lightbox', e => e.classList.contains('show')) && await q.$$eval('.pz-card', xs => xs.length) === 7);
      for (let k = 0; k < 8; k++) await swipe(-120, 0);
      await q.waitForTimeout(150);
      check(`${name}: it stops at the last card`, (await nm()) === names[N - 1] && (await cnt()) === `${N} of ${N}` && await q.$eval('.lb-nav.next', e => e.disabled));
      await q.keyboard.press('Escape'); await q.waitForTimeout(100);
    }
    await q.click('.pz-giveup'); await q.waitForSelector('.pz-banner'); await q.click('.pz-hint'); await q.click('.pz-lbtn'); await q.waitForTimeout(200);
    await ok('the result with a hint and the lesson open');
    check(`${name}: no page errors`, m.errs.length === 0, m.errs.join(' | '));
    await m.ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
