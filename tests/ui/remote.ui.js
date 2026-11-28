// Browser test for Duel against a friend on another device (remote.js): two browser profiles, each its own "device" with its own deck
// and storage, connected over WebRTC with the invite and reply codes. Needs playwright, a static server on :8800 and Scryfall.
// Covers: the list of what is shared (and that nothing connects before it is accepted), the invite link, both opening hands, each
// player's seat at the bottom and the other's hand as card backs, the same table on both devices at every step (and the devices'
// own comparison before every move), a land and a spell each, a spell of one player countered by the other, an attack blocked by
// the other player, a reload and rejoin with the game going on where it was, and a winner on both devices.
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckA = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');      // Swords to Plowshares
const deckB = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'veyran.txt'), 'utf8');     // Counterspell
const BASE = 'http://127.0.0.1:8800/';
let pages = [];          // the two devices, for the message when a step times out

(async () => {
  const b = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const errs = [];
  const device = async label => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 950 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
    await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); s.bg = false; s.sfx = false; s.music = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } catch (e) {} });
    await ctx.route(u => /scryfall\.(com|io)$/.test(u.hostname), async route => {
      const r = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      try {
        const res = await fetch(r.url(), { method: r.method(), headers: { 'User-Agent': UA, 'Accept': 'application/json;q=0.9,*/*;q=0.8', ...(r.method() === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, body: r.method() === 'POST' ? r.postData() : undefined });
        route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
      } catch (e) { route.abort(); }
    });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(label + ': ' + e.message));
    p.on('console', m => { if (/^LAND NOT PLAYABLE/.test(m.text())) console.log(label + ': ' + m.text()); });
    p.label = label;
    return p;
  };
  const loadDeck = async (p, text) => {
    await p.evaluate(t => { document.querySelector('#deckText').value = t; document.querySelector('#loadDeck').click(); }, text);
    await wait(p, () => window.__isf && window.__isf.deck, null, 120000);
  };
  // the test machine has no internet STUN: local addresses only. And the roll for first without the 3D dice: a remote game rolls them
  // even with dice switched off, and their WebGL in this headless browser can stop a page drawing (then a click waits for ever)
  const noStun = p => p.evaluate(() => { window.__isfRemote.ice = []; if (window.Dice) window.Dice.rollInto = null; });
  const A = await device('A'), B = await device('B');
  pages = [A, B];
  // Under a heavy load (other browser tests side by side) these pages draw only a few frames a second, at times none for many seconds,
  // once the duel table is up. Playwright's own waits run on animation frames by default (waitForFunction checks once per frame;
  // click waits for two frames in the same place), so they ran out with the game already there. These wait on a timer instead.
  const POLL = 200;
  const wait = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms, polling: POLL });
  const tap = async (p, sel, ms) => {          // click a button once it is on the page, shown and enabled
    try { await wait(p, s => { const e = document.querySelector(s); return !!e && !e.disabled && e.getClientRects().length > 0; }, sel, ms || 30000); }
    catch (err) {          // say what both devices were showing, so a rare failure can be told apart from a stuck game
      const dump = async q => q.evaluate(() => { const gm = window.__isfVersus && window.__isfVersus.duel.game; return gm ? JSON.stringify({ phase: gm.phase, active: gm.active, over: !!gm.over, picking: !!gm.picking, choice: !!gm.choice, sheet: (document.querySelector('.ch-sheet') || {}).className || null, endBtn: (() => { const b = document.querySelector('#tab-duel .vs-end'); return b ? [b.disabled, b.getClientRects().length] : null; })(), bar: (document.querySelector('#tab-duel .vs-bar') || {}).textContent }) : 'no game'; }).catch(e => 'unreadable: ' + e.message);
      throw new Error(err.message.split('\n')[0] + ' waiting for ' + sel + ' | A: ' + await dump(A) + ' | B: ' + await dump(B));
    }
    await p.evaluate(s => document.querySelector(s).click(), sel);
    if (/vs-card/.test(sel)) await viewerPick(p);          // T-134: a card opens in the viewer; its action is the button there
  };
  await A.goto(BASE); await loadDeck(A, deckA); await noStun(A);

  // ---- the list of what is shared comes first
  await tap(A, '[data-tab=duel]');
  await A.evaluate(() => { document.querySelector('#tab-duel .rm-other').open = true; });          // the codes are under "Other ways to connect"
  check('the Duel tab has a "Play a friend" box with the tagline and the full list of what is shared',
    await A.$eval('#tab-duel .rm-box', e => /Play a friend/.test(e.textContent) && /Do this with good friends\. Don't be a victim\./.test(e.textContent) && e.querySelectorAll('.rm-list li').length >= 8 && !!e.querySelector('.rm-tick')));
  check('...the list says the hand, library and seed are in the other device\'s memory, and names the IP address and Google\'s STUN server',
    await A.$eval('#tab-duel .rm-list', e => /seed/.test(e.textContent) && /IP address/.test(e.textContent) && /STUN/.test(e.textContent)));
  await A.fill('#tab-duel .rm-name', 'Alex');
  await tap(A, '#tab-duel .rm-invite');
  check('Invite without ticking "I understand and accept" makes no code and says why', !(await A.$('#tab-duel .rm-mine')) && /accept/.test(await A.$eval('#tab-duel .rm-status', e => e.textContent)));
  await A.check('#tab-duel .rm-tick');
  await tap(A, '#tab-duel .rm-invite');
  await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
  const invite = await A.$eval('#tab-duel .rm-mine', e => e.value);
  check('ticking it and Invite makes an invite code, short enough for a QR code', /^ISF2z?\.[A-Za-z0-9_-]{40,}$/.test(invite) && invite.length < 400, invite.length + ' characters');
  const qr = await A.evaluate(() => { const q = document.querySelector('#tab-duel .rm-qr'); return q && { link: q.dataset.link, svg: !!q.querySelector('svg path'), w: q.getBoundingClientRect().width }; });
  check('...shown as a QR code of the invite link, for the friend to scan with the phone\'s camera', qr && qr.svg && qr.link === BASE + '#isf-join=' + invite && qr.w >= 150, JSON.stringify(qr && { w: qr.w, link: (qr.link || '').slice(0, 60) }));
  check('...after which the list folds to one line under the tagline', !!(await A.$('#tab-duel .rm-what')) && !(await A.$('#tab-duel .rm-tick')));

  // ---- the friend opens the invite link
  await B.goto(BASE + '#isf-join=' + invite);
  await loadDeck(B, deckB); await noStun(B);
  check('the invite link opens the Duel tab with the invite ready to join', (await B.$eval('#tab-duel .rm-theirs', e => e.value)) === invite && (await B.evaluate(() => document.body.dataset.view)) === 'duel');
  await B.fill('#tab-duel .rm-name', 'Sam');
  await B.check('#tab-duel .rm-tick');
  await tap(B, '#tab-duel .rm-reply');
  await B.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
  const reply = await B.$eval('#tab-duel .rm-mine', e => e.value);
  const rqr = await B.evaluate(() => { const q = document.querySelector('#tab-duel .rm-qr'); return q && q.dataset.link; });
  check('the friend gets a reply, shown as a QR code of the reply link', /^ISF2z?\./.test(reply) && reply !== invite && rqr === BASE + '#isf-reply=' + reply);
  // Alex scans it with the camera: it opens in a new tab of the same browser, which hands it to the tab with the invite
  const A2 = await A.context().newPage();
  await A2.goto(BASE + '#isf-reply=' + reply);
  await A2.waitForSelector('#tab-duel .rm-box', { timeout: 30000 });
  check('the scanned reply opens a new tab that says to go back to the tab with the invite', /Go back to the ICEYfish tab with your invite/.test(await A2.$eval('#tab-duel .rm-step', e => e.textContent)));
  await A.bringToFront();
  await A.evaluate(() => window.dispatchEvent(new Event('focus')));
  // what each device's link and game look like, for a message when a wait runs out
  const linkState = p => p.evaluate(() => { const R = window.__isfRemote, L = R.state.link, g = window.__isfVersus.duel.game;
    return { visible: document.visibilityState, focus: document.hasFocus(), pc: L && L.pc.connectionState, ice: L && L.pc.iceConnectionState, channel: L && L.ch && L.ch.readyState, answered: L && L.answered, game: !!R.state.game, phase: g && g.phase, remote: g && g.remote,
      status: (document.querySelector('#tab-duel .rm-status') || {}).textContent || '' }; }).then(JSON.stringify, e => 'unreadable: ' + e.message);
  const started = p => wait(p, () => { const g = window.__isfVersus.duel.game; return g && g.remote != null && g.phase === 'mull'; }, null, 30000);
  const t0 = Date.now();
  await Promise.all([started(A), started(B)]).catch(async e => { throw new Error('both devices start the game: ' + e.message.split('\n')[0] + ' A: ' + await linkState(A) + ' B: ' + await linkState(B)); });
  console.log('(both devices started the game ' + (Date.now() - t0) + ' ms after the reply)');

  // ---- helpers: the state of a page, the same table on both, and answering whatever a page is asked on the way
  const st = p => p.evaluate(() => {
    const g = window.__isfVersus.duel.game, R = window.__isfRemote;
    return { local: g.human, remote: g.remote, phase: g.phase, acting: g.acting, busy: g.busy, choice: g.choice ? g.choice.kind : null, over: g.over, halted: !!g.halted, active: g.match.order[g.idx].pid,
      block: g.phase === 'block', respond: g.phase === 'respond' && g.respond ? g.respond.seat : null, queued: g.inputs[0].length + g.inputs[1].length, waiting: g.waiting,
      fp: R.fp(g.games), connected: R.connected(), names: g.match.names, life: g.games.map(x => x.life), hands: g.games.map(x => x.hand.map(i => i.iid)) };
  });
  const quiet = s => !s.acting && !s.busy && !s.choice && !s.queued && s.waiting == null;
  const same = async name => {
    for (let i = 0; i < 80; i++) { const [a, c] = [await st(A), await st(B)]; if (quiet(a) && quiet(c) && a.fp === c.fp) return check(name, true); await A.waitForTimeout(150); }
    const [a, c] = [await st(A), await st(B)];
    const [da, db] = [A, B].map(p => p.evaluate(() => window.Decide.dump(window.__isfVersus.duel.game.games, window.Decide.SCRATCH)));
    const [x, y] = [await da, await db]; let k = 0; while (k < x.length && x[k] === y[k]) k++;
    check(name, false, `${a.fp} / ${c.fp} · first difference: …${x.slice(Math.max(0, k - 300), k + 120)}… / …${y.slice(Math.max(0, k - 40), k + 120)}…`);
  };
  // until cond(stateA, stateB): take the autopilot's pick on any question, pass any window, keep suggested blocks (unless told otherwise)
  const until = async (cond, ms, o) => {
    o = o || {};
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 60000)) {
      const [a, c] = [await st(A), await st(B)];
      if (cond(a, c)) return true;
      for (const [p, s] of [[A, a], [B, c]]) {          // a choice sheet in a game against a person has no autopilot answer: confirm what it starts on (.ch-ok), or "none" when nothing is chosen
        if (s.choice && o.keepChoice !== true && o.keepChoice !== p.label) await p.evaluate(() => { const x = document.querySelector('.ch-sheet .ch-ok:not([disabled])') || document.querySelector('.ch-sheet .ch-none'); if (x) x.click(); });
        else if (s.respond === s.local && !o.keepRespond) await p.evaluate(() => { const x = document.querySelector('#tab-duel .vs-pass'); if (x) x.click(); });
        else if (s.block && !o.keepBlock) await p.evaluate(() => { const x = document.querySelector('#tab-duel .vs-block-go'); if (x) x.click(); });
      }
      await A.waitForTimeout(150);
    }
    const [a, c] = [await st(A), await st(B)];
    const brief = s => JSON.stringify(Object.assign({}, s, { fp: undefined, names: undefined, hands: undefined }));
    throw new Error('timed out. A: ' + brief(a) + ' B: ' + brief(c));
  };
  const pageOf = s => (s.local === 0 ? A : B);
  const myMain = (s, seat) => s.phase === 'main' && s.active === seat && quiet(s);

  // ---- both opening hands
  const a0 = await st(A), b0 = await st(B);
  check('each device plays its own seat: the inviter seat 0, the friend seat 1, and both are named', a0.local === 0 && b0.local === 1 && a0.names.join() === 'Alex,Sam' && b0.names.join() === 'Alex,Sam', a0.names.join());
  check('both devices built the same game from the same seed and decks', a0.fp === b0.fp, a0.fp);
  check('each device draws its own seat along the bottom, with its own hand face up', (await A.$eval('#tab-duel .vs-seat.me', e => +e.dataset.pid)) === 0 && (await B.$eval('#tab-duel .vs-seat.me', e => +e.dataset.pid)) === 1 &&
    (await B.$$('#tab-duel .vs-seat.me .vs-hand .vs-card')).length === 7);
  check('...and the other player\'s hand as seven card backs', (await A.$eval('#tab-duel .vs-seat.opp .vs-backs b', e => e.textContent)) === '7' && !(await A.$('#tab-duel .vs-seat.opp .vs-hand')));
  check('the bar says the other device is connected', /Connected/.test(await A.$eval('#tab-duel .vs-bar', e => e.textContent)) && /Connected/.test(await B.$eval('#tab-duel .vs-bar', e => e.textContent)));
  await tap(A, '#tab-duel .vs-mull');
  await A.waitForTimeout(300);
  check('Alex\'s mulligan reaches Sam\'s device: Alex has a new hand there', await B.evaluate(() => window.__isfVersus.duel.game.games[0].mulligans === 1));
  await tap(A, '#tab-duel .vs-keep');
  await A.waitForTimeout(300);
  check('Alex keeps and waits for Sam to keep', /Waiting for Sam to keep/.test(await A.$eval('#tab-duel .vs-bar', e => e.textContent)));
  await tap(B, '#tab-duel .vs-keep');
  await until((a, c) => myMain(a, a.active) && myMain(c, c.active) && a.active === c.active);
  const first = (await st(A)).active;
  check('both have kept: the game begins on both devices with the same player\'s turn', true, 'first: ' + ['Alex', 'Sam'][first]);
  await same('the same table on both devices once both kept');
  const waitingSide = first === 0 ? B : A;
  check('the waiting device shows whose turn it is and no buttons of its own', /(Alex|Sam)'s turn/.test(await waitingSide.$eval('#tab-duel .vs-bar', e => e.textContent)) && !(await waitingSide.$('#tab-duel .vs-end')));

  // ---- a few turns as they come: each plays a land if it can, then ends the turn
  const landTurn = async seat => {
    const p = seat === 0 ? A : B;
    await until((a, c) => myMain(seat === 0 ? a : c, seat) && quiet(a) && quiet(c));
    const played = await p.evaluate(s => { const gm = window.__isfVersus.duel.game, g = gm.games[s], l = g.hand.find(i => i.card.a.isLand && !/return a land you control/i.test(i.card.oracle_text || '')); if (!l) return null; /* not a bounce land: Izzet Boilerworks as the only land returns itself and the wait below never ends */ const e = document.querySelector(`#tab-duel .vs-hand .vs-card[data-iid="${l.iid}"]`);
      if (!e.classList.contains('can')) console.log('LAND NOT PLAYABLE', l.card.name, JSON.stringify({ can: window.Goldfish.canPlayLand(g), landPlayed: g.landPlayed, turn: g.turn, phase: gm.phase, picking: gm.picking, choice: !!gm.choice, cls: e.className }));
      e.click(); return l.iid; }, seat);
    if (played != null) await viewerPick(p);          // T-134: the land opens in the viewer; Play land is its button
    if (played != null) {          // on both devices the land has left that hand (a fetch land or a bounce land changes the land count otherwise)
      await until((a, c) => quiet(a) && quiet(c) && !a.hands[seat].includes(played) && !c.hands[seat].includes(played), 30000);          // answering what the land asks on the way
    }
    return played != null;
  };
  const endTurn = async seat => { await tap(seat === 0 ? A : B, '#tab-duel .vs-end'); await until((a, c) => a.active !== seat && c.active !== seat && quiet(a) && quiet(c) && a.phase === 'main' && c.phase === 'main', 60000); };
  const hadLand = await (first === 0 ? A : B).evaluate(s => window.__isfVersus.duel.game.games[s].hand.some(i => i.card.a.isLand && !/return a land you control/i.test(i.card.oracle_text || '')), first);
  const firstLand = await landTurn(first);
  check('the first player plays a land (when the deal gave one) and it reaches the other device', firstLand === hadLand, hadLand ? 'played' : 'no land in hand');
  await same('the same table after that land');
  await endTurn(first);
  await same('the same table after the end of the first turn and the beginning of the next');
  const second = 1 - first;
  await landTurn(second);
  await same('the same table after the second player\'s land');
  check('no device stopped the game: their own comparisons before every move all agree', !(await st(A)).halted && !(await st(B)).halted);

  // ---- a reload: Sam's device reloads in the middle of a turn, rejoins the saved game, and the two devices connect again
  const beforeReload = await st(A);
  await B.reload();
  await B.waitForSelector('#tab-duel .rm-rejoin', { state: 'attached', timeout: 30000 });
  await noStun(B);
  check('after a reload the Duel tab offers to rejoin the saved game against Alex', /against Alex is saved/.test(await B.$eval('#tab-duel .rm-box', e => e.textContent)));
  await wait(A, () => !window.__isfRemote.connected(), null, 30000);
  check('Alex\'s device sees the connection is gone and says the game waits', /Not connected/.test(await A.$eval('#tab-duel .rm-box', e => e.textContent)) && /Not connected/.test(await A.$eval('#tab-duel .vs-bar', e => e.textContent)));
  await tap(B, '[data-tab=duel]');
  await tap(B, '#tab-duel .rm-rejoin');
  await wait(B, () => { const g = window.__isfVersus.duel.game; return g && g.remote != null && !g.inputs[0].length && !g.inputs[1].length && !g.acting && !g.busy; }, null, 60000);
  await B.waitForTimeout(1500);
  const rejoined = await st(B);
  check('Sam\'s device replays the saved game to exactly where it was', rejoined.fp === beforeReload.fp && rejoined.active === beforeReload.active, rejoined.fp + ' / ' + beforeReload.fp);
  // (the game began with codes: no meeting point, so no automatic reconnect; the codes under "Other ways to connect" mend it)
  await tap(A, '#tab-duel .rm-other .rm-invite');
  await A.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
  const invite2 = await A.$eval('#tab-duel .rm-mine', e => e.value);
  await B.evaluate(() => { document.querySelector('#tab-duel .rm-other').open = true; });
  await tap(B, '#tab-duel .rm-join');
  await B.fill('#tab-duel .rm-theirs', invite2);
  await tap(B, '#tab-duel .rm-reply');
  await B.waitForSelector('#tab-duel .rm-mine', { state: 'attached', timeout: 20000 });
  await tap(A, '#tab-duel .rm-paste summary');          // this time Alex pastes the reply (the fallback)
  await A.fill('#tab-duel .rm-theirs', await B.$eval('#tab-duel .rm-mine', e => e.value));
  await tap(A, '#tab-duel .rm-connect');
  await Promise.all([A, B].map(p => wait(p, () => window.__isfRemote.connected(), null, 30000)));
  check('a new pair of codes connects the two devices again, into the same game', true);
  await same('the same table after the rejoin');
  await endTurn(second);
  await same('the game goes on after the rejoin: the same table after the next turn begins');

  // ---- a set table for the interactions (the same edit on both devices, so they stay the same game)
  // Alex needs the turn. When it is Sam's, end it at once: waiting out the turn clock (90 s for the first turns) instead raced with the app
  // ending Sam's turn by itself, and the End turn tap then went to the wrong seat.
  await until((a, c) => a.active === c.active && myMain(a, a.active) && myMain(c, c.active), 90000);
  if ((await st(A)).active !== 0) await endTurn(1);
  await until((a, c) => myMain(a, 0) && myMain(c, 0), 90000);
  const setTable = () => {
    const gm = window.__isfVersus.duel.game, G = window.Goldfish, [a, b] = gm.games;
    const card = (g, re) => g.deck.unique.find(c => re.test(c.name));
    const put = (g, c, o) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; Object.assign(p, o || {}); return p; };
    // not Grand Abolisher or the like: Sam must be able to answer
    const plain = c => c.a.isCreature && !c.a.isLegendary && !c.commander && (c.a.power || 0) >= 1 && !c.a.castStax && !/can't/i.test(c.oracle_text || ''), quiet = c => !(c.a.triggers || []).length && !(c.keywords || []).length;
    const bear = g => { const cs = g.deck.unique.filter(plain).sort((x, y) => (quiet(y) ? 1 : 0) - (quiet(x) ? 1 : 0) || (x.a.power || 0) - (y.a.power || 0)); return cs[0]; };
    a.battlefield = []; b.battlefield = []; a.hand = []; b.hand = [];
    for (let i = 0; i < 4; i++) put(a, card(a, /^Plains$/));
    for (let i = 0; i < 2; i++) put(b, card(b, /^Island$/));
    const atk = put(a, bear(a)), blk = put(b, bear(b));
    a.hand.push({ iid: a.nextIid++, card: card(a, /^Swords to Plowshares$/) }, { iid: a.nextIid++, card: card(a, /^Plains$/) });
    b.hand.push({ iid: b.nextIid++, card: card(b, /^Counterspell$/) });
    window.__isfVersus.redraw('duel');
    return { atk: atk.iid, blk: blk.iid, blkName: blk.card.name, swords: a.hand[0].iid, land: a.hand[1].iid };
  };
  const T = await A.evaluate(setTable); await B.evaluate(setTable);
  await same('the same table after setting it on both devices (a test step, not a move)');

  // a land and a spell on Alex's turn; Sam is asked whether to counter it, on Sam's device
  await tap(A, `#tab-duel .vs-hand .vs-card[data-iid="${T.land}"]`);
  await same('Alex plays a land: the same table');
  await tap(A, `#tab-duel .vs-hand .vs-card[data-iid="${T.swords}"]`);
  await until((a, c) => c.choice === 'counter' || (quiet(a) && quiet(c) && a.phase === 'main'), 30000, { keepChoice: 'B' });          // Alex's own question (does it resolve?) is answered on the way
  const sb = await st(B);
  check('Alex casts Swords to Plowshares: Sam is asked on Sam\'s device whether to counter it', sb.choice === 'counter' && /Alex casts Swords to Plowshares/.test(await B.$eval('.ch-sheet', e => e.textContent)));
  check('...while Alex\'s device says Sam is deciding', /Sam is deciding/.test(await A.$eval('#tab-duel .vs-bar', e => e.textContent)));
  await B.evaluate(() => { const o = [...document.querySelectorAll('.ch-sheet .ch-opt')].find(x => /Counterspell/.test(x.textContent)); o.click(); }); await viewerPick(B); await B.evaluate(() => { document.querySelector('.ch-sheet .ch-ok').click(); });
  await until((a, c) => quiet(a) && quiet(c) && a.phase === 'main' && c.phase === 'main', 30000, { keepChoice: false });
  const cnt = await A.evaluate(([blk]) => { const [a, b] = window.__isfVersus.duel.game.games; return { swordsGone: a.graveyard.some(i => i.card.name === 'Swords to Plowshares'), counterUsed: b.graveyard.some(i => i.card.name === 'Counterspell'), blkThere: b.battlefield.some(p => p.iid === blk) }; }, [T.blk]);
  check('...Sam counters it: on Alex\'s device Swords and Counterspell are in the graveyards and Sam\'s creature is still there', cnt.swordsGone && cnt.counterUsed && cnt.blkThere, JSON.stringify(cnt));
  await same('the same table after the counterspell');

  // Alex attacks; Sam chooses the block on Sam's device
  await tap(A, '#tab-duel .vs-attack');
  await A.waitForSelector('#tab-duel .vs-attack-go', { timeout: 15000 });
  await tap(A, '#tab-duel .vs-attack-all');
  await tap(A, '#tab-duel .vs-attack-go');
  await until((a, c) => c.block, 30000, { keepBlock: true });
  const blockUi = await B.evaluate(() => ({ n: document.querySelectorAll('#tab-duel .vs-blk').length, text: (document.querySelector('#tab-duel .vs-me') || {}).textContent || '' }));
  check('Alex attacks: Sam is asked for blocks on Sam\'s device', blockUi.n >= 1 && /Alex attacks you/.test(blockUi.text), blockUi.n + ' ' + blockUi.text.slice(0, 160));
  await B.selectOption(`#tab-duel .vs-blk[data-iid="${T.blk}"]`, String(T.atk));
  await tap(B, '#tab-duel .vs-block-go');
  await until((a, c) => quiet(a) && quiet(c) && a.phase === 'main' && c.phase === 'main', 30000);
  check('...Sam\'s block reaches Alex\'s device: the log there says Sam\'s creature blocks', await A.evaluate(n => [...document.querySelectorAll('#tab-duel .vs-log .vs-line')].some(l => /blocks/.test(l.textContent) && l.textContent.includes(n)), T.blkName));
  await same('the same table after the blocked attack');
  await endTurn(0);
  await same('the same table at the beginning of Sam\'s turn');

  // Sam's land and spell, then Alex's winning attack
  const samCards = () => {          // a land and a cheap creature for Sam (the same edit on both devices)
    const b = window.__isfVersus.duel.game.games[1], G = window.Goldfish;
    const bear = b.deck.unique.filter(c => c.a.isCreature && !c.commander && !c.a.isLegendary && (c.cmc || 0) <= 2 && /^[{}UR12]*$/.test((c.mana_cost || '').replace(/[{} ]/g, ''))).sort((x, y) => (x.cmc || 0) - (y.cmc || 0))[0];
    const land = { iid: b.nextIid++, card: b.deck.unique.find(c => /^Island$/.test(c.name)) }, spell = { iid: b.nextIid++, card: bear };
    b.hand.push(land, spell); window.__isfVersus.redraw('duel');
    return { land: land.iid, spell: spell.iid, name: bear.name };
  };
  const SC = await A.evaluate(samCards); await B.evaluate(samCards);
  await same('the same table after giving Sam a land and a creature (a test step, not a move)');
  const samLand = await landTurn(1);
  await tap(B, `#tab-duel .vs-hand .vs-card.can[data-iid="${SC.spell}"]`);
  await until((a, c) => quiet(a) && quiet(c) && c.phase === 'main', 30000);
  check('Sam plays a land and casts a creature on Sam\'s turn: both reach Alex\'s device', samLand && await A.evaluate(id => window.__isfVersus.duel.game.games[1].battlefield.some(p => p.iid === id), SC.spell), SC.name);
  await same('the same table after Sam\'s turn');
  await endTurn(1);
  const finish = () => { const gm = window.__isfVersus.duel.game, [a, b] = gm.games, G = window.Goldfish; b.life = 1; b.battlefield.forEach(p => { if (G.isCreaturePerm(p)) p.tapped = true; });
    const c = a.deck.unique.find(x => x.a.isCreature && !x.commander && (x.a.power || 0) >= 1 && !x.a.castStax); const p = G.enterWithTriggers(a, { iid: a.nextIid++, card: c }, {}, []); p.sick = false; p.tapped = false; window.__isfVersus.redraw('duel'); };
  await until((a, c) => myMain(a, 0) && myMain(c, 0), 60000);
  await A.evaluate(finish); await B.evaluate(finish);
  await tap(A, '#tab-duel .vs-attack');
  await A.waitForSelector('#tab-duel .vs-attack-go', { timeout: 15000 });
  await tap(A, '#tab-duel .vs-attack-all');
  await tap(A, '#tab-duel .vs-attack-go');
  await until((a, c) => a.over && c.over, 30000);
  const [ea, eb] = [await st(A), await st(B)];
  check('a winner on both devices: Alex wins', /Alex wins/.test(ea.over) && /Alex wins/.test(eb.over), ea.over + ' / ' + eb.over);
  check('the devices compared the game before every move and never disagreed', !ea.halted && !eb.halted && await A.evaluate(() => { const g = window.__isfRemote.state.game, ks = Object.keys(g.mine).filter(k => g.theirs[k]); return ks.length >= 8 && ks.every(k => g.mine[k] === g.theirs[k]); }));
  check('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async e => {
  console.error(e);
  for (const p of pages) {          // where each device was: its link, its game, and whether it still draws frames
    const s = await Promise.race([p.evaluate(() => new Promise(r => { const t0 = performance.now(); requestAnimationFrame(() => r(Math.round(performance.now() - t0) + ' ms to the next frame')); setTimeout(() => r('no frame in 3 s'), 3000); })), new Promise(r => setTimeout(() => r('page not answering'), 5000))]).catch(x => 'unreadable: ' + x.message);
    const g = await p.evaluate(() => { const R = window.__isfRemote, L = R.state.link, g = window.__isfVersus.duel.game; return JSON.stringify({ visible: document.visibilityState, pc: L && L.pc.connectionState, channel: L && L.ch && L.ch.readyState, phase: g && g.phase, busy: g && g.busy, acting: g && g.acting, choice: g && g.choice && g.choice.kind, dice: !!document.querySelector('.vs-dice'), bar: ((document.querySelector('#tab-duel .vs-bar') || {}).textContent || '').slice(0, 100) }); }).catch(x => 'unreadable: ' + x.message);
    console.log('device ' + p.label + ': ' + s + ' · ' + g);
  } console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); });
