// T-079: a permanent that lets you look at the top card of your library any time (Mystic Forge...) shows that card face up on its owner's side of the
// table and keeps it up to date; the other player in Duel still sees a card back; "play with the top card revealed" (Courser of Kruphix) shows it to
// everyone. An explorer's revealed card is flashed on the table for the other players. Practice, Duel; desktop and phone.
const { pin } = require('../ui-seed');
const { chromium, devices } = require('playwright');
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const DECK = ['1 Mystic Forge', '1 Courser of Kruphix', '1 Spyglass Siren', '36 Forest', '4 Island'].join('\n');
(async () => {
  const b = await chromium.launch();
  for (const [name, opts] of [['PC', { viewport: { width: 1360, height: 1000 } }], ['iPhone', devices['iPhone 13']]]) {
    const ctx = await b.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} localStorage.setItem('isf_dice', '0'); });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': 'goldfish-calc-test/0.1', 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8800/');
    await p.selectOption('#optFormat', '60');
    await p.fill('#deckText', DECK);
    await p.click('#loadDeck');
    await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
    await p.waitForTimeout(1500);
    // ---- Practice ----
    await p.click('[data-tab=table]');
    await p.waitForFunction(() => window.__isf.game, null, { timeout: 30000 });
    const put = n => p.evaluate(n => { const g = window.__isf.game, G = window.Goldfish; const k = g.library.findIndex(i => i.card.name === n), i = k >= 0 ? g.library.splice(k, 1)[0] : g.hand.find(x => x.card.name === n); const pm = G.enterWithTriggers(g, i, {}, []); pm.sick = false; return !!pm; }, n);
    const topInfo = () => p.evaluate(() => { const g = window.__isf.game, lt = document.querySelector('#zLibrary .lib-top'), e = lt && lt.querySelector('.mtg'); return { hidden: !lt || lt.hidden, shown: e ? e.dataset.iid : null, top: g.library[0] ? String(g.library[0].iid) : null, label: lt ? lt.textContent : '' }; });
    await p.click('#zLibrary .card-back'); await p.waitForTimeout(400);
    let t = await topInfo();
    check(`${name} Practice: no card is shown on top of the library without Mystic Forge`, t.hidden && !t.shown, JSON.stringify(t));
    await put('Mystic Forge'); await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
    t = await topInfo();
    check(`${name} Practice: with Mystic Forge in play the top card is shown face up`, !t.hidden && t.shown && t.shown === t.top && /Top card/.test(t.label), JSON.stringify(t));
    const before = t.top; await p.click('#zLibrary .card-back'); await p.waitForTimeout(500);
    t = await topInfo();
    check(`${name} Practice: it follows the library when a card is drawn`, t.shown && t.shown === t.top && t.top !== before, JSON.stringify(t));
    // ---- Duel ----
    await p.click('[data-tab=duel]');
    await p.selectOption('#tab-duel .vs-opp', '');
    await pin(p);          // T-138: the same Duel opening on every run
    await p.click('#tab-duel .vs-new');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000 });
    await p.click('#tab-duel .vs-keep');
    await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g.phase === 'main'; }, null, { timeout: 90000 }).catch(() => {});
    const duelPut = (pid, n) => p.evaluate(([pid, n]) => { const g = window.__isfVersus.duel.game.games[pid], G = window.Goldfish; const card = g.deck.unique.find(c => c.name === n); const pm = G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []); pm.sick = false; window.__isfVersus.redraw('duel'); return !!pm; }, [pid, n]);
    const piles = () => p.evaluate(() => [...document.querySelectorAll('#tab-duel .vs-pile.lib')].map(e => ({ pid: e.dataset.pid, open: e.classList.contains('top-open'), back: !!e.querySelector('.card-back') })));
    const openPile = pid => p.waitForFunction(x => { const e = document.querySelector('#tab-duel .vs-pile.lib[data-pid="' + x + '"]'); return !!e && e.classList.contains('top-open'); }, pid, { timeout: 8000, polling: 100 }).catch(() => {});          // the table is drawn on the game's own schedule: wait for the pile, then check (a pile that never opens still fails the check)
    let pl = await piles();
    check(`${name} Duel: nobody's library top is shown at the start`, pl.length === 2 && pl.every(x => !x.open && x.back), JSON.stringify(pl));
    await duelPut(0, 'Mystic Forge'); await p.waitForTimeout(400); await openPile('0');
    pl = await piles(); const mine = pl.find(x => x.pid === '0'), theirs = pl.find(x => x.pid === '1');
    check(`${name} Duel: your Mystic Forge shows your top card face up`, mine && mine.open && !mine.back, JSON.stringify(pl));
    check(`${name} Duel: the opponent's library stays a card back to you (they have no Mystic Forge)`, theirs && !theirs.open && theirs.back, JSON.stringify(theirs));
    await duelPut(1, 'Courser of Kruphix'); await p.waitForTimeout(400); await openPile('1');
    pl = await piles(); const theirs2 = pl.find(x => x.pid === '1');
    check(`${name} Duel: a revealed top card (Courser of Kruphix) is open to everyone`, theirs2 && theirs2.open && !theirs2.back, JSON.stringify(pl));
    // ---- explore: the revealed card is flashed to the other players ----
    const exp = await p.evaluate(() => {
      const G = window.Goldfish, g = window.__isfVersus.duel.game.games[1], card = g.deck.unique.find(c => c.name === 'Spyglass Siren');
      G.enterWithTriggers(g, { iid: g.nextIid++, card }, {}, []);
      const pm = g.battlefield.find(q => q.card.name === 'Spyglass Siren'), ev = [];
      G.applyEffects(g, [{ type: 'exploreSelf' }], pm, ev, null);
      window.__isfVersus.flashReveals(g, ev, 0); window.__isfVersus.flashReveals(g, ev, 0);
      return { evs: ev.filter(e => e.type === 'reveal').length, shown: document.querySelectorAll('.vs-reveal').length, cap: (document.querySelector('.vs-reveal-cap') || {}).textContent };
    });
    check(`${name} Duel: the opponent's explore reveal is flashed on the table (once)`, exp.evs >= 1 && exp.shown === 1 && /explores: reveals/.test(exp.cap || ''), JSON.stringify(exp));
    const self = await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[1], ev = [{ type: 'reveal', inst: g.library[0], source: null, pid: 1 }]; const n0 = document.querySelectorAll('.vs-reveal').length; window.__isfVersus.flashReveals(g, ev, 1); return document.querySelectorAll('.vs-reveal').length - n0; });
    check(`${name} Duel: the explorer does not get the flash (they have the question)`, self === 0, self);
    await p.waitForTimeout(3300);
    check(`${name} Duel: the flash goes away by itself`, (await p.$$('.vs-reveal')).length === 0);
    check(`${name}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
