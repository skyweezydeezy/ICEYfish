// Browser test: how "Play a friend" finds a friend with no codes (remote.js): Nearby, room names, automatic reconnect, no false drops, the
// screen wake lock. The meeting point (a public MQTT broker over WebSocket) is a local mock (tests/fixtures/mock-broker.js) that Playwright
// puts in place of broker.hivemq.com and broker.emqx.io, so no internet is used for it; Scryfall is still needed for the decks.
// Pair 1 (same public address): the Nearby list shows the friend and not a stranger behind another address, a request is declined,
// then accepted, and the game starts; the channel is killed and both devices connect again by themselves (also when the meeting point
// dropped them in between); a short silence is not a lost connection; the wake lock is taken, let go in the background and taken again.
// Pair 2 (different addresses, the first broker down): the same room word typed differently finds the friend through the second broker.
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
const fs = require('fs'), path = require('path');
const mockBroker = require('../fixtures/mock-broker');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckA = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
const deckB = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'veyran.txt'), 'utf8');
const BASE = 'http://127.0.0.1:8800/';
const POLL = 200;
const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms || 30000, polling: POLL });
const tap = async (p, sel, ms) => {
  await wait(p, s => { const e = document.querySelector(s); return !!e && !e.disabled && e.getClientRects().length > 0; }, sel, ms || 30000);
  await p.evaluate(s => document.querySelector(s).click(), sel);
    if (/vs-card/.test(sel)) await viewerPick(p);          // T-134: a card opens in the viewer; its action is the button there
};

