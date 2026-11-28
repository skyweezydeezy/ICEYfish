// Browser test for the 1v1 and Pod tabs (needs playwright, a static server on :8800 and internet access to Scryfall).
const { chromium } = require('playwright');
const viewerPick = require('./viewer-pick.helper.js');
const fs = require('fs'), path = require('path');
const UA = 'goldfish-calc-test/0.1';
let pass = 0, fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '   [' + detail + ']' : '')); };
const deckText = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'frodo.txt'), 'utf8');
const shot = process.env.VERSUS_SHOTS;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { const d = JSON.parse(localStorage.getItem('isf_display') || '{}'); if (d.payChoose == null) { d.payChoose = false; localStorage.setItem('isf_display', JSON.stringify(d)); } } catch (e) {} });          // T-099: the pay sheet is on by default; these tests answer other questions, so the setting is off
  await ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('isf_sound') || '{}'); if (s.bg == null) { s.bg = false; localStorage.setItem('isf_sound', JSON.stringify(s)); } } catch (e) {} });   // the background-music question is answered: its banner stays out of the way
  await ctx.addInitScript(() => localStorage.setItem('isf_dice', '0'));   // no 3D dice here (d20.ui and dice.ui test them): their animation slows this headless browser enough to upset the timing checks
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
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8800/');
  await p.fill('#deckText', deckText);
  await p.click('#loadDeck');
  await p.waitForFunction(() => window.__isf && window.__isf.deck, null, { timeout: 90000 });
  await p.waitForTimeout(1000);

  let blockAsks = 0;
  // wait for a game state. On the way: confirm blocks whenever the game asks for them, take the autopilot's pick on every question
  // (a search, a target, a counterspell...) and pass at the end of the other players' turns. keepBlock: stop at a block instead.
  const until = async (mode, cond, arg, ms, keepBlock) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 90000)) {
      const ask = await p.evaluate(m => { const g = window.__isfVersus[m].game; return !g ? '' : g.choice ? (g.choice.kind === 'protect' ? 'protect' : 'choice') : g.phase === 'block' ? 'block' : g.phase === 'respond' ? 'respond' : ''; }, mode);
      if (ask === 'choice' || (ask === 'protect' && !keepBlock)) await p.evaluate(() => { const b = document.querySelector('.ch-sheet .ch-auto'); if (b) b.click(); });
      else if (ask === 'protect') await p.evaluate(() => { const b = document.querySelector('.ch-sheet .ch-none'); if (b) b.click(); });          // waiting for blocks: do not answer the attack itself (Settle the Wreckage), let it come
      else if (ask === 'respond') await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-pass').click(), mode);
      else if (ask === 'block' && !keepBlock) { blockAsks++; await p.evaluate(m => document.querySelector('#tab-' + m + ' .vs-block-go').click(), mode); }
      if (await p.evaluate(cond, arg)) return true;
      await p.waitForTimeout(150);
    }
    throw new Error('timed out waiting for the game');
  };
  const tabs = await p.$$eval('.tab:not([hidden])', ts => ts.map(t => t.textContent.trim()));          // the Puzzle tab is back (T-115)
  check('the tab bar has one word per tab, ending Pod and Puzzle (T-115)', tabs.length === 8 && tabs.join(' ') === 'Build Mulligan Practice Simulate Odds Duel Pod Puzzle' && tabs.every(t => !/\s/.test(t)), tabs.join(' | '));

  // ---- 1v1, you play ----
  await p.click('[data-tab=duel]');
  check('1v1: one opponent menu, with a copy of your deck first', (await p.$$('#tab-duel .vs-opp')).length === 1 && /copy/i.test(await p.$eval('#tab-duel .vs-opp option', o => o.textContent)));
  check('1v1: the opponent starts on a random built-in deck', (await p.$eval('#tab-duel .vs-opp', e => e.value)) === 'random', await p.$eval('#tab-duel .vs-opp', e => e.value));
  await p.selectOption('#tab-duel .vs-opp', '');
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && g.phase === 'mull'; }, null, { timeout: 60000 });
  check('a new game starts with your opening hand: seven cards, Keep and a free Mulligan', (await p.$$('#tab-duel .vs-hand .mtg.vs-card')).length === 7 && !!(await p.$('#tab-duel .vs-keep')) && /free/.test(await p.$eval('#tab-duel .vs-mull', b => b.textContent)));
  const h1 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].hand.map(i => i.iid).join(','));
  await p.click('#tab-duel .vs-mull');
  const m1 = await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; return { hand: g.hand.map(i => i.iid).join(','), n: g.hand.length, mull: g.mulligans }; });
  check('Mulligan deals seven new cards', m1.n === 7 && m1.mull === 1 && m1.hand !== h1 && /keep 6/.test(await p.$eval('#tab-duel .vs-mull', b => b.textContent)));
  await p.click('#tab-duel .vs-mull');
  check('after a second mulligan Keep waits until you pick a card for the bottom', await p.$eval('#tab-duel .vs-keep', b => b.disabled));
  await p.evaluate(() => document.querySelector('#tab-duel .vs-hand .vs-card').click()); await viewerPick(p);          // T-134: the card opens in the viewer; "Put it on the bottom" is its button
  check('...choosing a card for the bottom marks it', (await p.$$('#tab-duel .vs-card.pick')).length === 1 && !(await p.$eval('#tab-duel .vs-keep', b => b.disabled)));
  await p.click('#tab-duel .vs-keep');
  await until('duel', () => { const g = window.__isfVersus.duel.game; return g.phase === 'main'; });
  check('...and you keep six', await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; return g.openingHand.length === 6 && g.bottomed.length === 1; }));
  { const lives = await p.$$eval('#tab-duel .vs-life', ls => ls.map(l => l.textContent));          // 40 each at the start; the opponent may have gone first and gained or paid life
    check('the game shows two seats with their life totals and waits for you on your turn', (await p.$$('#tab-duel .vs-seat')).length === 2 && lives.length === 2 && lives.every(t => /^\d+$/.test(t) && +t > 0) && await p.evaluate(() => window.__isfVersus.duel.game.phase === 'main'), lives.join(' / ')); }
  // the deal is random: make sure there is a land in hand (so something is playable), then redraw the table
  if (await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; if (g.hand.some(i => i.card.a.isLand)) return false; const k = g.library.findIndex(i => i.card.a.isLand); g.hand.push(g.library.splice(k, 1)[0]); return true; })) {
    await p.evaluate(() => window.__isfVersus.redraw('duel'));
  }
  const hand0 = (await p.$$('#tab-duel .vs-hand .vs-card')).length;
  check('your hand is shown as card pictures, with the playable ones glowing', hand0 >= 5 && (await p.$$('#tab-duel .vs-hand .mtg img')).length >= 1 && (await p.$$('#tab-duel .vs-card.can')).length >= 1, hand0);
  const lands0 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].battlefield.filter(x => x.asLand).length);
  await p.evaluate(() => { const g = window.__isfVersus.duel.game.games[0]; const l = g.hand.find(i => i.card.a.isLand); if (l) document.querySelector('#tab-duel .vs-card[data-iid="' + l.iid + '"]').click(); });
  await viewerPick(p);          // T-134: the card opens in the viewer; "Play land" is its button
  // a land may ask first (a shock land: pay 2 life?) and enter only once answered: take the autopilot's answer, as everywhere here
  await until('duel', n => { const g = window.__isfVersus.duel.game; return !g.choice && g.games[0].battlefield.filter(x => x.asLand).length > n; }, lands0, 15000).catch(() => {});
  const lands1 = await p.evaluate(() => window.__isfVersus.duel.game.games[0].battlefield.filter(x => x.asLand).length);
  check('tapping a land in your hand opens it, and its Play land button plays it', lands1 === lands0 + 1, lands0 + ' -> ' + lands1);
  await p.click('#tab-duel .vs-attack');
  check('Attack… opens the attacker chooser', !!(await p.$('#tab-duel .vs-attack-go')));
  await p.click('#tab-duel .vs-attack-go');
  await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
  await until('duel', () => { const g = window.__isfVersus.duel.game; return !!g.over || (g.phase === 'main' && g.games[0].turn === 2); });
  const st = await p.evaluate(() => { const g = window.__isfVersus.duel.game; return { my: g.games[0].turn, opp: g.games[1].turn, log: document.querySelectorAll('#tab-duel .vs-log .vs-line').length }; });
  check('End turn: the computer plays its turn and it is your turn again', st.my === 2 && st.opp >= 1 && st.log >= 4, JSON.stringify(st));
  await p.evaluate(() => document.querySelector('#tab-duel .vs-autoturn').click());
  await until('duel', () => { const g = window.__isfVersus.duel.game; return !!g.over || (g.phase === 'main' && g.games[0].turn === 3); });
  check('"Autopilot the rest of my turn" finishes the turn', await p.evaluate(() => { const g = window.__isfVersus.duel.game; return !!g.over || g.games[0].turn === 3; }));
  // a constructed attack: the opponent gets its biggest creature, you get a small one, and you end the turn
  if (await p.evaluate(() => { const g = window.__isfVersus.duel.game; return !g.over && g.phase === 'main'; })) {
    await p.evaluate(() => {
      const G = window.Goldfish, gm = window.__isfVersus.duel.game, me = gm.games[0], op = gm.games[1];
      const cs = me.deck.unique.filter(c => c.a.isCreature && !c.a.kw.has('flying') && !c.a.kw.has('menace')).sort((x, y) => (y.a.power || 0) - (x.a.power || 0));
      const big = G.enterWithTriggers(op, { iid: op.nextIid++, card: cs[0] }, {}, []); big.sick = false; big.enteredTurn = 0; big.counters = 6;
      const small = G.enterWithTriggers(me, { iid: me.nextIid++, card: cs[cs.length - 1] }, {}, []); small.sick = false; small.tapped = false; window.__blk = small.iid; window.__big = big.iid;
      op.battlefield.forEach(q => { if (q !== big && G.isCreaturePerm(q)) q.tapped = true; });
      op.hand = [];          // no removal for the set-up blocker (a Go for the Throat in its main phase left nothing to block with)
      op.library.sort((x, y) => (y.card.a.isLand ? 1 : 0) - (x.card.a.isLand ? 1 : 0));          // ...nor from the cards it draws this turn: lands on top
    });
    await p.evaluate(() => document.querySelector('#tab-duel .vs-end').click());
    await until('duel', () => { const g = window.__isfVersus.duel.game; return g.over || g.phase === 'block' || (g.phase === 'main' && g.games[0].turn >= 4); }, null, 60000, true);
    const ph = await p.evaluate(() => window.__isfVersus.duel.game.phase);
    const why = ph === 'block' ? '' : (await p.$$eval('#tab-duel .vs-log .vs-line:not(.quiet)', ls => ls.slice(-8).map(l => l.textContent))).join(' || ');
    check('when the computer attacks you and you can block, the game stops and asks for your blocks', ph === 'block' && (await p.$$('#tab-duel .vs-blk')).length >= 1, ph + (why ? ' · ' + why : ''));
    if (ph === 'block') check('...and the attacking creatures are marked on the opponent\'s battlefield', (await p.$$('#tab-duel .vs-seat.opp .mtg.attacking')).length >= 1);
    if (ph === 'block') {
      if (shot) await p.screenshot({ path: path.join(shot, 'block.png'), fullPage: true });
      // the game is random: the creature set up to block may have been removed, or the big attacker may not be among the attackers.
      // Then this one step is skipped (and said so) instead of stopping the whole test.
      const canPick = await p.evaluate(() => { const sel = document.querySelector('#tab-duel .vs-blk[data-iid="' + window.__blk + '"]'); if (!sel || ![...sel.options].some(o => o.value === String(window.__big))) return false; sel.value = String(window.__big); return true; });
      await p.evaluate(() => document.querySelector('#tab-duel .vs-block-go').click());
      await until('duel', () => { const g = window.__isfVersus.duel.game; return !!g.over || g.phase === 'main'; });
      const r = await p.evaluate(() => ({ log: [...document.querySelectorAll('#tab-duel .vs-log .vs-line:not(.quiet)')].slice(-6).map(x => x.textContent).join(' || ') }));          // every step is logged now: skip the quiet "nothing happens" lines
      if (canPick) check('your chosen block happens: your creature blocks the attacker', /blocks/.test(r.log), r.log.slice(0, 260));
      else console.log('SKIP  your chosen block happens: in this random game the set-up creature could not block the set-up attacker');
    }
  }
  if (shot) await p.screenshot({ path: path.join(shot, 'duel.png'), fullPage: true });

  // ---- 1v1, all autopilot ----
  await p.selectOption('#tab-duel .vs-you', 'auto');
  await p.click('#tab-duel .vs-new');
  await p.waitForSelector('#tab-duel .vs-toend', { timeout: 30000 });
  await p.click('#tab-duel .vs-next');
  await p.waitForTimeout(300);
  check('autopilot game: +1 turn plays one turn', await p.evaluate(() => window.__isfVersus.duel.game.games.reduce((t, g) => t + g.turn, 0)) === 1);
  // the table itself: card pictures for everything in play, stacks, piles in order, card backs for hidden hands
  for (let i = 0; i < 11; i++) { await p.click('#tab-duel .vs-next'); await p.waitForTimeout(40); }
  // the +1 turn clicks above start turns that play on their own: read the table once they are done and every seat is drawn (a half-drawn seat has no piles yet)
  await p.waitForFunction(() => { const gm = window.__isfVersus.duel.game; return !gm.busy && !gm.acting && [...document.querySelectorAll('#tab-duel .vs-seat')].length === gm.games.length && [...document.querySelectorAll('#tab-duel .vs-seat')].every(s => s.querySelector('.vs-pile.lib b') && s.querySelector('.vs-pile.grave b')); }, null, { timeout: 30000, polling: 200 });
  const tbl = await p.evaluate(() => {
    const gm = window.__isfVersus.duel.game, root = document.querySelector('#tab-duel');
    const seats = [...root.querySelectorAll('.vs-seat')];
    const per = gm.games.map(g => {
      const seat = root.querySelector('.vs-seat[data-pid="' + g.pid + '"]');
      const shown = [...seat.querySelectorAll('.vs-stack')].reduce((t, st) => t + (st.querySelector('.vs-cnt') ? +st.querySelector('.vs-cnt').textContent.slice(1) : 1), 0);
      return { perms: g.battlefield.length, shown, piles: [...seat.querySelectorAll('.vs-pile')].map(x => x.className.replace('vs-pile ', '').split(' ')[0]),
        lib: +seat.querySelector('.vs-pile.lib b').textContent, libReal: g.library.length, grave: +seat.querySelector('.vs-pile.grave b').textContent, graveReal: g.graveyard.length,
        backs: seat.querySelectorAll('.vs-backs i').length, handReal: g.hand.length, faceUp: seat.querySelectorAll('.vs-hand .mtg').length };
    });
    return { order: seats.map(x => x.classList.contains('opp') ? 'opp' : 'me'), per };
  });
  check('the opponent sits at the top of the table and you at the bottom', tbl.order.join(',') === 'opp,me');
  check('every permanent in play is shown as a card picture (stacks counted)', tbl.per.every(x => x.shown === x.perms && x.perms >= 3), tbl.per.map(x => x.shown + '/' + x.perms).join(' , '));
  check('each player has library, command, graveyard and exile piles in that order', tbl.per.every(x => x.piles.join(',') === 'lib,cmd,grave,exile'), tbl.per[0].piles.join(','));
  check('pile counts match the game (library and graveyard)', tbl.per.every(x => x.lib === x.libReal && x.grave === x.graveReal), tbl.per.map(x => x.lib + ' lib, ' + x.grave + ' grave').join(' | '));
  check('the opponent\'s hand is card backs; your hand is face up', tbl.per[1].backs === Math.min(7, tbl.per[1].handReal) && tbl.per[1].faceUp === 0 && tbl.per[0].faceUp === tbl.per[0].handReal);
  const openedViewer = await p.evaluate(() => { document.querySelector('#tab-duel .vs-seat.opp .vs-stack .mtg').click(); return document.querySelector('#lightbox').classList.contains('show') && document.querySelectorAll('.lb-buy').length === 3; });
  check('clicking an opponent\'s card opens it in the card viewer', openedViewer);
  await p.keyboard.press('Escape');
  // the speed slider: one setting shared with the Goldfish Table, and it paces Play
  check('the 1v1 table has the turtle-to-rabbit speed slider', !!(await p.$('#tab-duel .speed-bar input[type=range]')));
  const setSpeed = v => p.$eval('#tab-duel .speed-bar input', (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, String(v));
  await setSpeed(8);
  check('moving it also moves the Goldfish Table\'s slider (one shared setting)', (await p.$eval('#tSpeed', e => e.value)) === '8' && /3× slower/.test(await p.$eval('#tab-duel .speed-txt', e => e.textContent)));
  const timePlay = async v => {
    await setSpeed(v);
    const n0 = await p.evaluate(() => window.__isfVersus.duel.game.games.reduce((t, g) => t + g.turn, 0)), t0 = Date.now();
    await p.click('#tab-duel .vs-play');
    await p.waitForFunction(n => { const g = window.__isfVersus.duel.game; return !!g.over || g.games.reduce((t, x) => t + x.turn, 0) >= n + 3; }, n0, { timeout: 60000 });
    const ms = Date.now() - t0;
    if (await p.evaluate(() => window.__isfVersus.duel.game.playing)) await p.click('#tab-duel .vs-play');
    await p.waitForFunction(() => !window.__isfVersus.duel.game.busy, null, { timeout: 30000 });
    return ms;
  };
  if (shot) await p.screenshot({ path: path.join(shot, 'duel-table.png') });
  // time it on a fresh game, so the game cannot end in the middle of the measurement
  await p.click('#tab-duel .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.duel.game; return g && !g.over && g.games.reduce((t, x) => t + x.turn, 0) === 0; }, null, { timeout: 30000 });
  await p.waitForSelector('#tab-duel .vs-play', { timeout: 30000 });
  {
    const fast = await timePlay(10), slowT = await timePlay(6);
    // the slider makes each pause 3× longer; the engine's own work in those turns does not slow down, so the whole run is somewhat less than 3×
    check('Play runs the game by itself, and the turtle end is clearly slower than the rabbit end', slowT > fast * 2, `3 turns: rabbit ${fast} ms, turtle ${slowT} ms`);
    check('Pause stops it', !(await p.evaluate(() => window.__isfVersus.duel.game.busy)));
  }
  await setSpeed(10);
  if (!(await p.evaluate(() => !!window.__isfVersus.duel.game.over))) await p.click('#tab-duel .vs-toend');
  await p.waitForFunction(() => window.__isfVersus.duel.game.over, null, { timeout: 120000 });

  check('Play to the end finishes the game with a result line', /win|No winner/.test(await p.evaluate(() => window.__isfVersus.duel.game.over)), await p.evaluate(() => window.__isfVersus.duel.game.over));

  // ---- 1v1, many games ----
  await p.fill('#tab-duel .vs-n', '40');
  await p.click('#tab-duel .vs-run');
  await p.waitForSelector('#tab-duel .vs-tiles .tile', { timeout: 120000 });
  const tiles = await p.$$eval('#tab-duel .vs-tiles .tile', ts => ts.map(t => t.textContent));
  check('1v1 series: a win-rate tile for each player, plus length and no-winner tiles', tiles.length === 4 && /%/.test(tiles[0]) && /%/.test(tiles[1]), tiles.map(t => t.slice(0, 26)).join(' | '));
  await p.click('#tab-duel .vs-samples button');
  check('a sample game can be replayed as a log', (await p.$$('#tab-duel .vs-slog .vs-line')).length > 4);

  // ---- pod ----
  await p.click('[data-tab=pod]');
  check('Pod: three opponent menus', (await p.$$('#tab-pod .vs-opp')).length === 3);
  check('Pod: every opponent starts on a random built-in deck', await p.$$eval('#tab-pod .vs-opp', es => es.every(e => e.value === 'random')));
  for (const sel of await p.$$('#tab-pod .vs-opp')) await sel.selectOption('');
  await p.click('#tab-pod .vs-new');
  await p.waitForFunction(() => { const g = window.__isfVersus.pod.game; return g && g.phase === 'mull'; }, null, { timeout: 90000 });
  await p.evaluate(() => document.querySelector('#tab-pod .vs-keep').click());
  await until('pod', () => { const g = window.__isfVersus.pod.game; return g.phase === 'main' || !!g.over; });
  check('a pod game has four seats: three opponents across the top, you at the bottom', (await p.$$('#tab-pod .vs-seat')).length === 4 && (await p.$$('#tab-pod .vs-opps .vs-seat.opp')).length === 3 && !!(await p.$('#tab-pod .vs-arena > .vs-seat.me')));
  check('the pod table has the speed slider too', !!(await p.$('#tab-pod .speed-bar input[type=range]')));
  // playmats and sleeves: every player is dealt a random set, all different; your own pick goes on your seat
  const seatLooks = () => p.$$eval('#tab-pod .vs-seat', ss => ss.map(s => ({ me: s.classList.contains('me'), set: s.dataset.set, sleeved: s.classList.contains('sleeved'),
    mat: getComputedStyle(s).backgroundImage, sleeve: s.style.getPropertyValue('--sleeve'), back: getComputedStyle(s.querySelector('.card-back')).backgroundImage })));
  const lk = await seatLooks(), originals = await p.evaluate(() => window.__isfLooks.MATS.filter(m => m.image).map(m => m.name));          // the ICEYfish original sets (art playmat + art sleeves)
  check('every player in the pod has a playmat-and-sleeves set', lk.length === 4 && lk.every(x => x.set && x.sleeved && x.mat !== 'none' && x.sleeve), lk.map(x => (x.me ? 'You: ' : '') + x.set).join(' | '));
  check('no two players have the same set', new Set(lk.map(x => x.set)).size === 4 && new Set(lk.map(x => x.mat)).size === 4);
  check(`the original designs are dealt first: every seat has one of the ${originals.length} original sets`, originals.length >= 9 && lk.every(x => originals.includes(x.set)), lk.map(x => x.set).join(' | '));
  check('each library shows that player\'s own sleeve back', new Set(lk.map(x => x.back)).size === 4);
  const oppSet = lk.find(x => !x.me).set, oppId = await p.evaluate(n => (window.__isfLooks.MATS.find(m => m.name === n) || { id: 'prism' }).id, oppSet);
  await p.evaluate(id => window.__isfLooks.set({ mat: id, sleeve: id }), oppId);          // you pick the set the first opponent was dealt
  await p.waitForTimeout(300);
  const lk2 = await seatLooks();
  check('picking your own playmat and sleeves puts them on your seat', lk2.find(x => x.me).set === oppSet, lk2.map(x => (x.me ? 'You: ' : '') + x.set).join(' | '));
  check('...and the opponent who had that set takes another, so all four still differ', new Set(lk2.map(x => x.set)).size === 4);
  await p.evaluate(() => window.__isfLooks.set({ mat: 'frozen', sleeve: 'none' }));       // back to no pick of your own
  await p.waitForTimeout(300);
  check('with no pick of your own you are dealt a random set again', (await seatLooks()).every(x => x.set && x.sleeved));
  for (let k = 0; k < 3; k++) {
    if (await p.evaluate(() => !!window.__isfVersus.pod.game.over || window.__isfVersus.pod.game.games[0].dead)) break;
    await p.evaluate(() => document.querySelector('#tab-pod .vs-autoturn').click());
    await until('pod', n => { const g = window.__isfVersus.pod.game; return !!g.over || (g.phase === 'main' && g.games[0].turn === n) || g.games[0].dead; }, k + 2);
  }
  const pod = await p.evaluate(() => { const g = window.__isfVersus.pod.game; return { turns: g.games.map(x => x.turn), over: g.over }; });
  check('in a pod the three computer players each take a turn between yours', !!pod.over || pod.turns.every(t => t >= 3), JSON.stringify(pod));
  if (!pod.over && await p.evaluate(() => window.__isfVersus.pod.game.phase === 'main')) {
    await p.evaluate(() => document.querySelector('#tab-pod .vs-attack').click());
    await until('pod', () => { const g = window.__isfVersus.pod.game; return !!g.picking || !!g.over; });
    const targets = (await p.$$('#tab-pod .vs-target option')).length;
    check('the attacker chooser lets you pick which player to attack', targets >= 2, targets);
    check('...once combat has begun there is no Cancel back to the main phase, only "No attack"', !(await p.$('#tab-pod .vs-attack-cancel')) && !!(await p.$('#tab-pod .vs-noattack')));
    await p.evaluate(() => document.querySelector('#tab-pod .vs-noattack').click());
  }
  if (shot) await p.screenshot({ path: path.join(shot, 'pod.png'), fullPage: true });
  await p.fill('#tab-pod .vs-n', '30');
  await p.click('#tab-pod .vs-run');
  await p.waitForSelector('#tab-pod .vs-tiles .tile', { timeout: 180000 });
  const pt = await p.$$eval('#tab-pod .vs-tiles .tile', ts => ts.map(t => t.textContent));
  check('Pod series: four win-rate tiles, plus length and no-winner tiles', pt.length === 6 && pt.slice(0, 4).every(t => /%/.test(t)), pt.map(t => t.slice(0, 22)).join(' | '));
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' || '));

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
