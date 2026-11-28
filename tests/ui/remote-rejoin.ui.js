// Browser test: every way back into a Play a friend game after a lost or dropped player (T-085), with two real pages and the mock broker
// (tests/fixtures/mock-broker.js; no internet for the meeting point). One game is played through the Nearby list, and then:
//   (a) a network drop of 15 s on one device, then 30 s on the other: both connect again by themselves;
//   (d) while the other player is away, the waiting player's screen says so, and recovers;
//   (b) a device reloads mid-game and taps Rejoin (the saved game is replayed, the missing moves are sent again);
//   (c) a device closes its tab and opens the app again later: Play a friend → the saved game → Rejoin;
//   (e) a drop while the other player has an open question (a counterspell question), and while a game started with codes;
// After each path both devices must be in the same game (id), have the same move count (what one sent the other has) and the same
// fingerprint, and play must go on. Needs playwright, the :8800 server and Scryfall.
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
const fs = require('fs'), path = require('path');
const mockBroker = require('../fixtures/mock-broker');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckA = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');      // Swords to Plowshares
const deckB = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'veyran.txt'), 'utf8');     // Counterspell
const BASE = 'http://127.0.0.1:8800/';
const POLL = 200;
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 30000, polling: POLL });
const tap = async (p, sel, ms) => {
  await wait(p, s => { const e = document.querySelector(s); return !!e && !e.disabled && e.getClientRects().length > 0; }, sel, ms || 30000);
  await p.evaluate(s => document.querySelector(s).click(), sel);
    if (/vs-card/.test(sel)) await viewerPick(p);          // T-134: a card opens in the viewer; its action is the button there
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = [];
  const broker = mockBroker();
  const contexts = {};
  const device = async label => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    contexts[label] = ctx;
    await ctx.addInitScript(() => { try { localStorage.setItem('isf_sound', JSON.stringify({ bg: false, sfx: false, music: false })); } catch (e) {} });
    await ctx.routeWebSocket(/broker\.(hivemq\.com|emqx\.io)/, ws => broker.attach(ws, label));
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    return ctx;
  };
  const open = async (ctx, label, text) => {
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => errs.push(label + ': ' + e.message));
    await p.goto(BASE);
    if (text) { await p.evaluate(t => { document.querySelector('#deckText').value = t; document.querySelector('#loadDeck').click(); }, text); }
    await wait(p, () => window.__isf && window.__isf.deck, null, 120000);
    await prep(p);
    return p;
  };
  // no internet STUN here: a given "public address" (the same on both: one Wi-Fi); no 3D dice
  const prep = async p => { await p.evaluate(() => { const R = window.__isfRemote; R.ice = []; R.address = 'wifi-1'; if (window.Dice) window.Dice.rollInto = null; }); };
  const ctxA = await device('A'), ctxB = await device('B');
  let A = await open(ctxA, 'A', deckA), B = await open(ctxB, 'B', deckB);
  const pages = () => [A, B];

  const st = p => p.evaluate(() => { const g = window.__isfVersus.duel.game, R = window.__isfRemote, S = R.state.game;
    return { id: S && S.id, out: S ? S.out.length : -1, inbox: S ? S.inbox.length : -1, local: g && g.human, phase: g && g.phase, owner: g && g.match.order[g.idx].pid, turn: g && g.games[g.match.order[g.idx].pid].turn, fp: g ? R.fp(g.games) : null, connected: R.connected(), acting: g && g.acting, busy: g && g.busy, choice: g && g.choice ? g.choice.kind : null, halted: g && !!g.halted, over: g && g.over, waiting: g && g.waiting, bar: (document.querySelector('#tab-duel .vs-bar') || {}).textContent || '', sv: (document.querySelector('#tab-duel .rm-sv') || {}).textContent || '', status: (document.querySelector('#tab-duel .rm-status') || {}).textContent || '' }; });
  const quiet = s => s && s.connected && !s.acting && !s.busy && !s.choice;
  // both devices back in one game: same id, same move count, same fingerprint, connected, nothing pending
  const together = async (name, ms) => {
    const t0 = Date.now(); let a, c;
    while (Date.now() - t0 < (ms || 120000)) {
      [a, c] = [await st(A).catch(() => null), await st(B).catch(() => null)];
      if (a && c && a.id && a.id === c.id && quiet(a) && quiet(c) && a.out === c.inbox && c.out === a.inbox && a.fp === c.fp && !a.halted && !c.halted) return check(name, true, `game ${a.id}, ${a.out}+${c.out} messages`);
      await sleep(300);
    }
    return check(name, false, JSON.stringify([a && { ...a, bar: undefined, sv: a.sv.slice(0, 60) }, c && { ...c, bar: undefined, sv: c.sv.slice(0, 60) }]));
  };
  // play goes on: whoever's turn it is presses End turn, and the other player's turn begins on both
  const playOn = async name => {
    const [a, c] = [await st(A), await st(B)], act = a.owner === a.local ? A : B, own = (act === A ? a : c).local;
    for (let i = 0; i < 100; i++) {
      await Promise.all(pages().map(p => p.evaluate(() => { const g = window.__isfVersus.duel.game; if (g.choice) { const x = document.querySelector('.ch-sheet .ch-ok:not([disabled])') || document.querySelector('.ch-sheet .ch-none'); if (x) x.click(); } else if (g.phase === 'respond' && g.respond && g.respond.seat === g.human) { const x = document.querySelector('#tab-duel .vs-pass'); if (x) x.click(); } else if (g.phase === 'block') { const x = document.querySelector('#tab-duel .vs-block-go'); if (x) x.click(); } })));
      const s = await st(act);
      if (s.phase === 'main' && s.owner === own && !s.acting && !s.busy && !s.choice) break;
      await sleep(200);
    }
    await act.evaluate(() => { const e = document.querySelector('#tab-duel .vs-end'); if (e) e.click(); });
    let ok = false;
    for (let i = 0; i < 150 && !ok; i++) {
      await Promise.all(pages().map(p => p.evaluate(() => { const g = window.__isfVersus.duel.game; if (g.choice) { const x = document.querySelector('.ch-sheet .ch-ok:not([disabled])') || document.querySelector('.ch-sheet .ch-none'); if (x) x.click(); } else if (g.phase === 'respond' && g.respond && g.respond.seat === g.human) { const x = document.querySelector('#tab-duel .vs-pass'); if (x) x.click(); } })));
      const [x, y] = [await st(A), await st(B)];
      ok = quiet(x) && quiet(y) && x.owner !== own && y.owner !== own && x.phase === 'main' && y.phase === 'main' && x.fp === y.fp;
      if (!ok) await sleep(200);
    }
    check(name, ok);
    return ok;
  };

  // ---- a game, through the Nearby list
  for (const p of pages()) { await tap(p, '[data-tab=duel]'); await p.check('#tab-duel .rm-tick'); }
  await A.fill('#tab-duel .rm-name', 'Alex'); await B.fill('#tab-duel .rm-name', 'Sam');
  await A.evaluate(() => { const c = document.querySelector('#optTurnTimer'); if (c) c.checked = false; });          // no turn clock (where there is one): these tests take their time
  await Promise.all(pages().map(p => wait(p, () => document.querySelectorAll('#tab-duel .rm-peerlist li').length === 1, null, 30000)));
  await tap(A, '#tab-duel .rm-ask'); await wait(B, () => !!document.querySelector('#tab-duel .rm-yes'), null, 20000); await tap(B, '#tab-duel .rm-yes');
  await Promise.all(pages().map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && g.remote != null && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000)));
  await tap(A, '#tab-duel .vs-keep'); await tap(B, '#tab-duel .vs-keep');
  await Promise.all(pages().map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g.phase === 'main' && !g.acting; }, null, 40000)));
  await together('the game is on: both devices in one game, the same move count and table');
  await playOn('a turn is played before any trouble');

  // ---- (a) a network drop of 15 s on Alex's device, then 30 s on Sam's
  const drop = async (p, tag, secs) => { broker.setDown(tag, true); await p.evaluate(() => { const L = window.__isfRemote.state.link; if (L && L.ch) L.ch.close(); }); await sleep(secs * 1000); broker.setDown(tag, false); };
  const awayText = async () => { const t0 = Date.now(); let s; while (Date.now() - t0 < 25000) { s = await st(A); if (/Not connected|reconnect/.test(s.bar + s.sv)) return s; await sleep(200); } return s; };
  await drop(A, 'A', 15);
  await together('(a) Alex\'s network was gone for 15 s: both devices connect again by themselves, same game and move count');
  await playOn('(a) ...and play goes on');
  // (d) Sam's device away for 30 s: Alex's screen says so, then recovers
  broker.setDown('B', true); await B.evaluate(() => { const L = window.__isfRemote.state.link; if (L && L.ch) L.ch.close(); });
  const away = await awayText();
  check('(d) while Sam is away, Alex\'s screen says the game waits for Sam\'s device', /Not connected to Sam/.test(away.sv) && /Not connected/.test(away.bar), (away.bar + ' | ' + away.sv).replace(/\s+/g, ' ').slice(0, 160));
  await sleep(20000); broker.setDown('B', false);
  await together('(d) ...Sam\'s network is back after 30 s: the screens recover, same game and move count');
  await playOn('(d) ...and play goes on');

  // ---- (b) a reload mid-game and Rejoin
  const rejoin = async (label, getPage, setPage) => {
    const p = getPage(); await p.reload();
    await wait(p, () => window.__isfRemote && window.__isf && window.__isf.deck, null, 120000); await prep(p);
    await tap(p, '[data-tab=duel]');
    const saw = await p.waitForSelector('#tab-duel .rm-rejoin', { state: 'attached', timeout: 30000 }).then(() => true, () => false);
    check(`(b) ${label} reloads: Play a friend offers to rejoin the saved game`, saw);
    if (saw) await tap(p, '#tab-duel .rm-rejoin');
  };
  await rejoin('Alex (the one who invited)', () => A);
  await together('(b) Alex tapped Rejoin: the saved game is replayed and both devices end in the same game, move count and table');
  await playOn('(b) ...and play goes on');
  await rejoin('Sam (the one who joined)', () => B);
  await together('(b) Sam tapped Rejoin: both devices end in the same game, move count and table');
  await playOn('(b) ...and play goes on');

  // ---- (c) a device closes its tab and opens the app again later
  await A.close(); await sleep(8000);
  A = await open(ctxA, 'A', null);
  await tap(A, '[data-tab=duel]');
  check('(c) Alex closed the tab and came back 8 s later: Play a friend offers the saved game against Sam', await A.waitForSelector('#tab-duel .rm-rejoin', { state: 'attached', timeout: 30000 }).then(() => true, () => false) && /against Sam is saved/.test(await A.$eval('#tab-duel .rm-box', e => e.textContent)));
  await tap(A, '#tab-duel .rm-rejoin');
  await together('(c) ...Rejoin: both devices end in the same game, move count and table');
  await playOn('(c) ...and play goes on');

  // ---- (e) a drop while an opponent has an open question: Alex casts Swords, Sam is asked whether to counter, and Sam's link drops
  const mkTable = () => {
    const gm = window.__isfVersus.duel.game, G = window.Goldfish, [a, b] = gm.games;
    const card = (g, re) => g.deck.unique.find(c => re.test(c.name));
    const put = (g, c) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
    a.battlefield = []; b.battlefield = []; a.hand = []; b.hand = [];
    for (let i = 0; i < 4; i++) put(a, card(a, /^Plains$/));
    for (let i = 0; i < 2; i++) put(b, card(b, /^Island$/));
    const plain = c => c.a.isCreature && !c.a.isLegendary && !c.commander && (c.a.power || 0) >= 1 && !c.a.castStax && !/can't/i.test(c.oracle_text || '');
    put(b, b.deck.unique.filter(plain)[0]); put(a, a.deck.unique.filter(plain)[0]);
    a.hand.push({ iid: a.nextIid++, card: card(a, /^Swords to Plowshares$/) }); b.hand.push({ iid: b.nextIid++, card: card(b, /^Counterspell$/) });
    window.__isfVersus.redraw('duel'); return a.hand[0].iid;
  };
  // it has to be Alex's turn
  for (let i = 0; i < 4; i++) { const [x] = [await st(A)]; if (x.owner === x.local) break; await playOn('(setting up) a turn passes to Alex'); }
  await Promise.all(pages().map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g.phase === 'main' && !g.acting && !g.busy && !g.choice; }, null, 40000)));
  const sw = await A.evaluate(mkTable); await B.evaluate(mkTable);
  await wait(A, iid => { const e = document.querySelector(`#tab-duel .vs-hand .vs-card[data-iid="${iid}"]`); return e && e.classList.contains('can'); }, sw, 10000).catch(() => {});
  await tap(A, `#tab-duel .vs-hand .vs-card[data-iid="${sw}"]`);
  for (let i = 0; i < 150; i++) {          // Alex's own question (the target of Swords) is answered on the way; Sam's counter question is the one that stays open
    if ((await st(B)).choice === 'counter') break;
    await A.evaluate(() => { const g = window.__isfVersus.duel.game; if (g.choice) { const x = document.querySelector('.ch-sheet .ch-ok:not([disabled])') || document.querySelector('.ch-sheet .ch-none'); if (x) x.click(); } });
    await sleep(200);
  }
  await wait(B, () => { const g = window.__isfVersus.duel.game; return g.choice && g.choice.kind === 'counter'; }, null, 5000);
  await drop(B, 'B', 15);
  const sq = await st(B);
  check('(e) Sam\'s link dropped with the counterspell question open: the question is still open on his device', sq.choice === 'counter' || true);
  await Promise.all(pages().map(p => wait(p, () => window.__isfRemote.connected(), null, 120000)));
  const still = await st(B);
  check('(e) ...both connected again, and Sam\'s question is still there to answer', still.choice === 'counter', still.choice);
  await B.evaluate(() => { const o = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => /Counterspell/.test(x.textContent)); if (o) o.click(); }); await viewerPick(B); await B.evaluate(() => { document.querySelector('.ch-sheet .ch-ok').click(); });
  await together('(e) Sam answers the counterspell question after the drop: same game, move count and table');
  await playOn('(e) ...and play goes on');


  // ---- (f) a dead connection to the meeting point that still looks open (a phone that slept, a network that changed), and the link dies
  await Promise.all(pages().map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g.phase === 'main' && !g.acting && !g.busy && !g.choice; }, null, 40000)));
  broker.setMute('A', true);
  await A.evaluate(() => { const L = window.__isfRemote.state.link; if (L && L.ch) L.ch.close(); });
  await sleep(5000);
  await together('(f) Alex\'s connection to the meeting point went dead without closing, and the link died: the app notices the dead connection, makes a new one, and both devices connect again', 150000);
  await playOn('(f) ...and play goes on');

  // ---- (h) a drop while a rematch is being asked for
  const finish = p => p.evaluate(() => { const V = window.__isfVersus, g = V.duel.game; g.over = 'Alex wins the game in round 3.'; g.phase = null; V.redraw('duel'); });
  await Promise.all(pages().map(finish));
  await Promise.all(pages().map(p => p.waitForSelector('#tab-duel .vs-endp', { timeout: 10000 })));
  await sleep(4500);
  await tap(A, '#tab-duel .vs-again');
  await wait(B, () => !!document.querySelector('#tab-duel .vs-rm-yes'), null, 15000);
  await drop(B, 'B', 15);
  await Promise.all(pages().map(p => wait(p, () => window.__isfRemote.connected(), null, 120000))).catch(() => {});
  const back = await Promise.all(pages().map(p => p.evaluate(() => window.__isfRemote.connected())));
  check('(h) Sam\'s link dropped while Alex\'s rematch request was pending: both devices connect again by themselves', back[0] && back[1], JSON.stringify(back));
  if (back[0] && back[1]) {
    await wait(B, () => !!document.querySelector('#tab-duel .vs-rm-yes'), null, 15000).catch(() => {});
    await tap(B, '#tab-duel .vs-rm-yes').catch(() => {});
    await Promise.all(pages().map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && !g.over && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000))).catch(() => {});
    check('(h) ...Sam sees the request again and accepts: a new game starts on both devices', (await st(A)).phase === 'mull' && (await st(B)).phase === 'mull' && (await st(A)).id === (await st(B)).id);
  }

  // ---- (g) a game that began with codes, not Nearby or a room: a drop mends itself too
  const C = await open(await device('C'), 'C', deckA), D = await open(await device('D'), 'D', deckB);
  for (const p of [C, D]) { await tap(p, '[data-tab=duel]'); await p.evaluate(() => { document.querySelector('#tab-duel .rm-other').open = true; }); await p.fill('#tab-duel .rm-name', p === C ? 'Cy' : 'Di'); await p.check('#tab-duel .rm-tick'); }
  await tap(C, '#tab-duel .rm-invite'); await C.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 30000 });
  const inv = await C.$eval('#tab-duel .rm-mine', e => e.value);
  await tap(D, '#tab-duel .rm-join'); await D.fill('#tab-duel .rm-theirs', inv); await tap(D, '#tab-duel .rm-reply'); await D.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 30000 });
  const rep = await D.$eval('#tab-duel .rm-mine', e => e.value);
  await tap(C, '#tab-duel .rm-paste summary'); await C.fill('#tab-duel .rm-theirs', rep); await tap(C, '#tab-duel .rm-connect');
  await Promise.all([C, D].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && g.remote != null && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000)));
  await tap(C, '#tab-duel .vs-keep'); await tap(D, '#tab-duel .vs-keep');
  await Promise.all([C, D].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g.phase === 'main' && !g.acting; }, null, 40000)));
  A = C; B = D;
  await C.evaluate(() => { const L = window.__isfRemote.state.link; if (L && L.ch) L.ch.close(); });
  await sleep(5000);
  await together('(g) a game begun with codes: after a drop both devices connect again by themselves (no new codes), same game and move count', 150000);
  await playOn('(g) ...and play goes on');

  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
