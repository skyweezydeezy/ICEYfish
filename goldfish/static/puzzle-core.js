/* ICEYfish - Turn-2 puzzle: the rules of the mini game, with no page in it (T-096). Used by puzzle.js in the browser and by
   tools/lib/turn2.js (the analysis tool, the puzzle builder, the tests) in node, so the page and the checks play the same game.

   A puzzle is a real goldfish hand (fixed seed) that wins on turn 2, played against an opponent seat that is given a revealed package of
   interaction. The opponent's habit is the same for every package: it uses its counterspell on the first spell it legally can, and its
   removal spell on the first creature it legally can. The engine decides what is legal (T-072 targets, T-080 free counters, "unless you
   pay" taxes). Nothing here changes the engine: a game is G.newGame + G.mulligan + G.linkMatch, and every call goes through decide.js. */
(function (root) {
  'use strict';
  const G = root.Goldfish || (typeof require !== 'undefined' ? require('./sim.js') : null);
  const D = root.Decide || (typeof require !== 'undefined' ? require('./decide.js') : null);
  if (!G || !D) return;

  const COUNTERS = /Counterspell|Force of Will|Spell Pierce|Flusterstorm|Mental Misstep|Fierce Guardianship|Daze|Mana Tithe|Force of Negation|Pact of Negation|Mana Drain/;
  const REMOVAL = /Swords to Plowshares|Path to Exile|Lightning Bolt|Doom Blade|Go for the Throat/;

  // the opponent's answer to the engine's question when it may respond to your spell: its first counterspell, else its removal, else nothing
  function greedy(q) {
    const opts = q.options.map((o, k) => ({ o, k })).filter(x => !/in response: activate/.test(x.o.note || ''));
    const w = opts.find(x => COUNTERS.test(x.o.name)) || opts.find(x => REMOVAL.test(x.o.name));
    return w ? w.k : 'none';
  }

  // The opponent's seat: a game of its own whose zones are set by hand. cardOf(name) gives a card as the deck loader makes it.
  // Its library is Wastes only, so what it draws never changes the puzzle; its lands are untapped basic lands (pkg.landName, default Island).
  function makeOpp(cardOf, pkg, onPlay, seed) {
    const land = pkg.landName || 'Island';
    const names = [...new Set([].concat(pkg.hand || [], pkg.battlefield || [], pkg.commander ? [pkg.commander] : [], [land, 'Wastes']))];
    const cards = names.map(n => Object.assign({}, cardOf(n), { qty: n === 'Wastes' ? 60 : n === land ? 30 : 1 }));
    const deck = G.buildDeck(cards, []);
    const by = n => deck.unique.find(x => x.name === n);
    const o = { turns: 10, onPlay: !onPlay, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true, policy: {} };
    const b = G.newGame(deck, o, (seed ^ 0x9e3779b9) >>> 0);
    b.hand = []; b.battlefield = []; b.command = []; b.graveyard = []; b.exile = []; b.library = [];
    const put = (n, zone) => { b[zone].push({ iid: b.nextIid++, card: by(n) }); };
    (pkg.hand || []).forEach(n => put(n, 'hand'));
    for (let i = 0; i < 60; i++) put('Wastes', 'library');
    b.mulligans = 0;
    for (let i = 0; i < (pkg.lands || 0); i++) { const l = G.enter(b, { iid: b.nextIid++, card: by(land) }, {}); l.tapped = false; }
    for (const n of pkg.battlefield || []) { const p = G.enterWithTriggers(b, { iid: b.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; }
    if (pkg.commander) { const p = G.enterWithTriggers(b, { iid: b.nextIid++, card: Object.assign({}, by(pkg.commander), { commander: true }) }, {}, []); p.sick = false; }
    return b;
  }

  // The match: the person's game g (seat 0) and the opponent's b (seat 1), the kept hand dealt. deck is G.buildDeck(...) of the puzzle's deck.
  function newMatch(deck, opts, puzzle, b) {
    const g = G.newGame(deck, Object.assign({}, opts, { onPlay: puzzle.side === 'play' }), puzzle.seed);
    if (b) G.linkMatch(g, b);
    G.mulligan(g);
    return { g, b, games: b ? [g, b] : [g], onPlay: puzzle.side === 'play', turnsDone: 0, order: puzzle.side === 'play' ? ['me', 'opp', 'me'] : ['opp', 'me', 'opp', 'me'], pos: 0, log: [] };
  }
  const won = g => !!(g.killTurn || (g.match && g.match.winner === 0));
  const winsOnTurn2 = g => !!(g.killTurn && g.killTurn <= 2);

  // ---- one move of the person -----------------------------------------------------------------------------------------------------------
  // moves: { do: 'land', card } plays that land, { do: 'cast', card } casts that card, { do: 'auto' } lets the autopilot play the rest of the
  // turn (its lands, its spells, the combo), then ends the turn. { do: 'pass' } ends the turn with nothing more played.
  // Every engine call is a function of the games; run(fn) makes it with both seats seated. answer(q, view) gives the pick for a question; the
  // default answers the opponent's with greedy() and the person's with the autopilot's choice, paying every "unless you pay" it can.
  function defaultAnswer(q) {
    if (q.kind === 'priority') return q.seat === 1 && (q.step === 'combat' || q.step === 'end') ? greedy(q) : 'none';          // T-127: only the old windows (the attack, the end step) ask the hidden opponent to act
    if (q.seat === 1) return greedy(q);
    if (q.kind === 'tax') return Math.max(0, q.options.findIndex(o => /pay/i.test(o.name)));
    if (q.kind === 'resolve' || q.kind === 'counter' || q.kind === 'instant' || q.kind === 'priority') return 'none';
    if (q.kind === 'target' && q.options.length) return 0;
    return 'auto';
  }
  function seatBoth(m) { if (m.b) { D.seat(m.g); D.seat(m.b); } }
  function unseat(m) { m.g.ask = null; m.g.choices = { on: false }; if (m.b) { m.b.ask = null; m.b.choices = { on: false }; } }
  const pool = x => x.hand.concat(x.command || []);
  const callOf = mv => mv.do === 'land' ? (gs => { const i = pool(gs[0]).find(x => x.card.name === mv.card); return i ? G.playLandCard(gs[0], i) : null; })
    : mv.do === 'cast' ? (gs => { const i = pool(gs[0]).find(x => x.card.name === mv.card); return i ? G.castCard(gs[0], i) : null; })
    : null;
  function runSync(m, fn, answer) {
    if (!m.b) return fn(m.games);
    seatBoth(m); const answers = {};
    try {
      for (;;) {
        const r = D.attemptSeats(m.games, [0, 1], fn, answers);
        if (r.done) return r.result;
        const q = r.ask, pick = (answer || defaultAnswer)(q, r.view);
        if (q.seat === 1) m.log.push(q.title + ' -> ' + (pick === 'none' ? 'no response' : (q.options[pick] || {}).name));
        (answers[q.seat] = answers[q.seat] || []).push({ sig: q.sig, pick });
      }
    } finally { unseat(m); }
  }
  async function runAsync(m, fn, answer) {
    if (!m.b) return fn(m.games);
    seatBoth(m); const answers = {};
    try {
      for (;;) {
        const r = D.attemptSeats(m.games, [0, 1], fn, answers);
        if (r.done) return r.result;
        const q = r.ask, pick = await (answer || defaultAnswer)(q, r.view);
        (answers[q.seat] = answers[q.seat] || []).push({ sig: q.sig, pick });
      }
    } finally { unseat(m); }
  }

  // The turn structure: who is to move. advance(m) plays the opponent's turns (the engine's autopilot, nothing asked of it) until it is the
  // person's turn, or the game is over. Returns 'me' (the person's turn is next), or 'over'.
  function advance(m) {
    while (m.pos < m.order.length) {
      if (won(m.g)) return 'over';
      if (m.order[m.pos] === 'me') return 'me';
      if (m.b) G.playTurn(m.b);
      m.pos++;
    }
    return 'over';
  }
  // a person's turn: begin (untap, upkeep, draw), then their moves, one at a time
  const beginTurn = (m, answer) => runSync(m, gs => G.beginTurn(gs[0]), answer);
  function finishTurn(m, how, answer) {          // how: 'auto' (the autopilot plays the rest) or 'pass'
    if (how === 'auto' && !won(m.g)) runSync(m, gs => D.turn.main1(gs[0]), answer);
    if (!won(m.g)) runSync(m, gs => G.endTurn(gs[0]), answer);
    m.pos++; m.turnsDone++;
  }
  // Play a whole line (moves per turn) with the default answers; strict: a move that cannot be made makes the result invalid
  function play(m, line, strict) {
    let mine = 0, invalid = false;
    while (advance(m) === 'me' && mine < 2) {
      const mv = (line && line.moves && line.moves[mine++]) || [];
      beginTurn(m);
      let how = 'auto';
      for (const x of mv) {
        if (won(m.g)) break;
        if (x.do === 'pass') { how = 'pass'; continue; }
        const f = callOf(x); const res = f ? runSync(m, f) : true;
        if (strict && !res) invalid = true;
      }
      finishTurn(m, how);
      if (won(m.g)) break;
    }
    return { win: winsOnTurn2(m.g), turn: m.g.killTurn || null, invalid, log: m.log };
  }


  // ======================================================================================================================================
  // T-115: hand-built puzzles. A puzzle sets BOTH seats by hand (hand, board, graveyard, library order, life, turn) and the person then plays
  // moves; the opponent seat is a real engine seat whose hand is hidden. Moves: { do: 'land'|'cast', card }, { do: 'ability', card, i },
  // { do: 'attack', who: [creature names] | 'all' }, { do: 'end' }; every move may carry picks: [text] that answer the engine's questions
  // for that move (the first option whose name contains the text; default: the autopilot's pick).
  // ======================================================================================================================================
  const FILLER = 'Blightsteel Colossus';          // what a library holds after the cards the puzzle names: a card nobody can cast (twelve mana)
  const nameOf = e => typeof e === 'string' ? e : e.name;
  const landList = (spec, land) => Array.isArray(spec.lands) ? spec.lands : Array.from({ length: spec.lands || 0 }, () => land);
  // One seat. spec: { life, turn, lands: n | [names], land: basic name, battlefield: [name | {name, tapped, sick, counters}], hand, graveyard, exile, library: [top first],
  // poison, commander }. cardOf(name) gives a card as the deck loader makes it. Filler library: Wastes.
  function makeSeat(cardOf, spec, onPlay, seed) {
    const land = spec.land || 'Forest', lands = landList(spec, land);
    const names = [...new Set([].concat(spec.hand || [], (spec.battlefield || []).map(nameOf), spec.graveyard || [], spec.exile || [], spec.library || [], lands, [land, FILLER]))];
    const cards = names.map(n => Object.assign({}, cardOf(n), { qty: n === FILLER ? 60 : n === land ? 30 : 1 }));
    const deck = G.buildDeck(cards, []);
    const by = n => deck.unique.find(x => x.name === n);
    const o = { turns: 40, onPlay: !!onPlay, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 20, policy: {} };
    const b = G.newGame(deck, o, seed >>> 0);
    b.hand = []; b.battlefield = []; b.command = []; b.graveyard = []; b.exile = []; b.library = [];
    const put = (n, zone) => { b[zone].push({ iid: b.nextIid++, card: by(n) }); };
    (spec.hand || []).forEach(n => put(n, 'hand'));
    (spec.graveyard || []).forEach(n => put(n, 'graveyard'));
    (spec.exile || []).forEach(n => put(n, 'exile'));
    (spec.library || []).forEach(n => put(n, 'library'));
    if (!spec.exactLibrary) for (let i = 0; i < 40; i++) put(FILLER, 'library');          // exactLibrary: the library is exactly the cards named (a small library)
    b.mulligans = 0;
    for (const n of lands) { const l = G.enter(b, { iid: b.nextIid++, card: by(n) }, {}); l.tapped = false; }
    for (const e of spec.battlefield || []) {
      const p = G.enterWithTriggers(b, { iid: b.nextIid++, card: by(nameOf(e)) }, {}, []); if (!p) continue;
      p.sick = !!(e.sick); p.tapped = !!(e.tapped);
      if (e.counters) p.counters = e.counters;
    }
    if (spec.life != null) b.life = spec.life;
    if (spec.turn != null) b.turn = spec.turn;
    return b;
  }
  // The scenario: me (seat 0) and the hidden opponent (seat 1), linked. puzzle: { me, opp, onPlay (me first, default true), seed, deadline }.
  function newScenario(cardOf, pz) {
    const onPlay = pz.onPlay !== false, seed = pz.seed || 1;
    const g = makeSeat(cardOf, pz.me, onPlay, seed), b = makeSeat(cardOf, pz.opp, !onPlay, (seed ^ 0x9e3779b9) >>> 0);
    G.linkMatch(g, b);
    return { g, b, games: [g, b], pz, payMode: 'auto', mine: 0, over: null, log: [], order: onPlay ? 'me' : 'opp', started: false };
  }
  const myPool = x => x.hand.concat(x.command || []);
  function permNamed(g, name, pred) { return g.battlefield.find(p => p.card.name === name && (!pred || pred(p))); }
  // the call for one move (a function of the games), or null for a move that cannot be made now
  function moveCall(m, mv) {
    switch (mv.do) {
      case 'land': return gs => { const i = myPool(gs[0]).find(x => x.card.name === mv.card); return i && G.canPlayLand(gs[0]) ? G.playLandCard(gs[0], i) : null; };
      case 'cast': return gs => { const i = myPool(gs[0]).find(x => x.card.name === mv.card); return i ? G.castCard(gs[0], i) : null; };
      case 'ability': return gs => { const p = gs[0].battlefield.filter(x => x.card.name === mv.card)[mv.n || 0]; return p ? G.useAbility(gs[0], p, mv.i || 0) : null; };
      case 'attack': return gs => {
        const g = gs[0], ok = g.battlefield.filter(p => G.canAttack(g, p));
        const who = mv.who === 'all' ? ok : [].concat(mv.who).map(n => ok.find(p => p.card.name === n && !(mv._used || (mv._used = new Set())).has(p.iid) && (mv._used.add(p.iid), true))).filter(Boolean);
        mv._used = null;
        return who.length ? D.turn.combat(g, { attackers: who.map(p => p.iid) }) : null;
      };
      case 'loyalty': return gs => { const p = gs[0].battlefield.filter(x => x.card.name === mv.card)[mv.n || 0]; return p ? G.useLoyalty(gs[0], p, mv.i || 0, gs[0]) : null; };          // a planeswalker's loyalty ability (i: its place in the list)
      default: return null;
    }
  }
  // the answers for a person's question: from the move's picks, else the autopilot's
  function answerFor(mv, payMode) {
    const picks = (mv.picks || []).slice(), resp = (mv.resp || []).slice(), pays = (mv.pay || []).slice();
    return (q, view) => {
      if (q.kind === 'priority') return q.seat === 1 && (q.step === 'combat' || q.step === 'end') ? greedy(q) : 'none';          // T-127: the priority question is never part of a puzzle's scripted answers; the hidden opponent acts only in the old windows (the attack, the end step)
      if (q.seat === 1) return greedy(q);
      if (q.kind === 'resolve') return 'none';
      if (q.kind === 'pay' && !pays.length && typeof payMode === 'function') return payMode(q);          // a person-model: a function from the question to a pick
      if (q.kind === 'pay' && !pays.length && payMode && payMode !== 'auto') return payMode;          // 'smart': the payment a person gets by pressing Confirm (the one that wastes no mana)
      if (q.kind === 'pay' && pays.length) { const t = String(pays.shift()).toLowerCase(), k = q.options.findIndex(o => (o.name || '').toLowerCase().includes(t)); if (k >= 0) return k; }          // pay: which sources pay (the first option whose name contains the text); the autopilot's choice otherwise
      if (q.kind === 'counter' && q.options && q.options.length) {          // a window to respond to the opponent's spell: resp lists, in order, the instants this move casts in response (the first option whose name contains the text); none otherwise
        const t = resp[0], k = t == null ? -1 : q.options.findIndex(o => (o.name || '').toLowerCase().includes(String(t).toLowerCase()));
        if (k >= 0) { resp.shift(); return k; }
        return 'none';
      }
      if (picks.length && !/^(pay|tax|resolve|counter)$/.test(q.kind || '')) { const t = picks.shift(), k = q.options.findIndex(o => (o.name || '').toLowerCase().includes(String(t).toLowerCase())); if (k >= 0) return k; }
      return defaultAnswer(q, view);
    };
  }
  const dead = g => g.life <= 0 || g.dead;
  function verdict(sc) {
    const g = sc.g, b = sc.b;
    if (g.match.winner === 0 || b.life <= 0 || b.dead) return 'win';
    if (g.match.winner === 1 || dead(g)) return 'lose';
    return null;
  }
  // my turn begins: the opponent's turns come first if it is on the play
  function startMyTurn(sc, answer) {
    runSync(sc, gs => G.beginTurn(gs[0]), answer); sc.mine++; sc.phase = 'me';
    return verdict(sc);
  }
  // advance the opponent's turn(s) until my turn begins; returns a verdict or null (it is my turn: sc.phase 'me')
  function toMyTurn(sc, answer) {
    if (sc.order === 'opp' || sc.started) {
      if (sc.started) sc.order = 'opp';
      while (sc.order === 'opp') { runSync(sc, gs => G.playTurn(gs[1]), answer); sc.order = 'me'; const v = verdict(sc); if (v) return (sc.over = v); }
    }
    sc.started = true; sc.order = 'me';
    sc.over = startMyTurn(sc, answer);
    return sc.over;
  }
  // end my turn; the game ends as a loss when the deadline turn is over
  function endMine(sc, answer) {
    runSync(sc, gs => G.endTurn(gs[0]), answer);
    let v = verdict(sc);
    if (!v && sc.mine >= (sc.pz.deadline || 1)) v = 'lose';
    sc.phase = v ? 'over' : 'opp'; sc.over = v;
    return v;
  }
  function doMove(sc, mv) {
    const f = moveCall(sc, mv); if (!f) return { ok: false };
    const had = mv.do === 'cast' || mv.do === 'land' ? myPool(sc.g).filter(x => x.card.name === mv.card).length : 0;
    const r = runSync(sc, f, answerFor(mv, sc.payMode));
    const gone = had && myPool(sc.g).filter(x => x.card.name === mv.card).length < had;          // a spell that was countered or fizzled still left the hand: the move was made
    return { ok: !!r || gone, ev: r, countered: !r && gone, verdict: (sc.over = verdict(sc)) };
  }
  // play a line: [[moves of my turn 1], [moves of turn 2]...]; a turn's moves end with an implicit end of turn. Returns { result, invalid, sc }
  function playScenario(cardOf, pz, line, strict, partial, payMode) {
    const sc = newScenario(cardOf, pz); if (payMode) sc.payMode = payMode; let invalid = false;
    for (let t = 0; t < (partial ? line.length : (pz.deadline || 1)); t++) {
      if (toMyTurn(sc)) break;
      for (const mv of line[t] || []) { if (sc.over) break; const r = doMove(sc, mv); if (!r.ok && strict) invalid = true; if (!r.ok) break; }
      if (sc.over) break;
      if (t + 1 >= (pz.deadline || 1) ? endMine(sc) : (runSync(sc, gs => G.endTurn(gs[0]), null), sc.over = verdict(sc))) break;
    }
    return { result: sc.over || (partial ? 'open' : 'lose'), invalid, sc };
  }

  // the same turn steps for a page: every engine call may wait for the person's answer (runAsync)
  async function toMyTurnA(sc, answer) {
    if (sc.order === 'opp' || sc.started) {
      if (sc.started) sc.order = 'opp';
      while (sc.order === 'opp') { await runAsync(sc, gs => G.playTurn(gs[1]), answer); sc.order = 'me'; const v = verdict(sc); if (v) return (sc.over = v); }
    }
    sc.started = true; sc.order = 'me';
    await runAsync(sc, gs => G.beginTurn(gs[0]), answer); sc.mine++; sc.phase = 'me'; sc.over = verdict(sc);
    return sc.over;
  }
  async function endMineA(sc, answer) {
    await runAsync(sc, gs => G.endTurn(gs[0]), answer);
    let v = verdict(sc);
    if (!v && sc.mine >= (sc.pz.deadline || 1)) v = 'lose';
    sc.phase = v ? 'over' : 'opp'; sc.over = v;
    return v;
  }
  // every card name a puzzle needs (for loading the cards in the page)
  function namesOf(pz) {
    const out = new Set([FILLER]);
    for (const s of [pz.me, pz.opp]) { out.add(s.land || 'Forest'); for (const n of [].concat(s.hand || [], (s.battlefield || []).map(nameOf), s.graveyard || [], s.exile || [], s.library || [], landList(s, s.land || 'Forest'))) out.add(n); }
    return [...out];
  }

  const api = { toMyTurnA, endMineA, namesOf, FILLER, makeSeat, newScenario, moveCall, answerFor, verdict, toMyTurn, endMine, doMove, playScenario, COUNTERS, REMOVAL, greedy, makeOpp, newMatch, won, winsOnTurn2, defaultAnswer, runSync, runAsync, advance, beginTurn, finishTurn, play, callOf };
  if (typeof module !== 'undefined') module.exports = api;
  root.PuzzleCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
