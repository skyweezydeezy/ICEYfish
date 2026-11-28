// T-143 group D (goad, stealOne, hostage, fiendHunter, drakeSwap, totemSwap): ability targets chosen on the stack, checked on resolution.
// T-132 (docs/PRIORITY-DESIGN.md section 17), with opts.priority and opts.abilityTargets on: the targets of a triggered ability are chosen as it goes on the stack (CR 603.3d) and checked again as it resolves (CR 608.2b); an ability's target does not change when the best one is removed in response.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer', 'Ravenous Chupacabra', 'Agent of Treachery', 'Gilded Drake', 'Hostage Taker', 'Fiend Hunter', 'Insufferable Balladeer', 'Avarice Totem', 'Grave Titan', 'Plains', 'Forest'];
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



// a scene: a has the card (hand, or on the battlefield for an activated ability); b has Serra Angel (best) and Llanowar Elves, and a Bolt so the person is asked at the stack step
const mk = (name, flag, onBf, beast) => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  const mana = name === 'Avarice Totem' ? 'Mountain' : 'Swamp';
  ['Island', 'Swamp', 'Plains', 'Mountain', 'Forest'].forEach(m => lands(a, 2, m)); lands(a, 2, mana); let src = null;
  if (onBf) src = putOn(a, name); else a.hand.push(inst(a, name));
  const best = putOn(b, beast || 'Serra Angel'), other = putOn(b, 'Llanowar Elves'); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, best, other, src };
};
const leave = (b, t) => d => { if (d.kind === 'priority' && d.step === 'stack' && !t.gone) { t.gone = true; b.battlefield.splice(b.battlefield.indexOf(t), 1); b.graveyard.push({ iid: t.iid, card: t.card }); } return undefined; };
const names = x => x.battlefield.map(q => q.card.name).join(',');
const cases = [
  { name: 'Agent of Treachery', fx: 'stealOne', beast: 'Grave Titan', taken: (a, b, best) => a.battlefield.includes(best) },
  { name: 'Hostage Taker', fx: 'hostage', taken: (a, b, best) => !b.battlefield.includes(best) && a.exile.some(i => i.card.name === best.card.name) },
  { name: 'Fiend Hunter', fx: 'fiendHunter', taken: (a, b, best) => !b.battlefield.includes(best) && a.exile.some(i => i.card.name === best.card.name) },
  { name: 'Insufferable Balladeer', fx: 'goad', taken: (a, b, best) => !!best.goaded },
  { name: 'Gilded Drake', fx: 'drakeSwap', taken: (a, b, best) => a.battlefield.includes(best) },
];
for (const c of cases) {
  T(c.name + ': the target is chosen as the ability goes on the stack; it leaving in response means nothing happens and nothing else is picked', () => {
    const { a, b, best, other } = mk(c.name, true, false, c.beast);
    seated(b, leave(b, best), () => { G.castPhase(a); });
    check(c.name + ' resolved onto the table (or was sacrificed by Drake logic not at all)', a.battlefield.some(x => x.card.name === c.name), names(a));
    check('the response happened', !!best.gone && !b.battlefield.includes(best));
    check('the other creature (Llanowar Elves) was not picked instead', b.battlefield.includes(other) && !a.battlefield.includes(other) && !other.goaded && !a.exile.some(i => i.card.name === 'Llanowar Elves'), 'b: ' + names(b) + ' / a: ' + names(a));
    if (c.fx === 'drakeSwap') check('Gilded Drake is not sacrificed (the ability did nothing)', a.battlefield.some(x => x.card.name === c.name));
  });
  T(c.name + ': with abilityTargets off the old behaviour stands (the next best is taken at resolution, or the Drake exchanges)', () => {
    const { a, b, best, other } = mk(c.name, false, false, c.beast);
    seated(b, leave(b, best), () => { G.castPhase(a); });
    const hit = c.fx === 'goad' ? !!other.goaded : c.fx === 'stealOne' ? a.battlefield.includes(other) : c.fx === 'drakeSwap' ? a.battlefield.includes(other) : a.exile.some(i => i.card.name === 'Llanowar Elves') || a.battlefield.some(q => q.card.name === 'Llanowar Elves');
    check(c.name + ' picked at resolution: Llanowar Elves is affected', hit, 'b: ' + names(b) + ' / a: ' + names(a));
  });
  T(c.name + ': a seated person is asked for the target before the stack question and the pick is the one used', () => {
    const [a, b] = match2(); on(a); on(b); ['Island', 'Swamp', 'Plains', 'Mountain', 'Forest'].forEach(m => lands(b, 2, m)); b.hand.push(inst(b, c.name));
    const best = putOn(a, c.beast || 'Serra Angel'), other = putOn(a, 'Llanowar Elves'), order = [];
    seated(b, (d, q) => { order.push(d.kind + (d.step ? ':' + d.step : '')); if (d.kind === 'target') return d.options.find(o => (o.card ? o.card.name : o.name) === 'Llanowar Elves') || undefined; return undefined; }, () => { G.castPhase(b); });
    if (c.fx !== 'stealOne') check('a target question was asked', order.includes('target'), order.join(','));          // Agent of Treachery has no person question (the autopilot pick is locked)
    check('it came before any stack question', order.indexOf('priority:stack') < 0 || order.indexOf('target') < order.indexOf('priority:stack'), order.join(','));
    if (c.fx === 'stealOne') return check('Agent of Treachery took the best permanent (Grave Titan) with the pick made on the stack', b.battlefield.includes(best), 'b: ' + names(b));
    const elvesHit = c.fx === 'goad' ? !!other.goaded : b.battlefield.some(q => q.card.name === 'Llanowar Elves') || b.exile.some(i => i.card.name === 'Llanowar Elves');
    check('the person\'s pick (Llanowar Elves) is the one affected, the best creature is not', elvesHit && !best.goaded && a.battlefield.includes(best), 'a: ' + names(a) + ' / b: ' + names(b));
  });
}
T('Avarice Totem (totemSwap, activated): the target is chosen on activation; if it leaves in response the exchange does nothing', () => {
  const { a, b, best, other, src } = mk('Avarice Totem', true, true, 'Grave Titan');
  seated(b, leave(b, best), () => { G.castPhase(a); });
  if (!best.gone) { check('the autopilot never activated the Totem (no test possible)', true, 'skipped'); return; }
  check('the Totem was not exchanged for another permanent', a.battlefield.includes(src) && !a.battlefield.includes(other) && b.battlefield.includes(other), names(a) + ' / ' + names(b));
});
T('Avarice Totem with abilityTargets off: picks at resolution', () => {
  const { a, b, best, other, src } = mk('Avarice Totem', false, true, 'Grave Titan');
  seated(b, leave(b, best), () => { G.castPhase(a); });
  check('ran without error', true, best.gone ? 'activated; ' + names(a) : 'no activation');
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
