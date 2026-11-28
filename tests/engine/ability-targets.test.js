// T-132 (docs/PRIORITY-DESIGN.md section 17), with opts.priority and opts.abilityTargets on: the targets of a triggered ability are chosen as it goes on the stack (CR 603.3d) and checked again as it resolves (CR 608.2b); an ability's target does not change when the best one is removed in response.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer', 'Ravenous Chupacabra'];
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
const on = (x, extra) => { x.opts = Object.assign({}, x.opts, { priority: true, abilityTargets: true }, extra || {}); };


const scene = (flag) => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 5, 'Swamp'); a.hand.push(inst(a, 'Ravenous Chupacabra'));
  const angel = putOn(b, 'Serra Angel'), elves = putOn(b, 'Llanowar Elves'); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));          // something to answer with, so the person is asked at the stack step
  return { a, b, angel, elves };
};
const respond = (b, angel) => d => { if (d.kind === 'priority' && d.step === 'stack' && !angel.gone) { angel.gone = true; b.battlefield.splice(b.battlefield.indexOf(angel), 1); b.graveyard.push({ iid: angel.iid, card: angel.card }); } return undefined; };
T('CR 603.3d / 608.2b: the trigger\'s target (the best creature) is kept when it goes on the stack; if it leaves in response, the trigger does nothing (it does not pick another)', () => {
  const { a, b, angel, elves } = scene();
  seated(b, respond(b, angel), () => { G.castPhase(a); });
  check('Chupacabra resolved onto the table', a.battlefield.some(x => x.card.name === 'Ravenous Chupacabra'));
  check('the response happened (Serra Angel is gone)', !!angel.gone && !b.battlefield.includes(angel));
  check('Llanowar Elves is still there: no new target was chosen on resolution', b.battlefield.includes(elves));
  check('the stack is empty afterwards', (a.match.stack || []).length === 0);
});
T('with opts.abilityTargets off the old behaviour stands: the target is chosen on resolution (Llanowar Elves dies)', () => {
  const { a, b, angel, elves } = scene(false);
  seated(b, respond(b, angel), () => { G.castPhase(a); });
  check('Llanowar Elves was destroyed (picked at resolution)', !b.battlefield.includes(elves));
});
T('a seated person is asked for the target before the stack question, and the pick is the one that resolves', () => {
  const [a, b] = match2(); on(a); on(b); lands(b, 5, 'Swamp'); b.hand.push(inst(b, 'Ravenous Chupacabra'));
  const angel = putOn(a, 'Serra Angel'), elves = putOn(a, 'Llanowar Elves'), order = [];
  seated(b, (d, q) => { order.push(d.kind + (d.step ? ':' + d.step : '')); if (d.kind === 'target') return d.options.find(o => o.card && o.card.name === 'Llanowar Elves') || undefined; return undefined; }, () => { G.castPhase(b); });
  check('the target question came before any stack question', order.indexOf('target') >= 0 && (order.indexOf('priority:stack') < 0 || order.indexOf('target') < order.indexOf('priority:stack')), order.join(','));
  check('the person\'s pick (Llanowar Elves) was destroyed and Serra Angel stayed', !a.battlefield.includes(elves) && a.battlefield.includes(angel), a.battlefield.map(x => x.card.name).join(','));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
