// T-143 group F (yardExileOne, yardBottom, bounceUp): targets in graveyards / the bounce pair are locked as the ability goes on the stack. Derived from ability-targets.test.js
// T-132 (docs/PRIORITY-DESIGN.md section 17), with opts.priority and opts.abilityTargets on: the targets of a triggered ability are chosen as it goes on the stack (CR 603.3d) and checked again as it resolves (CR 608.2b); an ability's target does not change when the best one is removed in response.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer', 'Ravenous Chupacabra', 'Soul-Guide Lantern', 'Barkform Harvester', 'Marang River Regent // Coil and Catch'];
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



const yardOf = (x, n) => x.graveyard.find(i => i.card.name === n);
const toExile = (x, i) => { x.graveyard.splice(x.graveyard.indexOf(i), 1); x.exile.push(i); };
// --- yardExileOne: Soul-Guide Lantern (enters trigger)
const lantern = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 5, 'Swamp'); a.hand.push(inst(a, 'Soul-Guide Lantern'));
  b.graveyard.push(inst(b, 'Wurmcoil Engine'), inst(b, 'Llanowar Elves')); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, wurm: yardOf(b, 'Wurmcoil Engine'), drag: yardOf(b, 'Llanowar Elves') };
};
const lanternResp = (b, wurm) => { let done = false; return d => { if (d.kind === 'priority' && d.step === 'stack' && !done) { done = true; toExile(b, wurm); } return undefined; }; };
T('yardExileOne: the card is chosen as the trigger goes on the stack; if it leaves the graveyard in response, nothing else is exiled', () => {
  const { a, b, wurm, drag } = lantern();
  seated(b, lanternResp(b, wurm), () => { G.castPhase(a); });
  check('Lantern resolved onto the table', a.battlefield.some(x => x.card.name === 'Soul-Guide Lantern'));
  check('the response happened (Wurmcoil Engine is exiled)', b.exile.includes(wurm));
  check('Llanowar Elves is still in the graveyard: no new target was chosen', b.graveyard.includes(drag));
});
T('yardExileOne with abilityTargets off: the card is chosen at resolution (Llanowar Elves is exiled)', () => {
  const { a, b, wurm, drag } = lantern(false);
  seated(b, lanternResp(b, wurm), () => { G.castPhase(a); });
  check('the response happened', b.exile.includes(wurm));
  check('Llanowar Elves was exiled (picked at resolution)', b.exile.includes(drag), b.graveyard.map(i => i.card.name).join(','));
});
T('yardExileOne: with no response the locked card is exiled', () => {
  const { a, b, wurm, drag } = lantern();
  seated(b, () => undefined, () => { G.castPhase(a); });
  check('Wurmcoil Engine exiled, Llanowar Elves kept', b.exile.includes(wurm) && b.graveyard.includes(drag));
});
// --- yardBottom: Barkform Harvester (activated)
const harvester = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  const h = putOn(a, 'Barkform Harvester'); lands(a, 4, 'Swamp');
  a.graveyard.push(inst(a, 'Shivan Dragon'), inst(a, 'Llanowar Elves')); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, h, drag: yardOf(a, 'Shivan Dragon'), elves: yardOf(a, 'Llanowar Elves') };
};
T('yardBottom: the card is chosen when the ability is activated; if it leaves the graveyard in response, no other card goes to the library', () => {
  const { a, b, h, drag, elves } = harvester();
  const n = a.library.length;
  seated(b, d => { if (d.kind === 'priority' && d.step === 'stack' && a.graveyard.includes(drag)) toExile(a, drag); return undefined; }, () => { G.useAbility(a, h, 0); });
  check('the response happened', a.exile.includes(drag));
  check('Llanowar Elves stayed in the graveyard and the library did not grow', a.graveyard.includes(elves) && a.library.length === n, a.graveyard.map(i => i.card.name).join(',') + ' ' + (a.library.length - n));
});
T('yardBottom with abilityTargets off: a card is chosen at resolution (Llanowar Elves goes to the library)', () => {
  const { a, b, h, drag, elves } = harvester(false);
  const n = a.library.length;
  seated(b, d => { if (d.kind === 'priority' && d.step === 'stack' && a.graveyard.includes(drag)) toExile(a, drag); return undefined; }, () => { G.useAbility(a, h, 0); });
  check('Llanowar Elves went to the bottom of the library', a.library.length === n + 1 && a.library[a.library.length - 1] === elves, a.library.length - n);
});
T('yardBottom: with no response the locked card goes to the bottom', () => {
  const { a, b, h, drag } = harvester();
  seated(b, () => undefined, () => { G.useAbility(a, h, 0); });
  check('Shivan Dragon (the best pick) is on the bottom', a.library[a.library.length - 1] === drag);
});
// --- bounceUp: Marang River Regent (enters trigger, up to two other nonland permanents)
const marang = flag => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 8, 'Island'); a.hand.push(inst(a, 'Marang River Regent // Coil and Catch'));
  const angel = putOn(b, 'Serra Angel'), dragon = putOn(b, 'Shivan Dragon'); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, angel, dragon };
};
const marangResp = (b, p) => { let done = false; return d => { if (d.kind === 'priority' && d.step === 'stack' && !done) { done = true; if (b.battlefield.includes(p)) { b.battlefield.splice(b.battlefield.indexOf(p), 1); b.graveyard.push({ iid: p.iid, card: p.card }); } } return undefined; }; };
T('bounceUp: the targets are chosen as the trigger goes on the stack; one that leaves in response is not replaced, the other is still returned', () => {
  const { a, b, angel, dragon } = marang();
  seated(b, marangResp(b, dragon), () => { G.castPhase(a); });
  check('Marang resolved onto the table', a.battlefield.some(x => x.card.name.startsWith('Marang')));
  check('the response happened', !b.battlefield.includes(dragon));
  check('Serra Angel (a locked target, still legal) went back to hand or was bounced', !b.battlefield.includes(angel) && b.hand.some(i => i.card.name === 'Serra Angel'), b.hand.map(i => i.card.name).join(','));
});
T('bounceUp with abilityTargets off: the old behaviour (picked at resolution)', () => {
  const { a, b, angel, dragon } = marang(false);
  seated(b, marangResp(b, dragon), () => { G.castPhase(a); });
  check('the response happened', !b.battlefield.includes(dragon));
  check('the trigger resolved without error (Marang on the table)', a.battlefield.some(x => x.card.name.startsWith('Marang')));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
