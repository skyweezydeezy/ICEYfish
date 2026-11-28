// T-123: a Simulate-tab sample game replays on the real Practice table. After "Replay on the table" to turn N, the table's game equals the
// state the simulation itself reaches from the same seed (same engine turns): hand, battlefield, graveyard, life, damage, turn. The player can then take over.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(2500);
  await p.click('[data-tab=deck]'); await p.fill('#optN', '300');
  await p.click('[data-tab=sim]'); await p.click('#runSim');
  await p.waitForSelector('#sampleButtons button', { timeout: 120000 });
  await p.click('#sampleButtons button'); await p.waitForTimeout(800);
  check('Simulate: the sample game shows its opening hand and a "Replay on the table" button, no per-turn rows', await p.$('#replayGo') !== null && (await p.$$eval('#replay .turnrow', x => x.length)) === 1);
  // the state a game is in, as plain data
  const fp = `(g => { const nm = a => a.map(x => (x.card || x.inst.card).name).sort(); return JSON.stringify({ turn: g.turn, hand: nm(g.hand), bf: nm(g.battlefield).concat(g.battlefield.map(x => x.tapped ? 1 : 0)), gy: nm(g.graveyard), life: g.life, damage: g.damage, kill: g.killTurn, lib: g.library.length }); })`;
  for (const N of [0, 1, 3]) {
    const r = await p.evaluate(({ N, fp }) => {
      const api = window.__isfApi, G = window.Goldfish, o = api.opts(), seed = api.S.lastReplaySeed, F = eval(fp);
      const sim = G.newGame(api.S.deck, o, seed); G.mulligan(sim);
      for (let t = 0; t < N && sim.killTurn == null; t++) G.playTurn(sim);
      api.replayOnTable(seed, o, N);
      return { table: F(window.__isf.game), sim: F(sim), view: document.body.dataset.view };
    }, { N, fp });
    if (N) check(`turn ${N}: the Practice table's game equals the simulation's state`, r.table === r.sim, r.table === r.sim ? '' : r.table + ' vs ' + r.sim);
    else check('turn 0: the table opens on the simulation\'s kept opening hand (turn 1 then draws one card)', (t => { const h = JSON.parse(r.table).hand.slice(), o = JSON.parse(r.sim).hand; return o.every(n => { const i = h.indexOf(n); if (i < 0) return false; h.splice(i, 1); return true; }); })(), r.table)
    check(`turn ${N}: it is the real Practice table`, await p.isVisible('#zHand') && await p.isVisible('#tNext'));
    await p.click('[data-tab=sim]');
  }
  // the button does the same, then the person takes over with Next turn
  await p.click('#replayGo'); await p.waitForTimeout(500);
  const t0 = await p.evaluate(() => window.__isf.game.turn);
  await p.click('#tNext'); await p.waitForFunction(t => window.__isf.game.turn === t + 1 && !window.__isf.busy, t0, { timeout: 20000 });
  check('after the replay, Next turn plays on in the same game', true);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
