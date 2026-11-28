// T-137: Build tab -> "Fastest win vs X: turn N  ▶ Watch" -> the Duel tab opens on the replay: the dice, the game plays to the stored win turn,
// both hands face up, and every control works (pause, step, back, jump, restart); a card opens in the viewer; Leave goes back to Build.
// The game in the browser must be the game tools/fastest-kill.js found (same winner and turn) whatever the person's own settings are.
const { chromium } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); localStorage.setItem('isf_tutorial_off', '1'); } catch (e) {} });
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
  await p.waitForFunction(() => document.querySelectorAll('#savedDecks option[value^="builtin:"]').length > 10, null, { timeout: 30000 });
  const fast = await p.evaluate(() => fetch('decks/fastest.json').then(r => r.json()));
  // the slowest of the stored wins: it has the most turns to step through
  const file = Object.keys(fast.decks).filter(f => !fast.decks[f].none).sort((a, b) => fast.decks[a].turn - fast.decks[b].turn || a.localeCompare(b)).slice(-1)[0], stored = fast.decks[file];
  await p.selectOption('#savedDecks', 'builtin:' + file);
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 120000 });
  await p.waitForSelector('#deckWatch:not([hidden])', { timeout: 10000 });
  const line = await p.$eval('#deckWatch .dw-line', e => e.textContent);
  check('Build: one line "Fastest win vs <deck>: turn N" with a Watch button', new RegExp(`^Fastest win vs .+: turn ${stored.turn}$`).test(line) && /Watch/.test(await p.$eval('#deckWatch .dw-go', e => e.textContent)), line);
  check('Build: the line is compact (at most two rows), its explanation is folded behind the i', await p.$eval('#deckWatch', e => e.getBoundingClientRect().height < 60) && await p.$eval('#deckWatch .hint', e => e.classList.contains('folded')));
  const V = () => p.evaluate(() => { const g = window.__isfVersus.duel.game; return g ? { ply: g.ply, over: g.over, playing: g.playing, busy: g.busy, winner: g.match.winner, turns: g.games.map(x => x.turn), round: g.match.round, fp: JSON.stringify(g.games.map(x => [x.turn, x.life, x.hand.map(i => i.card.name).sort(), x.battlefield.map(i => i.card.name).sort(), x.graveyard.length, x.library.length])) } : null; });
  const atPly = (n) => p.waitForFunction(n => { const g = window.__isfVersus.duel.game; return g && g.ply === n && !g.busy; }, n, { timeout: 90000 });
  // ▶ Watch: the Duel tab, the dice first
  await p.click('#deckWatch .dw-go');
  await p.waitForFunction(() => document.body.dataset.view === 'duel', null, { timeout: 60000 });
  await p.waitForSelector('.vs-dice', { timeout: 60000 });
  check('Watch opens the Duel tab on the dice roll: a die for each deck', (await p.$$('.vs-dice .vs-die')).length === 2);
  check('the log says it is a replay and how each seat kept its hand', await p.$eval('.vs-log', e => /Replay: the fastest win of/.test(e.textContent) && (e.textContent.match(/keeps 7 cards|mulligan/g) || []).length >= 2), await p.$eval('.vs-log', e => e.textContent.slice(0, 300)));
  const first = await p.evaluate(() => window.__isfVersus.duel.game.match.order[0].pid);
  await p.waitForFunction(() => !document.querySelector('.vs-dice'), null, { timeout: 30000 });
  check('the dice agree with the stored first player', first === stored.first && /goes first/.test(await p.$eval('.vs-log', e => e.textContent)), 'first ' + first + ' stored ' + stored.first);
  check('both hands are face up (the opponent\'s too)', (await p.$$('.vs-seat.opp .vs-hand .mtg')).length > 0 && (await p.$$('.vs-seat.me .vs-hand .mtg')).length > 0);
  // it plays by itself to the stored win
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.over; }, null, { timeout: 180000 });
  let s = await V();
  check('the game plays to the stored win: this deck wins on the stored turn', s.winner === 0 && s.turns[0] === stored.turn, JSON.stringify({ winner: s.winner, turns: s.turns, stored: stored.turn }));
  check('the log shows each action: lines for both seats', await p.$eval('.vs-log', e => e.children.length > 12), await p.$eval('.vs-log', e => e.children.length));
  const endPly = s.ply;
  // Back, Step, Jump, Restart
  await p.click('.vs-back'); await atPly(endPly - 1);
  s = await V();
  check('Back: one turn earlier, not over, the game is replayed from its seed', s.ply === endPly - 1 && !s.over && s.winner == null, JSON.stringify({ ply: s.ply, over: s.over }));
  await p.click('.vs-next'); await atPly(endPly);
  s = await V(); check('Step: one turn later, back at the win', s.ply === endPly && s.over && s.winner === 0 && s.turns[0] === stored.turn);
  const endFp = s.fp;
  await p.selectOption('.vs-jump', '2'); await atPly(2);
  s = await V(); check('Jump to round 1: both seats have played one turn', s.ply === 2 && !s.over && s.turns[0] === 1 && s.turns[1] === 1, JSON.stringify(s.turns));
  await p.selectOption('.vs-jump', '0'); await atPly(0);
  s = await V(); check('Jump to the opening hands: nobody has played a turn', s.ply === 0 && s.turns.every(t => !t) && !s.over, JSON.stringify(s.turns));
  await p.selectOption('.vs-jump', String(2 * stored.round)); await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.over && !g.busy; }, null, { timeout: 90000 });
  s = await V(); check('Jump to the last round: the same final game as watching it through', s.fp === endFp && s.winner === 0, s.fp === endFp ? '' : s.fp.slice(0, 200));
  await p.click('.vs-rs');
  await p.waitForSelector('.vs-dice', { timeout: 30000 });
  check('Restart: the dice again, from the start', (await V()).ply === 0);
  await p.waitForFunction(() => !document.querySelector('.vs-dice') && window.__isfVersus.duel.game.playing, null, { timeout: 30000 });
  await p.click('.vs-play');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return !g.playing && !g.busy; }, null, { timeout: 60000 });
  const paused = await V(); await p.waitForTimeout(1500);
  check('Pause: the game stops and stays where it is', (await V()).ply === paused.ply && !paused.over, 'ply ' + paused.ply);
  await p.click('.vs-play'); await p.waitForFunction(n => window.__isfVersus.duel.game.ply > n || window.__isfVersus.duel.game.over, paused.ply, { timeout: 60000 });
  check('Play carries on from the pause', true);
  // a card opens in the viewer
  await p.click('.vs-play').catch(() => {});
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return (!g.playing && !g.busy) || g.over; }, null, { timeout: 60000 });
  await p.click('.vs-seat.opp .vs-hand .mtg', { force: true });
  if (!(await p.isVisible('#lightbox.show'))) { await p.waitForTimeout(400); const v = p.locator('#ctxMenu button:has-text("View card")'); if (await v.count()) await v.first().click(); }
  await p.waitForSelector('#lightbox.show', { timeout: 10000 });
  check('a card opens in the shared viewer', /\d+ \/ \d+/.test(await p.textContent('.lb-count')) && (await p.textContent('.lb-name')).length > 0, await p.textContent('.lb-name'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  // view-only, and Leave goes back to Build
  check('view-only: no hand card offers a play', (await p.$$('#tab-duel .vs-hand .vs-card.can')).length === 0 && (await p.$$('#tab-duel .vs-asland')).length === 0);
  await p.click('.vs-leave'); await p.waitForFunction(() => document.body.dataset.view === 'deck', null, { timeout: 10000 });
  check('Leave goes back to the Build tab', true);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
