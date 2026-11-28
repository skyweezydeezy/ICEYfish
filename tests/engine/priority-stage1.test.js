// T-127 stages 0+1 (docs/PRIORITY-DESIGN.md): one stack per table (g.match.stack, or g.stack in a goldfish game) and the priority round (opts.priority, opts.autoPass, question kind 'priority'). CR 117.3-117.4: each player in turn order may act; passing changes nothing.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves'];
const cards = base.cards.filter(c => !NAMES.includes(c.name)).slice(0, 30).concat(NAMES.map(n => { try { return find(n); } catch (e) { return null; } }).filter(Boolean));
const deck = G.buildDeck(cards, base.tokens);
const O = { turns: 20, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, prioritizeCommander: true };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('card not in the test deck: ' + n); return c; };
const bare = seed => { const g = G.newGame(deck, O, seed || 3); g.turn = 6; g.hand = []; g.battlefield = []; g.graveyard = []; g.exile = []; g.command = []; g.library = g.library.slice(0, 40); return g; };
const inst = (g, n) => ({ iid: g.nextIid++, card: by(n) });
const putOn = (g, n) => { const p = G.enterWithTriggers(g, inst(g, n), {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const lands = (g, n, name) => { const o = []; for (let i = 0; i < n; i++) o.push(putOn(g, name || 'Mountain')); return o; };
const T = (name, fn) => { try { fn(); } catch (e) { check(name + ' (threw)', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); } };
const seated = (g, answer, play) => { const qs = []; g.ask = (gg, d) => { const q = D.question(gg, d); qs.push({ d, q }); return answer ? answer(d, q) : undefined; }; try { play(); } finally { g.ask = null; } return qs; };

const match2 = () => { const g = bare(3), b = bare(4); G.linkMatch(g, b); return [g, b]; };
const run = (opts, answer, steps) => {          // a match: a's turn is played, b is a seated person holding Lightning Bolt with open Mountains
  const [a, b] = match2(); a.opts = Object.assign({}, a.opts, opts); b.opts = Object.assign({}, b.opts, opts);
  lands(a, 4, 'Island'); lands(b, 3, 'Mountain'); putOn(a, 'Serra Angel');
  const bolt = (b.hand.push(inst(b, 'Lightning Bolt')), b.hand[b.hand.length - 1]);
  a.turn = 5; a.activeTurn = true; b.activeTurn = false;
  const qs = seated(b, answer, () => { G.endTurn; steps(a, b); });
  return { a, b, bolt, qs };
};
const play = (a, b) => { G.combat(a); G.castPhase(a); };
const asked = qs => qs.filter(x => x.d.kind === 'priority').map(x => x.d.step);

T('off by default: a seated person is never asked for priority', () => {
  const r = run({ priority: false }, null, play);
  check('no priority question', asked(r.qs).length === 0, asked(r.qs).join(','));
});
T('opts.priority on, smart: the person holding Lightning Bolt is asked on the other player\'s turn', () => {
  const r = run({ priority: true }, null, play);
  const st = asked(r.qs);
  check('asked at the beginning of combat and at the end of the main phase, and passing changes nothing', st.includes('beginCombat') && st.includes('main'), st.join(','));
  check('the default is Pass: Lightning Bolt is still in hand', r.b.hand.includes(r.bolt) && r.b.graveyard.length === 0);
});
T('opts.autoPass always: never asked', () => {
  const r = run({ priority: true, autoPass: 'always' }, null, play);
  check('no question', asked(r.qs).length === 0, asked(r.qs).join(','));
});
T('opts.autoPass never: asked at every step, also on their own turn', () => {
  const [a, b] = match2(); a.opts = Object.assign({}, a.opts, { priority: true, autoPass: 'never' }); b.opts = a.opts;
  lands(a, 3, 'Mountain'); a.hand.push(inst(a, 'Lightning Bolt')); a.activeTurn = true; b.activeTurn = false; a.turn = 5;
  const qs = seated(a, null, () => { G.combat(a); });
  check('the active person is asked at the beginning of their own combat', asked(qs).includes('beginCombat'), asked(qs).join(','));
});
T('a person who answers with Lightning Bolt casts it as a response at the beginning of combat', () => {
  const r = run({ priority: true }, (d) => d.kind === 'priority' && d.step === 'beginCombat' ? d.options.find(o => o.card && o.card.name === 'Lightning Bolt') : undefined, play);
  check('the Bolt left the hand (cast)', !r.b.hand.includes(r.bolt) && r.b.graveyard.includes(r.bolt), r.b.graveyard.length);
});
T('the table stack is empty after the turn (stage 0: one stack per table)', () => {
  const r = run({ priority: true }, null, play);
  check('match stack empty', (r.a.match.stack || []).length === 0);
  const g = bare(5); G.castPhase(g); check('goldfish stack empty', (g.stack || []).length === 0);
});
T('stackView sees a spell and a trigger on the one stack (stage 0)', () => {
  const [a, b] = match2(); lands(a, 6, 'Mountain'); a.hand.push(inst(a, 'Shivan Dragon'));
  let seen = null;
  const qs = seated(a, (d) => { if (d.kind === 'resolve') seen = G.stackView(a); }, () => { G.castCard(a, a.hand[0]); });
  check('while Shivan Dragon waits, the view lists it as a spell', !!seen && seen.some(x => x.kind === 'spell' && x.card.name === 'Shivan Dragon'), JSON.stringify(seen && seen.map(x => x.kind)));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
