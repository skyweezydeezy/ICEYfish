// T-130: two seated people (a game against a friend on another device, remote.js / versus.js) and the priority question: each question
// is for the seat that holds priority (q.seat), the asked seat is the only one that answers it, and the question's signature is the
// same on both devices (the two devices compare it before an answer counts). Needs no browser.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Lightning Bolt', 'Serra Angel', 'Mountain', 'Island'];
const deck = G.buildDeck(base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(find)), base.tokens);
const by = n => deck.unique.find(c => c.name === n);
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, priority: true, autoPass: 'never' };
const bare = seed => { const g = G.newGame(deck, O, seed); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const put = (g, n) => { const q = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); q.sick = false; q.tapped = false; q.enteredTurn = 1; return q; };
const make = () => {
  const a = bare(3), b = bare(4); G.linkMatch(a, b); D.seat(a); D.seat(b);
  for (let i = 0; i < 3; i++) { put(a, 'Mountain'); put(b, 'Mountain'); }
  a.hand.push({ iid: a.nextIid++, card: by('Lightning Bolt') }); b.hand.push({ iid: b.nextIid++, card: by('Lightning Bolt') });
  a.turn = 5; a.activeTurn = true; b.activeTurn = false;
  return [a, b];
};
(async () => {
  const [a, b] = make(), asked = [];
  await D.resolveSeats([a, b], [0, 1], gs => { G.combat(gs[0]); G.castPhase(gs[0]); }, (q, view) => { if (q.kind === 'priority') asked.push({ seat: q.seat, step: q.step, sig: q.sig, turnOf: q.turnOf, stepName: q.stepName, opts: q.options.map(o => o.name) }); return 'none'; });
  const seats = new Set(asked.map(x => x.seat));
  check('both seated people were asked for priority', seats.has(0) && seats.has(1), asked.map(x => x.seat + ':' + x.step).join(' '));
  check('each question carries the seat it is for, and it is that seat that holds the instant', asked.every(x => (x.seat === 0 || x.seat === 1) && x.opts.includes('Lightning Bolt')));
  check('where both are asked at a step, the active player (seat 0) is asked first (CR 117.3)', asked.every((x, i) => !(x.seat === 0 && asked.slice(0, i).some(y => y.step === x.step && y.seat === 1))), JSON.stringify(asked.map(x => x.seat + x.step)));
  check('the question has what the sheet writes its context from (step name and whose turn)', asked.every(x => x.stepName && x.turnOf), asked[0] && asked[0].stepName + '/' + asked[0].turnOf);
  // the same game on the other device gives the same question signatures (the two devices compare them)
  const [a2, b2] = make(), asked2 = [];
  await D.resolveSeats([a2, b2], [0, 1], gs => { G.combat(gs[0]); G.castPhase(gs[0]); }, q => { if (q.kind === 'priority') asked2.push(q.seat + ':' + q.sig); return 'none'; });
  check('a second copy of the game asks the same questions with the same signatures', asked2.join('|') === asked.map(x => x.seat + ':' + x.sig).join('|'));
  check('the non-active seat passed everywhere: its Lightning Bolt is still in hand (the active seat\'s own turn is the autopilot\'s)', b.hand.some(i => i.card.name === 'Lightning Bolt'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL  threw: ' + (e && e.stack || e)); process.exit(1); });
