// T-127 stage 3 (docs/PRIORITY-DESIGN.md), with opts.priority on: a priority round before each triggered ability resolves (CR 117.4, 405.5): a seated person may respond to the other player's trigger.
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

T('CR 117.4 / 405.5: a seated person is asked before the opponent\'s Young Pyromancer trigger resolves, and a response resolves first', () => {
  const [a, b] = match2(); on(a); on(b); lands(a, 4, 'Mountain'); lands(b, 3, 'Mountain'); putOn(a, 'Young Pyromancer');
  a.hand.push(inst(a, 'Lightning Bolt')); const bolt = inst(b, 'Lightning Bolt'); b.hand.push(bolt);
  const qs = seated(b, d => d.kind === 'priority' && d.step === 'stack' ? d.options.find(o => o.card && o.card.name === 'Lightning Bolt') : undefined, () => { G.castPhase(a); });
  const q = qs.find(x => x.d.kind === 'priority' && x.d.step === 'stack');
  check('asked at the stack step, naming the trigger\'s card', !!q && /Young Pyromancer/.test(q.q.title), q && q.q.title);
  check('the response (their Bolt) was cast, and the trigger still made its token', b.graveyard.includes(bolt) && a.battlefield.filter(x => x.token).length === 1, a.battlefield.filter(x => x.token).length);
  check('the stack is empty afterwards', (a.match.stack || []).length === 0);
});
T('opts.autoPass always: no question for the trigger', () => {
  const [a, b] = match2(); on(a); on(b, { autoPass: 'always' }); lands(a, 4, 'Mountain'); lands(b, 3, 'Mountain'); putOn(a, 'Young Pyromancer'); a.hand.push(inst(a, 'Lightning Bolt')); b.hand.push(inst(b, 'Lightning Bolt'));
  const qs = seated(b, null, () => { G.castPhase(a); });
  check('no priority question', qs.filter(x => x.d.kind === 'priority').length === 0);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
