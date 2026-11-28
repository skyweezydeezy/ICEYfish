// T-127 stage 2 (docs/PRIORITY-DESIGN.md), with opts.priority on: a spell's "whenever you cast" triggers resolve before the spell (CR 603.3); the opponent's end-step and attack windows are the priority question (CR 117.3); auto-pass.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer'];
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
const on = (x, extra) => { x.opts = Object.assign({}, x.opts, { priority: true }, extra || {}); };
T('CR 603.3: Young Pyromancer\'s trigger resolves (its token is made) before Lightning Bolt does', () => {
  const [g, b] = match2(); on(g); on(b); lands(g, 4, 'Mountain'); putOn(g, 'Young Pyromancer'); g.hand.push(inst(g, 'Lightning Bolt'));
  const ev = G.castCard(g, g.hand[0]), at = t => ev.findIndex(e => e.type === t);
  check('the token comes before the damage', at('token') >= 0 && at('damage') > at('token'), ev.map(e => e.type).join(','));
  check('the stack is empty afterwards', (g.match.stack || []).length === 0);
});
T('the opponent\'s end-step window keeps its instant question when opts.priority is on (and obeys autoPass)', () => {
  const [a, b] = match2(); on(a); on(b); lands(b, 3, 'Mountain'); const bolt = (b.hand.push(inst(b, 'Lightning Bolt')), b.hand[0]); b.hand.length = 1;
  const qs = seated(b, null, () => { G.instantWindow(b, [], 'end'); });
  const q = qs.find(x => x.d.kind === 'instant');
  check('kind instant, step end, title "End of ...\'s turn"', !!q && q.d.step === 'end' && /^End of .*'s turn: cast an instant\?/.test(q.q.title), q && q.q.title);
  check('Pass is the default for a person who takes it', b.hand.includes(bolt) || b.graveyard.includes(bolt));
});
T('opts.autoPass always: the end-step window does not ask, and the person passes', () => {
  const [a, b] = match2(); on(a); on(b, { autoPass: 'always' }); lands(b, 3, 'Mountain'); const bolt = inst(b, 'Lightning Bolt'); b.hand.push(bolt);
  const qs = seated(b, null, () => { G.instantWindow(b, [], 'end'); });
  check('no question and the Bolt stays in hand', qs.filter(x => x.d.kind === 'priority' || x.d.kind === 'instant').length === 0 && b.hand.includes(bolt));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
