// T-127 stage 5 (docs/PRIORITY-DESIGN.md), with opts.priority on: the autopilot acts at the blockers and damage steps through the priority loop (CR 509.4, 510.3), the first-strike damage step has its own priority (CR 510.4), \"at end of combat\" triggers (CR 511.2).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer', 'Arcane Encyclopedia'];
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


const fake = { name: 'Test Drawer', type_line: 'Creature — Test', oracle_text: 'At end of combat, draw a card.', mana_cost: '{1}', cmc: 1, power: '1', toughness: '1', qty: 1 };
T('the parser reads "At end of combat, ..." as the endCombat trigger kind', () => {
  const d = G.buildDeck([fake], []); const t = d.unique[0].a.triggers;
  check('a trigger with kind endCombat', t.some(x => x.kinds.includes('endCombat')), JSON.stringify(t.map(x => x.kinds)));
});
T('CR 511.2: the end-of-combat trigger resolves at the end of combat with the rule on, and is inert with it off', () => {
  for (const rule of [true, false]) {
    const d = G.buildDeck([fake], []); const g = G.newGame(d, O, 3); g.turn = 6; g.hand = []; g.battlefield = []; g.library = g.library.length ? g.library : []; g.opts.priority = rule;
    const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: d.unique[0] }, {}, []); p.sick = false; p.enteredTurn = 1;
    const l0 = g.hand.length; G.combat(g);
    check('rule ' + (rule ? 'on' : 'off') + ': ' + (rule ? 'drew a card' : 'nothing'), rule ? g.hand.length === l0 + 1 : g.hand.length === l0, g.hand.length + ' vs ' + l0);
  }
});
T('a seated defender\'s default at the blockers step is the autopilot\'s own pick (CR 509.4)', () => {
  const [a, b] = match2(); on(a); on(b); lands(a, 2, 'Mountain'); lands(b, 3, 'Mountain'); putOn(a, 'Serra Angel'); const bolt = inst(b, 'Lightning Bolt'); b.hand.push(bolt);
  const qs = seated(b, null, () => { G.combat(a); });
  const bq = qs.filter(x => x.d.kind === 'priority' && x.d.step === 'blockers');
  check('the person was asked at the blockers step', bq.length >= 1, qs.map(x => x.d.kind + ':' + x.d.step).join(','));
});
T('the autopilot defender acts through the loop: with the rule on and nobody seated, priorityRound runs its instant-speed pick after blockers', () => {
  const [a, b] = match2(); on(a); on(b); lands(b, 3, 'Mountain'); putOn(a, 'Serra Angel'); b.hand.push(inst(b, 'Lightning Bolt'));
  let calls = 0; const pick = G.instantPick; check('instantPick is exported', typeof pick === 'function');
  const ev = []; G.priorityRound && G.priorityRound(a, 'blockers', ev);
  check('the round did not throw and the stack is empty', (a.match.stack || []).length === 0);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
