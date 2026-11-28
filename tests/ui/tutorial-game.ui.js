// Tutorial sample games (tutorial.js): the guided Practice game and the guided Duel run to the end with the built-in Counter Culture deck
// and fixed seeds (same cards every time); every tap step points at its element; the person's own deck comes back afterwards and the
// sample deck is never saved; leaving in the middle throws a Practice game away and leaves a Duel as a normal game. PC and iPhone.
const { chromium, devices } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const URL = 'http://127.0.0.1:8800/';

async function context(b, o) {
  const ctx = await b.newContext({ ...o, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_tutorial_off', '1'); } catch (e) {} });
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const q = route.request(), c = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: c });
    try {
      const res = await fetch(q.url(), { method: q.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(q.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: q.method() === 'POST' ? q.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...c, 'content-type': res.headers.get('content-type') || '' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch (e) { route.abort(); }
  });
  return ctx;
}
const state = p => p.evaluate(() => {
  const t = window.ISFTutorial, a = t.active; if (!a) return null;
  const s = document.querySelector('.tut-bubble'), root = document.querySelector('.tut'), gm = window.__isfVersus && window.__isfVersus.duel.game;
  return { step: a.step, of: a.of, title: s.querySelector('.tut-title').textContent, next: !s.querySelector('.tut-next').hidden, dis: s.querySelector('.tut-next').disabled,
    busy: root.classList.contains('tut-busy'), tap: root.classList.contains('tut-tap'), hasT: !!t.target, sheet: (document.querySelector('.ch-sheet .ch-title') || {}).textContent || '',
    phase: gm && gm.phase };
});
// a tap on the middle of the spotlit element, the way a person would (a mouse click on PC, a touch on a phone)
async function tapTarget(p, touch) {
  // a button is tapped on its icon at the left (the middle of "Autopilot to turn" is its number box); anything else in its middle
  const box = await p.evaluate(() => { const t = window.ISFTutorial.target, r = t.getBoundingClientRect(); return [t.tagName === 'BUTTON' ? r.left + Math.min(14, r.width / 2) : r.left + r.width / 2, r.top + r.height / 2]; });
  if (touch) await p.touchscreen.tap(box[0], box[1]); else await p.mouse.click(box[0], box[1]);
}
const q = async (p, sel) => { const e = await p.$(sel); if (e && await e.isVisible() && await e.isEnabled()) { await e.click({ timeout: 3000 }).catch(() => {}); return true; } return false; };

// follow the Practice sample game to the end; returns the titles seen
async function practice(p, touch, stopAt) {
  const seen = []; let last = -1, same = 0, sheet = false, spotOk = true; const auto = {};
  for (let k = 0; k < 600; k++) {
    const a = await state(p); if (!a) break;
    if (a.step !== last) { seen.push(a.title); last = a.step; same = 0;
      if (/^Playing to turn|^Loop$/.test(a.title)) auto[a.title === 'Loop' ? 'loop' : 'warn'] = await p.evaluate(() => ({ title: document.querySelector('.tut-title').textContent, text: document.querySelector('.tut-text').textContent,
        box: +document.querySelector('#tAutoToN').value, busy: !!window.__isf.busy, next: !document.querySelector('.tut-next').hidden && !document.querySelector('.tut-next').disabled }));
    } else if (++same > 250) { seen.push('STUCK at ' + a.title); break; }
    if (stopAt && a.title === stopAt) return { seen, sheet, spotOk, auto };
    if (a.busy || a.dis) { await p.waitForTimeout(150); continue; }
    if (a.title === 'A question') { sheet = true; await q(p, '.ch-ok'); await p.waitForTimeout(400); continue; }
    if (a.title === 'Card viewer') { if (touch) await p.tap('#lightbox .lb-x'); else await p.click('#lightbox .lb-x'); await p.waitForTimeout(400); continue; }
    if (a.tap && !a.next) { if (!a.hasT) { spotOk = false; await p.waitForTimeout(200); continue; } await tapTarget(p, touch); await p.waitForTimeout(350); continue; }
    if (a.next) { if (touch) await p.tap('.tut-next'); else await p.click('.tut-next'); await p.waitForTimeout(250); continue; }
    await p.waitForTimeout(150);
  }
  return { seen, sheet, spotOk, auto };
}

(async () => {
  const b = await chromium.launch();

  // ---- PC: the person has a deck of their own; the Practice sample game runs to the end and gives it back ----
  {
    const ctx = await context(b, { viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 }); await p.waitForTimeout(800);
    const before = await p.evaluate(() => ({ text: document.querySelector('#deckText').value, saved: Object.keys(JSON.parse(localStorage.getItem('gf_decks') || '{}')).length, cmd: window.__isf.deck.commanders.map(c => c.card.name).join('+') }));
    await p.click('.top-help'); await p.click('.tut-m-sample');
    // the opening hand is always the same
    await p.waitForFunction(() => document.querySelector('#handStage .fan .mtg'), null, { timeout: 90000 }).catch(() => {});
    const r1 = await practice(p, false, 'Keep or mulligan?');
    const hand = await p.evaluate(() => { const H = window.__isfApi.hand.get(); return H ? H.g.hand.map(c => c.card.name).sort().join(', ') : 'no hand'; });
    check('Practice sample: the fixed seed deals the same opening 7', hand === 'Forest, Forest, Forest, Fyndhorn Elves, Renata, Called to the Hunt, Three Visits, Worldly Tutor', hand);
    const r = await practice(p, false);
    const all = r1.seen.concat(r.seen);
    const w = r.auto.warn, lp = r.auto.loop;
    check('Practice sample: after Autopilot to turn it says the game plays itself to the end of turn N (the box\'s number)', !!w && w.text.includes(`plays itself to the end of turn ${w.box}`) && w.title === `Playing to turn ${w.box}`, JSON.stringify(w));
    check('Practice sample: Next is free at once while the autopilot plays (the Loop step does not wait)', !!w && w.next && w.busy && !!lp && lp.next, JSON.stringify([w, lp]));
    check('Practice sample: the script runs to the end', !(await p.evaluate(() => window.ISFTutorial.active)) && all.includes('That is Practice') && !all.some(t => /STUCK/.test(t)), all.join(' › '));
    check('Practice sample: keep, land, spell, question, autopilot, speed, autopilot to turn, Loop and the card viewer are all shown',
      ['Keep or mulligan?', 'Play a land', 'Cast a spell', 'A question', 'Autopilot', 'How it decides', 'Autopilot speed', 'Autopilot to turn', 'Loop', 'Card viewer'].every(t => all.includes(t)));
    check('Practice sample: the library search question was asked', r.sheet);
    check('Practice sample: every tap step had its element to point at', r1.spotOk && r.spotOk);
    const after = await p.evaluate(() => ({ text: document.querySelector('#deckText').value, saved: Object.keys(JSON.parse(localStorage.getItem('gf_decks') || '{}')).length, cmd: window.__isf.deck.commanders.map(c => c.card.name).join('+'), tutorial: !!(window.__isf.loaded && window.__isf.loaded.tutorial) }));
    check('Practice sample: your own deck comes back afterwards', after.cmd === before.cmd && !after.tutorial, `${before.cmd} → ${after.cmd}`);
    check('Practice sample: the decklist box and the saved decks are untouched (the sample deck is not saved)', after.text === before.text && after.saved === before.saved, `saved ${before.saved} → ${after.saved}`);
    const seen = await p.evaluate(() => window.ISFTutorial.progress().seen);
    check('Practice sample: the Mulligan and Practice tours count as seen', seen['tab:hands'] && seen['tab:table'] && seen['sample:practice']);

    // leave in the middle: the sample game is thrown away, your deck is back
    await p.click('[data-tab=deck]');
    await p.click('.top-help'); await p.click('.tut-m-sample');
    await practice(p, false, 'Cast a spell');
    await p.click('.tut-close'); await p.waitForTimeout(800);
    const left = await p.evaluate(() => ({ cmd: window.__isf.deck.commanders.map(c => c.card.name).join('+'), sample: !!(window.__isf.loaded && window.__isf.loaded.tutorial), game: window.__isf.game ? window.__isf.game.hand.concat(window.__isf.game.battlefield).some(c => c.card.name === 'Fyndhorn Elves') : false, active: !!window.ISFTutorial.active }));
    check('Practice sample: Skip in the middle leaves at once, throws the sample game away and gives your deck back', !left.active && !left.sample && left.cmd === before.cmd && !left.game, JSON.stringify(left));

    // ---- Duel: the d20, keep, the opponent's autopilot turn, your turn, attack, block, Beast Within as an instant ----
    await p.click('.top-help'); await p.click('.tut-m-duel');
    const titles = []; let last = '', same = 0, beast = false;
    for (let k = 0; k < 2500; k++) {
      const a = await state(p); if (!a) break;
      const key = a.step + a.title; if (key !== last) { titles.push(a.title); if (process.env.TUT_DEBUG) console.log('DUEL step', a.title); last = key; same = 0; } else if (++same > 900) { titles.push('STUCK at ' + a.title); break; }
      if (a.busy) { await p.waitForTimeout(150); continue; }
      if (a.sheet) {          // answer as a person: Beast Within when asked about an instant, otherwise the autopilot's answer
        if (/cast an instant/.test(a.sheet)) { const ok = await p.evaluate(() => { const t = [...document.querySelectorAll('.ch-sheet .ch-opts > *')].find(x => /Beast Within/.test(x.textContent)); if (t) t.click(); return !!t; }); if (ok) { beast = true; await viewerPick(p); await q(p, '.ch-ok'); await p.waitForTimeout(300); continue; } }
        await q(p, '.ch-auto'); await p.waitForTimeout(300); continue;
      }
      if (a.phase === 'block') { await q(p, '#tab-duel .vs-block-go'); await p.waitForTimeout(300); continue; }
      const free = /Your turn|Play on|Choose attackers/.test(a.title);
      if (a.tap && !a.next && a.hasT && !free) { await tapTarget(p, false); await p.waitForTimeout(400); continue; }
      if (a.next && !a.dis) { await p.click('.tut-next'); await p.waitForTimeout(300); continue; }
      if (/Choose attackers/.test(a.title)) { await q(p, '#tab-duel .vs-attack-go'); await p.waitForTimeout(300); continue; }
      if (/Your turn|Play on/.test(a.title)) {          // your own turns: a land and the glowing cards (Beast Within stays in hand), then End turn
        if (await q(p, '#tab-duel .vs-pass')) { await p.waitForTimeout(200); continue; }
        const cid = await p.evaluate(() => { const gm = window.__isfVersus.duel.game, g = gm.games[0]; if (gm.phase !== 'main' || gm.match.order[gm.idx].pid !== 0 || gm.busy) return null;
          const e = [...document.querySelectorAll('#tab-duel .vs-hand .vs-card.can')].find(x => { const c = g.hand.find(i => i.iid === +x.dataset.iid); return c && c.card.name !== 'Beast Within'; }); return e ? e.dataset.iid : null; });
        if (cid) { await p.click(`#tab-duel .vs-hand .vs-card.can[data-iid="${cid}"]`, { timeout: 3000 }).catch(() => {}); await viewerPick(p); continue; }
        if (await q(p, '#tab-duel .vs-end')) { await p.waitForTimeout(300); continue; }
      }
      await p.waitForTimeout(150);
    }
    check('Duel sample: the script runs to the end', titles.includes('That is Duel') && !titles.some(t => /STUCK/.test(t)), titles.join(' › '));
    check('Duel sample: the d20, keeping, the opponent\'s turn, your turn, attacking and blocking are all shown',
      ['Who goes first', 'Keep or mulligan', 'The opponent\'s turn', 'Your turn', 'Attack', 'Choose attackers', 'Blocking'].every(t => titles.includes(t)));
    const log = await p.evaluate(() => document.querySelector('#tab-duel .vs-log').innerText);
    check('Duel sample: you blocked and answered the attack with Beast Within (an instant)', beast && /Choose your blocks|blocks/.test(log) && /cast Beast Within/.test(log));
    const dAfter = await p.evaluate(() => ({ cmd: window.__isf.deck.commanders.map(c => c.card.name).join('+'), game: !!window.__isfVersus.duel.game, opp: document.querySelector('#tab-duel .vs-opp').value }));
    check('Duel sample: the game stays on the table as a normal game, your deck is back', dAfter.game && dAfter.cmd === before.cmd, JSON.stringify(dAfter));
    check('PC: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- iPad landscape: the Practice sample game with taps, the autopilot warning and Next while it plays (the user's screenshot) ----
  {
    const ctx = await context(b, devices['iPad Pro 11 landscape']);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(800);
    await p.tap('.top-help'); await p.tap('.tut-m-sample');
    const r = await practice(p, true);
    const w = r.auto.warn, lp = r.auto.loop;
    check('iPad landscape: the Practice sample game runs to the end with taps', r.seen.includes('That is Practice') && !r.seen.some(t => /STUCK/.test(t)) && r.spotOk, r.seen.join(' › '));
    check('iPad landscape: the warning names the turn, and Next works while the autopilot plays', !!w && w.text.includes(`end of turn ${w.box}`) && w.next && !!lp && lp.next, JSON.stringify([w, lp]));
    check('iPad landscape: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- iPhone: the Practice sample game with taps, no deck of your own (the sample deck stays, the game goes on) ----
  {
    const ctx = await context(b, devices['iPhone 13']);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(800);
    await p.tap('.top-help'); await p.tap('.tut-m-sample');
    const r = await practice(p, true);
    check('iPhone: the Practice sample game runs to the end with taps', r.seen.includes('That is Practice') && !r.seen.some(t => /STUCK/.test(t)) && r.spotOk, r.seen.join(' › '));
    const st = await p.evaluate(() => ({ sample: !!(window.__isf.loaded && window.__isf.loaded.tutorial), turn: window.__isf.game && window.__isf.game.turn }));
    check('iPhone: with no deck of your own the sample deck stays and the game is a normal game, played on by the autopilot', st.sample && st.turn >= 4, JSON.stringify(st));
    check('iPhone: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
