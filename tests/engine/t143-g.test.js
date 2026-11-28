// T-132 (docs/PRIORITY-DESIGN.md section 17), with opts.priority and opts.abilityTargets on: the targets of a triggered ability are chosen as it goes on the stack (CR 603.3d) and checked again as it resolves (CR 608.2b); an ability's target does not change when the best one is removed in response.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer', 'Ravenous Mulldrifter', 'Appa, Steadfast Guardian', 'Plains', 'Mulldrifter'];
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



const APPA = 'Appa, Steadfast Guardian';
const scene = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 6, 'Plains'); a.hand.push(inst(a, APPA));
  const chup = putOn(a, 'Mulldrifter'); chup.inst = chup.inst || { iid: chup.iid, card: chup.card };
  lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  putOn(b, 'Serra Angel'); return { a, b, chup };
};
const respond = (a, chup) => d => { if (d.kind === 'priority' && d.step === 'stack' && !chup.gone) { chup.gone = true; a.battlefield.splice(a.battlefield.indexOf(chup), 1); a.graveyard.push({ iid: chup.iid, card: chup.card }); } return undefined; };
T('airbendOwn: the targets are chosen as the trigger goes on the stack; one leaving in response is not replaced', () => {
  const { a, b, chup } = scene();
  seated(b, respond(a, chup), () => { G.castPhase(a); });
  check('Appa resolved onto the table', a.battlefield.some(x => x.card.name === APPA));
  check('the response happened', !!chup.gone);
  check('nothing was airbent in its place (no spell cast from exile)', !a.battlefield.some(x => x.card.name === 'Ally'));
});
T('airbendOwn with abilityTargets off: picked at resolution (Mulldrifter is airbent when nobody answers)', () => {
  const { a, b, chup } = scene(false);
  seated(b, undefined, () => { G.castPhase(a); });
  check('Mulldrifter was airbent and recast from exile (the Ally token shows it)', a.battlefield.some(x => x.card.name === 'Ally'));
});
T('airbendOwn: with nobody responding the locked pick resolves (Mulldrifter airbent)', () => {
  const { a, b, chup } = scene();
  seated(b, undefined, () => { G.castPhase(a); });
  check('Mulldrifter was airbent and recast from exile (the Ally token shows it)', a.battlefield.some(x => x.card.name === 'Ally'));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
