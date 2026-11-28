// Who goes first in Duel and Pod: everyone rolls a D20 (versus.js rollFirst / showRoll).
// Needs playwright, a static server on :8800 and internet access to Scryfall (to load a deck).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
// The 3D dice can leave the page with no animation frames for many seconds (software rendering). Playwright's click waits for the button to be
// "stable" over two frames and waitForSelector polls on frames, so both ran out with the page fine. These wait on a timer and click in the page.
const POLL = 200;
const waitSel = (p, sel, ms, state) => p.waitForFunction(([s, gone]) => { const e = document.querySelector(s); return gone ? !e : !!e && e.getClientRects().length > 0; }, [sel, state === 'detached'], { timeout: ms, polling: POLL });
const clickIn = async (p, sel) => { await waitSel(p, sel, 30000); await p.evaluate(s => document.querySelector(s).click(), sel); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
const shots = process.env.D20_SHOTS;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => localStorage.setItem('isf_sound', JSON.stringify({ bg: false, music: false })));
  await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
    const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    try { const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
      route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) }); } catch (e) { route.abort(); }
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');

  // ---- the dice themselves ----
  const stats = await p.evaluate(() => {
    const R = __isfVersus.rollFirst, out = {};
    for (const n of [2, 4]) {
      const wins = Array(n).fill(0); let ties = 0, bad = 0, same = true;
      for (let s = 1; s <= 20000; s++) {
        const r = R(n, s * 7919);
        wins[r.first]++; if (r.rounds.length > 1) ties++;
        const last = r.rounds[r.rounds.length - 1], top = Math.max(...last.map(x => x.v));
        if (last.filter(x => x.v === top).length !== 1 || last.find(x => x.v === top).pid !== r.first) bad++;
        if (r.rounds.some(rd => rd.some(x => x.v < 1 || x.v > 20))) bad++;
        if (s % 1000 === 0 && JSON.stringify(R(n, s * 7919)) !== JSON.stringify(r)) same = false;
      }
      out[n] = { wins, ties, bad, same };
    }
    let forcedOk = true; for (let s = 1; s <= 500; s++) for (const f of [0, 1]) { const r = R(2, s, f), last = r.rounds[r.rounds.length - 1], top = Math.max(...last.map(x => x.v)); if (r.first !== f || last.find(x => x.v === top).pid !== f || last.filter(x => x.v === top).length !== 1) forcedOk = false; }
    out.forcedOk = forcedOk;
    return out;
  });
  for (const n of [2, 4]) {
    const s = stats[n], share = s.wins.map(w => w / 20000), even = share.every(x => Math.abs(x - 1 / n) < 0.015);
    check(`${n} players: every seat goes first about equally often`, even, share.map(x => (x * 100).toFixed(1) + '%').join(' / '));
    check(`${n} players: the highest roll always goes first, every die 1–20`, s.bad === 0, s.bad + ' bad');
    check(`${n} players: ties happen and roll again`, s.ties > 0, (s.ties / 200).toFixed(1) + '% of games');
    check(`${n} players: the same seed always gives the same dice (both devices of a remote game agree)`, s.same);
  }
  check('a saved game\'s first player is kept: the dice are made to agree with it', stats.forcedOk);

  // ---- on screen, in a real game ----
  await p.fill('#deckText', deckText); await clickIn(p, '#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000, polling: POLL });
  for (const mode of ['duel', 'pod']) {
    await clickIn(p, `[data-tab=${mode}]`);
    for (const sel of await p.$$(`#tab-${mode} .vs-opp`)) await sel.selectOption('');
    await p.selectOption(`#tab-${mode} .vs-you`, 'auto');
    const loop = await p.$(`#tab-${mode} .vs-loop`); if (loop && await loop.isChecked()) await loop.uncheck();
    await clickIn(p, `#tab-${mode} .vs-new`);
    await waitSel(p, '.vs-dice', 30000);
    const n = mode === 'duel' ? 2 : 4;
    check(`${mode}: a D20 for every player appears`, (await p.$$('.vs-dice .vs-die')).length === n);
    check(`${mode}: each is the 3D d20 model (twenty faces)`, await p.evaluate(() => [...document.querySelectorAll('.vs-dice .vs-die')].every(d => d.querySelectorAll('.d20-face').length === 20)));
    const top = await p.evaluate(() => {
      const box = document.querySelector('.vs-dice'), cs = getComputedStyle(box), die = box.querySelector('.vs-die .dice-stage').getBoundingClientRect();
      box.style.pointerEvents = 'auto'; const at = document.elementFromPoint(die.left + die.width / 2, die.top + die.height / 2); box.style.pointerEvents = '';          // (pointer-events: none is the design: clicks pass through; lifted for this one hit test)
      let trapped = null; for (let e = box.parentElement; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.animationName !== 'none' && /opacity|modein|fade/.test(c.animationName) || +c.opacity < 1 || c.filter !== 'none' || c.transform !== 'none') { trapped = e.id || e.className || e.tagName; break; } }
      return { parent: box.parentElement.tagName, pe: cs.pointerEvents, hit: !!(at && box.contains(at)), trapped };
    });
    check(`${mode}: the dice are on the body, on top at their centre, and in no animated or faded ancestor`, top.parent === 'BODY' && top.hit && !top.trapped, JSON.stringify(top));
    if (shots) { await p.waitForTimeout(300); await p.screenshot({ path: `${shots}/d20-${mode}-rolling.png` }); }
    await waitSel(p, '.vs-die.win', 90000);          // ties roll again, each round a few seconds: a four-player pod can need several
    const r = await p.evaluate(m => {
      const gm = __isfVersus[m].game, w = document.querySelector('.vs-die.win');
      return { winner: +w.dataset.pid, first: gm.match.order[0].pid, say: document.querySelector('.vs-dice-say').textContent, log: [...document.querySelectorAll(`#tab-${m} .vs-log .vs-line`)].map(e => e.textContent).join(' | '), round: gm.match.round, turnsPlayed: gm.games.reduce((t, g) => t + g.turn, 0) };
    }, mode);
    if (shots) await p.screenshot({ path: `${shots}/d20-${mode}-result.png` });
    check(`${mode}: the glowing die is the player who goes first`, r.winner === r.first, JSON.stringify({ winner: r.winner, first: r.first, say: r.say }));
    check(`${mode}: it says who goes first`, /goes first|go first/.test(r.say), r.say);
    check(`${mode}: while the dice roll, the table does not give the result away`, /rolls a D20/.test(r.log) && !/goes first\.|go first\./.test(r.log), r.log.slice(0, 160));
    await waitSel(p, '.vs-dice', 30000, 'detached');
    const log2 = await p.evaluate(m => [...document.querySelectorAll(`#tab-${m} .vs-log .vs-line`)].map(e => e.textContent).join(' | '), mode);
    check(`${mode}: once they land, the log has the rolls and who goes first`, /Rolled a D20 to see who goes first/.test(log2) && /goes first\.|go first\./.test(log2), log2.slice(0, 220));
    check(`${mode}: nobody plays until the dice are done`, r.turnsPlayed === 0, r.turnsPlayed + ' turns');
    // with every seat on autopilot the game waits for Play or +1 turn, as before the dice
    await p.evaluate(m => document.querySelector(`#tab-${m} .vs-next`).click(), mode);          // (a mouse click can land under the sticky top bar)
    check(`${mode}: the dice go away, then the game plays (+1 turn)`, await p.waitForFunction(m => __isfVersus[m].game.games.some(g => g.turn > 0), mode, { timeout: 20000, polling: POLL }).then(() => true, () => false));
    check(`${mode}: the player who won the roll takes the first turn`, await p.evaluate(m => { const gm = __isfVersus[m].game, f = gm.match.order[0].pid; return gm.games[f].turn === 1 && gm.games.every(g => g.pid === f || g.turn === 0); }, mode));
  }
  // pressing +1 turn while the dice tumble skips them
  await p.evaluate(() => { document.querySelector('[data-tab=duel]').click(); document.querySelector('#tab-duel .vs-new').click(); });
  await waitSel(p, '.vs-dice[data-mode=duel]', 30000);
  await p.evaluate(() => document.querySelector('#tab-duel .vs-next').click());
  await p.waitForTimeout(150);
  const sk = await p.evaluate(() => ({ dice: !!document.querySelector('.vs-dice'), log: [...document.querySelectorAll('#tab-duel .vs-log .vs-line')].map(e => e.textContent).join(' | ') }));
  check('pressing +1 turn while the dice tumble skips them, and the log still has the rolls first', !sk.dice && /Rolled a D20/.test(sk.log) && sk.log.indexOf('Rolled a D20') < sk.log.indexOf('turn 1'), sk.log.slice(0, 200));
  // dice switched off (isf_dice = 0): no dice on screen, the log tells the rolls at once
  await p.evaluate(() => { localStorage.setItem('isf_dice', '0'); document.querySelector('#tab-duel .vs-new').click(); });
  await p.waitForFunction(() => /Rolled a D20/.test([...document.querySelectorAll('#tab-duel .vs-log .vs-line')].map(e => e.textContent).join(' ')), null, { timeout: 30000, polling: POLL });
  check('with dice switched off there are none on screen, and the log has the rolls at once', !(await p.$('.vs-dice')));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