(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = [];
  // a device: its own storage; the brokers' addresses answered by the mock; a stand-in for the screen wake lock that counts its calls
  const device = async (label, broker, down) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => {
      try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); s.bg = false; s.sfx = false; s.music = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } catch (e) {}
      window.__wl = { requests: 0, releases: 0, live: 0 };
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        const l = new EventTarget(); window.__wl.requests++; window.__wl.live++;
        l.release = async () => { window.__wl.releases++; window.__wl.live--; l.dispatchEvent(new Event('release')); };
        return l; } } });
    });
    await ctx.routeWebSocket(/broker\.hivemq\.com/, ws => { if (down) ws.close({ code: 1011 }); else broker.attach(ws); });
    await ctx.routeWebSocket(/broker\.emqx\.io/, ws => broker.attach(ws));
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(label + ': ' + e.message));
    p.label = label;
    return p;
  };
  const load = async (p, text, address) => {
    await p.goto(BASE);
    if (text) {
      await p.evaluate(t => { document.querySelector('#deckText').value = t; document.querySelector('#loadDeck').click(); }, text);
      await wait(p, () => window.__isf && window.__isf.deck, null, 120000);
    } else await wait(p, () => window.__isfRemote, null, 60000);
    // no internet STUN here: the "public address" is given, as the STUN reply would give it; and no 3D dice for the roll for first
    await p.evaluate(a => { const R = window.__isfRemote; R.ice = []; R.address = a; if (window.Dice) window.Dice.rollInto = null; }, address);
    await tap(p, '[data-tab=duel]');
  };
  const near = p => p.$$eval('#tab-duel .rm-peerlist li', l => l.map(e => e.querySelector('.rm-pname').textContent));
  const text = (p, sel) => p.$eval(sel, e => e.textContent);
  const st = p => p.evaluate(() => { const g = window.__isfVersus.duel.game, R = window.__isfRemote; return g ? { local: g.human, phase: g.phase, fp: R.fp(g.games), connected: R.connected(), names: g.match.names, acting: g.acting, busy: g.busy } : null; });
  const linked = p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && g.remote != null && window.__isfRemote.connected(); }, null, 40000);

  // ================= pair 1: Nearby =================
  const broker = mockBroker();
  const A = await device('A', broker), B = await device('B', broker), C = await device('C (stranger)', broker);
  await Promise.all([load(A, deckA, 'wifi-1'), load(B, deckB, 'wifi-1'), load(C, null, 'wifi-2')]);
  await A.fill('#tab-duel .rm-name', 'Alex'); await B.fill('#tab-duel .rm-name', 'Sam'); await C.fill('#tab-duel .rm-name', 'Cy');
  check('before the list of what is shared is accepted there is no Nearby list and nothing is announced', await A.$eval('#tab-duel .rm-near', e => e.hidden) && broker.log.length === 0 && broker.count() === 0);
  check('the list of what is shared is version 5 and names the meeting point, the address and who can see the name',
    await A.evaluate(() => { const R = window.__isfRemote, t = R.DISCLOSURE.join(' '); return R.DISCLOSURE_VERSION === 5 && /broker\.hivemq\.com/.test(t) && /broker\.emqx\.io/.test(t) && /same Wi-Fi/.test(t) && /same room name/.test(t) && /Nothing starts until you accept/.test(t); }));
  for (const p of [A, B, C]) await p.check('#tab-duel .rm-tick');
  await wait(A, () => document.querySelectorAll('#tab-duel .rm-peerlist li').length === 1, null, 20000);
  await wait(B, () => document.querySelectorAll('#tab-duel .rm-peerlist li').length === 1, null, 20000);
  check('Alex sees Sam under Nearby, and Sam sees Alex: no code, no link', (await near(A)).join() === 'Sam' && (await near(B)).join() === 'Alex' && !(await A.$('#tab-duel .rm-mine')));
  check('a stranger behind another address sees no one, and no one sees them', (await near(C)).length === 0 && !(await near(A)).includes('Cy'));
  check('Nearby is the whole screen to start: the codes are folded under "Other ways to connect"', await A.$eval('#tab-duel .rm-other', e => !e.open && /Other ways to connect/.test(e.textContent)));
  const topics = [...new Set(broker.log.map(m => m.topic))];
  check('the topic is a hash: it does not contain the address, and the two Wi-Fi networks have different topics', topics.length === 2 && topics.every(t => /^isf5\/[0-9a-f]{40}$/.test(t) && !/wifi/.test(t)), topics.join(' '));

  // a request declined
  await tap(A, '#tab-duel .rm-ask');
  await wait(B, () => /Alex wants to play\. Accept\?/.test(document.querySelector('#tab-duel .rm-incoming').textContent), null, 20000);
  check('Sam is asked "Alex wants to play. Accept?", with Accept and Decline', await B.$eval('#tab-duel .rm-incoming', e => /Alex wants to play\. Accept\?/.test(e.textContent) && !!e.querySelector('.rm-yes') && !!e.querySelector('.rm-no')));
  check('...a stranger is not asked', (await text(C, '#tab-duel .rm-incoming')) === '');
  await tap(B, '#tab-duel .rm-no');
  await wait(A, () => /Sam said no/.test(document.querySelector('#tab-duel .rm-status').textContent), null, 20000);
  check('Decline: Alex is told, and no game starts', !(await st(A)) && !(await st(B)) && (await B.$eval('#tab-duel .rm-incoming', e => e.textContent)) === '');

  // messages that are not addressed to this device are not acted on
  await A.evaluate(() => window.__isfRemote.M.topic).then(t => { broker.inject(t, { t: 'ask', id: 'feedfacefeedface', name: 'Evil', deck: '' }); broker.inject(t, { t: 'ask', id: 'feedfacefeedface', to: 'someoneelse', name: 'Evil', deck: '' }); broker.inject(t, { t: 'offer', id: 'feedfacefeedface', code: 'x' }); });
  await B.waitForTimeout(800);
  check('an ask with no addressee, or for another device, shows nothing and starts nothing', (await text(B, '#tab-duel .rm-incoming')) === '' && !(await st(B)));
  // a request accepted
  await tap(A, '#tab-duel .rm-ask');
  await wait(B, () => !!document.querySelector('#tab-duel .rm-yes'), null, 20000);
  await tap(B, '#tab-duel .rm-yes');
  await Promise.all([A, B].map(linked));
  await Promise.all([A, B].map(p => wait(p, () => window.__isfVersus.duel.game.phase === 'mull', null, 30000)));
  const [a0, b0] = [await st(A), await st(B)];
  check('Accept: both devices connect and start the game, Alex (who asked) in seat 0 and Sam in seat 1, with no code typed or scanned', a0.local === 0 && b0.local === 1 && a0.names.join() === 'Alex,Sam' && a0.fp === b0.fp && !(await A.$('#tab-duel .rm-mine')));
  const bad = broker.log.filter(m => { let j; try { j = JSON.parse(m.payload); } catch (e) { return true; } return !['here', 'gone', 'ask', 'yes', 'no', 'offer', 'answer', 'again'].includes(j.t) || /Swords to Plowshares|Counterspell|"seed"|"cards"|"act"/.test(m.payload); });
  check('only the setup went through the meeting point: names, deck names, offer and answer; no deck, seed or move', bad.length === 0, bad.slice(0, 2).map(m => m.payload.slice(0, 80)).join(' | '));
  const nearlyGone = await A.evaluate(() => ({ visible: window.__isfRemote.M.visible }));
  check('a device in a game is off the Nearby list', nearlyGone.visible === false && !(await near(C)).length);
  const noAuto = p => p.evaluate(() => ({ mullAuto: !!document.querySelector('#tab-duel .vs-mull-auto'), autoTurn: !!document.querySelector('#tab-duel .vs-autoturn'), speed: !!document.querySelector('#tab-duel .speed-bar') && document.querySelector('#tab-duel .speed-bar').getClientRects().length > 0, keep: !!document.querySelector('#tab-duel .vs-keep'),
    ask: document.querySelector('#tab-duel .vs-ask select') && document.querySelector('#tab-duel .vs-ask select').value }));
  const na = [await noAuto(A), await noAuto(B)];
  check('Play a friend, opening hands: no "Let the autopilot decide" and no autopilot speed slider on either page (Keep is there)', na.every(x => !x.mullAuto && !x.speed && x.keep), JSON.stringify(na));
  await A.evaluate(() => { document.querySelector('#tab-duel select.vs-ask').value = 'auto'; });          // "My choices: Autopilot decides" no longer reaches a game against a person
  await tap(A, '#tab-duel .vs-mull'); await A.waitForTimeout(300); await tap(A, '#tab-duel .vs-keep');

  // the wake lock
  const wl = p => p.evaluate(() => Object.assign({}, window.__wl));
  const w1 = await Promise.all([A, B].map(wl));
  check('a game takes the screen wake lock on both devices, once', w1.every(w => w.requests === 1 && w.live === 1), JSON.stringify(w1));
  const hide = (p, on) => p.evaluate(on => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => on }); document.dispatchEvent(new Event('visibilitychange')); }, on);
  await hide(A, true); await A.waitForTimeout(300);
  const w2 = await wl(A);
  check('...let go when the tab goes to the background', w2.live === 0 && w2.releases === 1, JSON.stringify(w2));
  check('...and while it is in the background the link is not judged by silence: 3 minutes of quiet is not "gone"',
    await A.evaluate(() => { const S = window.__isfRemote.state; S.lastSeen = Date.now() - 180000; return window.__isfRemote.connected(); }));
  await hide(A, false); await A.waitForTimeout(500);
  const w3 = await wl(A);
  check('...and taken again when it comes back (it does not have to be started again)', w3.live === 1 && w3.requests === 2, JSON.stringify(w3));
  check('a tab that just came back is given a moment to hear the other device before it counts as quiet (20 s of silence, 8 s after coming back)',
    await A.evaluate(() => { const S = window.__isfRemote.state; S.lastSeen = Date.now() - 200000; return window.__isfRemote.connected(); }));
  const short = await A.evaluate(() => { const S = window.__isfRemote.state; S.grace = 0; S.lastSeen = Date.now() - 20000; const a = window.__isfRemote.connected(); S.lastSeen = Date.now() - S.silentMs - 3000; const c = window.__isfRemote.connected(); S.lastSeen = Date.now(); return [a, c]; });
  check('a visible tab treats 20 s of silence as still connected, and only a long one as lost', short[0] === true && short[1] === false, short.join());
  await B.evaluate(() => { const S = window.__isfRemote.state; S.peerHidden = false; });

  // the channel is killed: both devices connect again by themselves
  const linkBefore = await A.evaluate(() => (window.__isfRemote.state.link.__id = Math.random()));
  const gameBefore = await A.evaluate(() => window.__isfRemote.state.game.id);
  await A.evaluate(() => window.__isfRemote.state.link.ch.close());
  await Promise.all([A, B].map(p => wait(p, () => !window.__isfRemote.connected(), null, 20000)));
  check('the channel is killed: both devices notice and say the game waits', /Not connected/.test(await text(A, '#tab-duel .rm-sv')) && /Not connected/.test(await text(B, '#tab-duel .rm-sv')));
  check('...and say they connect again by themselves', /connect again by themselves/.test(await text(A, '#tab-duel .rm-sv')));
  await Promise.all([A, B].map(p => wait(p, () => window.__isfRemote.connected(), null, 60000)));
  const [a1, b1] = [await st(A), await st(B)];
  check('both devices connect again with no action: the same game, the same table', (await A.evaluate(() => window.__isfRemote.state.game.id)) === gameBefore && a1.fp === b1.fp && !(await A.$('#tab-duel .rm-mine')));
  check('...and a new link was made through the same topic', await A.evaluate(id => window.__isfRemote.state.link.__id !== id, linkBefore));
  await tap(B, '#tab-duel .vs-keep');
  await Promise.all([A, B].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g.phase === 'main' && !g.acting && !g.busy; }, null, 40000)));
  const [a2, b2] = [await st(A), await st(B)];
  check('the game goes on after the automatic reconnect: both kept, the same table, no device stopped it', a2.fp === b2.fp && a2.phase === 'main');
  const sheet = await A.evaluate(async () => {
    const C = window.__isfChoices, mk = extra => Object.assign({ kind: 'target', title: 'Pick', text: 'Pick one', options: [{ name: 'Alpha' }, { name: 'Beta' }], def: [0], sig: 'x', seat: 0, max: 1 }, extra);
    const out = {};
    C.ask(mk({ noAuto: true })).catch(() => {}); out.remote = { auto: !!document.querySelector('.ch-sheet .ch-auto'), star: !!document.querySelector('.ch-sheet .ch-star'), ok: !!document.querySelector('.ch-sheet .ch-ok') };
    C.close();
    C.ask(mk({})).catch(() => {}); out.local = { auto: !!document.querySelector('.ch-sheet .ch-auto'), star: !!document.querySelector('.ch-sheet .ch-star') };
    C.close(); return out;
  });
  check('a choice sheet in a game against a person has no "Let the autopilot decide" and no ★ autopilot mark (a local one still has the button)', sheet.remote.ok && !sheet.remote.auto && !sheet.remote.star && sheet.local.auto, JSON.stringify(sheet));
  const na2 = [await noAuto(A), await noAuto(B)], mine = await Promise.all([A, B].map(p => p.evaluate(() => !!document.querySelector('#tab-duel .vs-end'))));
  check('...and in the main phase the player whose turn it is has End turn but no "Autopilot the rest of my turn", on either page', mine.some(Boolean) && na2.every(x => !x.autoTurn && !x.speed), JSON.stringify(na2) + ' ' + mine);

  // the meeting point drops everyone, and then the channel dies: still mended (the client reconnects to the broker itself)
  broker.dropAll();
  await wait(A, () => !window.__isfRemote.M.up, null, 10000);
  await A.evaluate(() => window.__isfRemote.state.link.ch.close());
  await Promise.all([A, B].map(p => wait(p, () => !window.__isfRemote.connected(), null, 20000)));
  await Promise.all([A, B].map(p => wait(p, () => window.__isfRemote.connected(), null, 90000)));
  const [a3, b3] = [await st(A), await st(B)];
  check('the meeting point dropped both devices and then the channel died: they still connect again by themselves', a3.fp === b3.fp && a3.connected && b3.connected);

  // a lost 'disconnected' that mends itself is not a loss; one that lasts is
  const mend = await A.evaluate(async () => {
    const R = window.__isfRemote, S = R.state, L = S.link, pc = L.pc; S.discGrace = 600;
    const ev = new Event('connectionstatechange');
    Object.defineProperty(pc, 'connectionState', { configurable: true, get: () => 'disconnected' }); pc.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 200));
    Object.defineProperty(pc, 'connectionState', { configurable: true, get: () => 'connected' }); pc.dispatchEvent(ev);
    await new Promise(r => setTimeout(r, 1000));
    return { lost: !!L.lost, connected: R.connected(), same: S.link === L };
  });
  check('"disconnected" that mends within the grace time is not treated as lost: the link and the game stay as they were', !mend.lost && mend.connected && mend.same, JSON.stringify(mend));

  // ---- the end of the game: rematch (declined, then accepted), change deck, leave
  const finish = p => p.evaluate(() => { const V = window.__isfVersus, g = V.duel.game; g.over = 'Alex wins the game in round 3.'; g.phase = null; V.redraw('duel'); });
  const gid = p => p.evaluate(() => window.__isfRemote.state.game.id);
  await Promise.all([A, B].map(finish));
  await Promise.all([A, B].map(p => p.waitForSelector('#tab-duel .vs-endp', { timeout: 10000 })));
  check('the game is over on both devices: each shows Play again, Change deck and Leave', await A.$eval('#tab-duel .vs-endp', e => e.querySelectorAll('button').length === 3) && await B.$eval('#tab-duel .vs-endp', e => /Play again/.test(e.textContent)));
  const idEnd = await gid(A);
  await tap(A, '#tab-duel .vs-again');
  await wait(B, () => /Alex wants a rematch/.test((document.querySelector('#tab-duel .vs-rmq') || {}).textContent || ''), null, 15000);
  check('Alex asks for a rematch: Sam sees "Alex wants a rematch. Accept?", and Alex is told to wait', /Accept\?/.test(await text(B, '#tab-duel .vs-rmq')) && /Waiting for Sam/.test(await text(A, '#tab-duel .vs-endp')));
  await tap(B, '#tab-duel .vs-rm-no');
  await wait(A, () => /said no to a rematch/.test(document.querySelector('#tab-duel .vs-endp').textContent), null, 15000);
  check('Sam declines: both stay on the panel, and Alex can ask again', (await gid(A)) === idEnd && await A.$eval('#tab-duel .vs-again', e => !e.disabled) && !(await B.$('#tab-duel .vs-rmq')));
  await tap(A, '#tab-duel .vs-again');
  await wait(B, () => !!document.querySelector('#tab-duel .vs-rm-yes'), null, 15000);
  await tap(B, '#tab-duel .vs-rm-yes');
  await Promise.all([A, B].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && !g.over && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000)));
  const [r0, r1] = [await st(A), await st(B)];
  check('Sam accepts: both devices deal a new game on the same connection (a new game id, one seed, the same table)', (await gid(A)) !== idEnd && (await gid(A)) === (await gid(B)) && r0.fp === r1.fp && !(await A.$('#tab-duel .rm-mine')));
  await Promise.all([A, B].map(finish));
  await Promise.all([A, B].map(p => p.waitForSelector('#tab-duel .vs-endp', { timeout: 10000 })));
  await tap(B, '#tab-duel .vs-change');
  await wait(A, () => /Sam is choosing a deck/.test(document.querySelector('#tab-duel .vs-endp').textContent), null, 15000);
  check('Sam taps Change deck: his table closes and Alex sees "Sam is choosing a deck"', await B.evaluate(() => document.querySelector('#tab-duel .vs-game').hidden) && /Choose a deck/.test(await text(B, '#tab-duel .rm-sv')));
  check('...and they stay connected', await B.evaluate(() => window.__isfRemote.connected()) && await A.evaluate(() => window.__isfRemote.connected()));
  const label = await B.evaluate(() => window.__isfRemote.M && document.querySelector('#tab-duel .rm-rematch').textContent);
  await tap(B, '#tab-duel .rm-rematch');
  await wait(A, () => /Sam wants a rematch/.test((document.querySelector('#tab-duel .vs-rmq') || {}).textContent || ''), null, 15000);
  check('Sam offers the rematch with the deck he chose: Alex sees the offer and the deck\'s name', /wants a rematch with /.test(await text(A, '#tab-duel .vs-rmq')) && /Offer a rematch/.test(label), await text(A, '#tab-duel .vs-rmq'));
  await tap(A, '#tab-duel .vs-rm-yes');
  await Promise.all([A, B].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && !g.over && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000)));
  check('Alex accepts: a new game starts on both devices', (await st(A)).fp === (await st(B)).fp);
  await Promise.all([A, B].map(finish));
  await Promise.all([A, B].map(p => p.waitForSelector('#tab-duel .vs-endp', { timeout: 10000 })));
  await tap(A, '#tab-duel .vs-leave');
  await wait(B, () => /Alex left/.test(document.querySelector('#tab-duel .vs-endp').textContent), null, 15000);
  const left = await A.evaluate(() => ({ view: document.body.dataset.view, game: !!window.__isfRemote.state.game, saved: localStorage.getItem('isf_remote'), mq: !!window.__isfRemote.M.mq, hidden: document.querySelector('#tab-duel .vs-game').hidden }));
  check('Alex taps Leave: Sam sees "Alex left", and on Alex\'s side the table closes, the saved game and the meeting-point connection are gone', left.hidden && !left.game && left.saved === null && !left.mq, JSON.stringify(left));
  check('...Sam can still leave, and then has no saved game either', await B.$eval('#tab-duel .vs-endp', e => !e.querySelector('.vs-again') || e.querySelector('.vs-again').disabled));
  await tap(B, '#tab-duel .vs-leave');
  check('Sam leaves too: his table closes and nothing is left saved', await B.evaluate(() => document.querySelector('#tab-duel .vs-game').hidden && !window.__isfRemote.state.game && localStorage.getItem('isf_remote') === null && !window.__isfRemote.M.mq));
  check('no page errors in pair 1', !errs.length, errs.slice(0, 3).join(' | '));
  for (const p of [A, B, C]) await p.context().close();

  // ================= pair 2: a room name, the first broker down =================
  const broker2 = mockBroker();
  const D = await device('D', broker2, true), E = await device('E', broker2, true);
  await Promise.all([load(D, deckA, 'wifi-3'), load(E, deckB, 'wifi-4')]);
  await D.fill('#tab-duel .rm-name', 'Dana'); await E.fill('#tab-duel .rm-name', 'Eli');
  await D.check('#tab-duel .rm-tick'); await E.check('#tab-duel .rm-tick');
  await wait(D, () => /Could not work out|No one nearby|Looking/.test(document.querySelector('#tab-duel .rm-near').textContent), null, 10000);
  await D.fill('#tab-duel .rm-room', 'Dragon  FIRE!'); await tap(D, '#tab-duel .rm-roomgo');
  await E.fill('#tab-duel .rm-room', 'dragon fire'); await E.press('#tab-duel .rm-room', 'Enter');
  await wait(D, () => document.querySelectorAll('#tab-duel .rm-peerlist li').length === 1, null, 30000);
  await wait(E, () => document.querySelectorAll('#tab-duel .rm-peerlist li').length === 1, null, 30000);
  check('different networks: the same word typed differently ("Dragon  FIRE!" and "dragon fire") finds the friend, through the second broker', (await near(D)).join() === 'Eli' && (await near(E)).join() === 'Dana' && broker2.count() === 2);
  check('the room is named on screen, and the topic is a hash of the word', /dragon fire/.test(await text(D, '#tab-duel .rm-neartitle')) && broker2.log.every(m => /^isf5\/[0-9a-f]{40}$/.test(m.topic)));
  await tap(E, '#tab-duel .rm-ask');
  await wait(D, () => !!document.querySelector('#tab-duel .rm-yes'), null, 20000);
  check('the same ask and accept: "Eli wants to play. Accept?"', /Eli wants to play\. Accept\?/.test(await text(D, '#tab-duel .rm-incoming')));
  await tap(D, '#tab-duel .rm-yes');
  await Promise.all([D, E].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && g.remote != null && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000)));
  const [d0, e0] = [await st(D), await st(E)];
  check('the room game starts on both devices: Eli (who asked) is seat 0', d0.local === 1 && e0.local === 0 && d0.names.join() === 'Eli,Dana' && d0.fp === e0.fp, d0.names.join());
  // ---- the turn clock on Play a friend: both pages show the same clock, it stops while someone else is waited for or the link is down,
  // and only the active player's device ends the turn at 0
  const drive = p => p.evaluate(() => { const g = window.__isfVersus.duel.game; if (!g) return;
    if (g.choice) { const x = document.querySelector('.ch-sheet .ch-ok:not([disabled])') || document.querySelector('.ch-sheet .ch-none'); if (x) x.click(); }
    else if (g.phase === 'respond' && g.respond && g.respond.seat === g.human) { const x = document.querySelector('#tab-duel .vs-pass'); if (x) x.click(); } });
  const ck = p => p.evaluate(() => { const g = window.__isfVersus.duel.game, e = document.querySelector('#tab-duel .vs-clock'), o = g.match.order[g.idx].pid;
    return { owner: o, me: g.human, phase: g.phase, run: g.clock && g.clock.run, left: g.clock ? Math.round(g.clock.left) : null, shown: e && !e.hidden && e.getClientRects().length > 0, text: e && e.textContent, still: e && e.classList.contains('still'), timer: g.turnTimer, turn: g.games[o].turn, acting: g.acting, busy: g.busy }; });
  await Promise.all([D, E].map(p => tap(p, '#tab-duel .vs-keep')));
  const bothMain = async () => { for (let i = 0; i < 200; i++) { await Promise.all([D, E].map(drive)); const [x, y] = [await ck(D), await ck(E)]; if (x.phase === 'main' && y.phase === 'main' && !x.acting && !y.acting && x.owner === y.owner) return; await D.waitForTimeout(200); } throw new Error('no main phase'); };
  await bothMain();
  const first = await ck(D), X = first.owner === first.me ? D : E, Y = X === D ? E : D;
  await X.waitForTimeout(1600);
  const [cx, cy] = [await ck(X), await ck(Y)], secs = t => { const m = /(\d+):(\d\d)/.exec(t); return m ? +m[1] * 60 + +m[2] : -1; };
  check('Play a friend: both pages show a clock on the active player\'s turn, the same time to within 2 s', cx.shown && cy.shown && Math.abs(secs(cx.text) - secs(cy.text)) <= 2 && secs(cx.text) <= 90, cx.text + ' / ' + cy.text);
  check('...only the active player has the End turn button; the other device shows the clock and nothing to press', await X.$('#tab-duel .vs-end') !== null && await Y.$('#tab-duel .vs-end') === null && cx.run === true);
  await X.evaluate(() => { window.__isfVersus.duel.game.waiting = 1; });          // as if waiting for the other player's answer
  await X.waitForTimeout(1500);
  const q1 = await ck(X), q2 = (await X.waitForTimeout(1000), await ck(X)), qy = await ck(Y);
  check('while the active player waits for someone else the clock stops (on both pages), then goes on', q1.run === false && Math.abs(q1.left - q2.left) < 100 && qy.still === true);
  await X.evaluate(() => { window.__isfVersus.duel.game.waiting = null; });
  await X.waitForTimeout(800);
  check('...it runs again when the wait is over', (await ck(X)).run === true);
  await X.evaluate(() => window.__isfRemote.state.link.ch.close());
  await wait(X, () => !window.__isfRemote.connected(), null, 20000);
  await wait(X, () => window.__isfVersus.duel.game.clock && !window.__isfVersus.duel.game.clock.run, null, 5000);
  const d1 = await ck(X); await X.waitForTimeout(1500); const d2 = await ck(X);
  check('while the connection is down the clock stands still', d1.run === false && Math.abs(d1.left - d2.left) < 600, d1.left + ' → ' + d2.left);
  await Promise.all([D, E].map(p => wait(p, () => window.__isfRemote.connected(), null, 90000)));
  await X.waitForTimeout(800);
  check('...and runs again once the two devices have connected again', (await ck(X)).run === true && (await ck(X)).left < d2.left + 100);
  // a time-out: shorten the limits, X ends its turn, and Y\'s clock (4.5 s) runs out on Y\'s device only
  await Promise.all([D, E].map(p => p.evaluate(() => { window.__turnTimerScale = 0.05; })));
  await tap(X, '#tab-duel .vs-end');
  const outs = p => p.evaluate(() => ({ ends: window.__isfRemote.state.game.out.filter(m => m.t === 'act' && m.name === 'end').map(m => m.seat), inbox: window.__isfRemote.state.game.inbox.filter(m => m.t === 'act' && m.name === 'end').map(m => m.seat), womp: window.__isfAudio.played.filter(x => x === 'womp').length, log: document.querySelector('#tab-duel .vs-log').textContent }));
  let ox, oy;
  for (let i = 0; i < 150; i++) { await Promise.all([D, E].map(drive)); [ox, oy] = [await outs(X), await outs(Y)]; if (oy.ends.length && /ran out of time/.test(ox.log) && /ran out of time/.test(oy.log)) break; await X.waitForTimeout(200); }
  const yseat = (await ck(Y)).me;
  check('the other player\'s clock runs out: their device ends the turn (an ordinary "end" move in its log, which the first device receives)', oy.ends.length === 1 && oy.ends[0] === yseat && ox.inbox.includes(yseat), JSON.stringify([ox.ends, ox.inbox, oy.ends]));
  check('...the first device never ends the other player\'s turn: its own log holds only its own end move', ox.ends.length === 1 && ox.ends[0] !== yseat, JSON.stringify(ox.ends));
  check('...both devices log "ran out of time" with the right name and play the womp sound', /Eli ran out of time|Dana ran out of time/.test(ox.log) && /Eli ran out of time|Dana ran out of time/.test(oy.log) && ox.womp >= 1 && oy.womp >= 1 && (/Dana ran out/.test(ox.log) === /Dana ran out/.test(oy.log)));
  check('...and the two games are still the same game', (await st(D)).fp === (await st(E)).fp);
  // the inviter's setting (Turn timer off) is the game's: both devices carry it, and no clock shows
  await Promise.all([D, E].map(finish));
  await Promise.all([D, E].map(p => p.waitForSelector('#tab-duel .vs-endp', { timeout: 10000 })));
  await E.evaluate(() => { const c = document.querySelector('#optTurnTimer'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await tap(E, '#tab-duel .vs-again');
  await wait(D, () => !!document.querySelector('#tab-duel .vs-rm-yes'), null, 15000);
  await tap(D, '#tab-duel .vs-rm-yes');
  await Promise.all([D, E].map(p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && !g.over && g.phase === 'mull' && window.__isfRemote.connected(); }, null, 40000)));
  await Promise.all([D, E].map(p => tap(p, '#tab-duel .vs-keep')));
  await bothMain(); await D.waitForTimeout(800);
  const [o1, o2] = [await ck(D), await ck(E)];
  check('Turn timer off on the inviter\'s side: both devices play without a clock (the setting travels in the setup)', o1.timer === false && o2.timer === false && !o1.shown && !o2.shown, JSON.stringify([o1.timer, o2.timer, o1.shown, o2.shown]));
  // Change deck and then a local New game: the link closes and the other player is told he left
  await Promise.all([D, E].map(finish));
  await Promise.all([D, E].map(p => p.waitForSelector('#tab-duel .vs-endp', { timeout: 10000 })));
  await tap(E, '#tab-duel .vs-change');
  await wait(D, () => /Eli is choosing a deck/.test(document.querySelector('#tab-duel .vs-endp').textContent), null, 15000);
  await E.evaluate(() => { document.querySelector('#tab-duel .vs-opp').value = ''; document.querySelector('#tab-duel .vs-new').click(); });
  await wait(D, () => /Eli left/.test(document.querySelector('#tab-duel .vs-endp').textContent), null, 15000);
  check('Change deck, then a local New game: the link closes and the other player sees "Eli left", not "choosing a deck" for ever', !/choosing/.test(await text(D, '#tab-duel .vs-endp')));
  check('...and the player who started it has no saved game against the friend left behind', await E.evaluate(() => !window.__isfRemote.state.game && localStorage.getItem('isf_remote') === null));
  check('no page errors in pair 2', !errs.length, errs.slice(0, 3).join(' | '));

  // ================= neither broker reachable: say so, and show the codes =================
  const brokerOff = await device('F', broker2, true);
  await brokerOff.context().routeWebSocket(/broker\.emqx\.io/, ws => ws.close({ code: 1011 }));
  await load(brokerOff, null, 'wifi-5');
  await brokerOff.check('#tab-duel .rm-tick');
  await wait(brokerOff, () => /Couldn't reach the meeting point/.test(document.querySelector('#tab-duel .rm-nearstat').textContent), null, 40000);
  check('neither broker answers: the list says it could not reach the meeting point, and the codes are opened', await brokerOff.$eval('#tab-duel .rm-other', e => e.open) && !!(await brokerOff.$('#tab-duel .rm-other .rm-invite')), await text(brokerOff, '#tab-duel .rm-nearstat'));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
