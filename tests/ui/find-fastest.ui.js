// T-137 (user): "Find fastest win" on the Build tab works for any deck, not only the built-in ones. A pasted deck is searched in the browser
// (a small budget here), the line shows the result, Watch replays that game in Duel (the dice, then the game to the found turn, same winner), and
// the result is kept for that deck after a reload.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false })); localStorage.setItem('isf_autosave', '0'); localStorage.setItem('isf_tutorial_off', '1'); window.__isfFindGames = 300; window.__isfFindSeeds = 6; const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });
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
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8'));
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForSelector('#deckWatch:not([hidden])', { timeout: 10000 });
  check('a pasted deck: the line offers the search, no Watch yet', /not searched yet/.test(await p.textContent('#deckWatch .dw-line')) && await p.isHidden('#deckWatch .dw-go') && /Find/.test(await p.textContent('#deckWatch .dw-find')));
  await p.click('#deckWatch .dw-find');
  await p.waitForFunction(() => /Searching|Loading/.test(document.querySelector('#deckWatch .dw-line').textContent), null, { timeout: 30000 });
  check('the line shows progress while it searches', true);
  await p.waitForFunction(() => /^Fastest win vs .+: turn \d+ · /.test(document.querySelector('#deckWatch .dw-line').textContent) || /No win found/.test(document.querySelector('#deckWatch .dw-line').textContent), null, { timeout: 280000 });
  const line = await p.textContent('#deckWatch .dw-line'), spec = await p.evaluate(() => JSON.parse(document.querySelector('#deckWatch').dataset.spec || 'null'));
  check('it finds a win: "Fastest win vs <deck>: turn N" with Watch, and the button reads Again', !!spec && await p.isVisible('#deckWatch .dw-go') && /Again/.test(await p.textContent('#deckWatch .dw-find')), line);
  await p.reload(); await p.waitForFunction(() => document.querySelectorAll('#savedDecks option[value^="builtin:"]').length > 10, null, { timeout: 30000 });
  await p.fill('#deckText', fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8')); await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForSelector('#deckWatch:not([hidden])', { timeout: 20000 });
  check('after a reload and loading the same deck again, the found win is still there', await p.textContent('#deckWatch .dw-line') === line && await p.isVisible('#deckWatch .dw-go'), await p.textContent('#deckWatch .dw-line'));
  await p.click('#deckWatch .dw-go');
  await p.waitForFunction(() => document.body.dataset.view === 'duel', null, { timeout: 60000 });
  await p.waitForSelector('.vs-dice', { timeout: 60000 });
  check('Watch opens Duel on the dice roll with the pasted deck as seat 0', true);
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.over; }, null, { timeout: 180000 });
  const r = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return { w: g.match.winner, t: g.games[0].turn, first: g.match.order[0].pid }; });
  check('the game ends with this deck winning on the found turn', r.w === 0 && r.t === spec.turn && r.first === spec.first, JSON.stringify({ r, turn: spec.turn, first: spec.first }));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
