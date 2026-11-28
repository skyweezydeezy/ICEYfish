// T-143 group B (CR 602.2b / 603.3d / 608.2b): counters (target scope) and distribute choose their targets as the ability goes on the stack and check them again as it resolves.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Hullbreaker Horror', 'Redirect Lightning', 'Murder', 'Lightning Bolt', 'Wurmcoil Engine', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Island', 'Sol Ring', 'Llanowar Elves', 'Young Pyromancer', 'Ravenous Chupacabra', 'Forest', 'Pridemalkin', 'Verdurous Gearhulk'];
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



const scene = (card, flag) => {
  const [a, b] = match2(); on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; }
  lands(a, 5, 'Forest'); a.hand.push(inst(a, card));
  const angel = putOn(a, 'Serra Angel'), elves = putOn(a, 'Llanowar Elves'); lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt'));
  return { a, b, angel, elves };
};
const respond = (a, angel) => d => { if (d.kind === 'priority' && d.step === 'stack' && !angel.gone) { angel.gone = true; a.battlefield.splice(a.battlefield.indexOf(angel), 1); a.graveyard.push({ iid: angel.iid, card: angel.card }); } return undefined; };
const rig = (b, a, angel) => { const r = respond(a, angel); return d => r(d); };
const ctr = p => p.counters || 0;

T('counters: Pridemalkin\'s trigger locks the best creature (Serra Angel); it leaves in response, so nothing gets the counter', () => {
  const { a, b, angel, elves } = scene('Pridemalkin');
  seated(b, rig(b, a, angel), () => { G.castPhase(a); });
  const pm = a.battlefield.find(x => x.card.name === 'Pridemalkin');
  check('Pridemalkin resolved', !!pm);
  check('the response happened', !!angel.gone && !a.battlefield.includes(angel));
  check('nobody got a counter (no new target chosen)', !!pm && ctr(pm) === 0 && ctr(elves) === 0, pm && ctr(pm) + ',' + ctr(elves));
});
T('counters, abilityTargets off: the target is picked on resolution (a creature still gets the counter)', () => {
  const { a, b, angel, elves } = scene('Pridemalkin', false);
  seated(b, rig(b, a, angel), () => { G.castPhase(a); });
  const pm = a.battlefield.find(x => x.card.name === 'Pridemalkin');
  check('a remaining creature got the counter', !!pm && ctr(pm) + ctr(elves) === 1, pm && ctr(pm) + ',' + ctr(elves));
});
T('counters: a seated person is asked for the target as the trigger goes on the stack and the pick gets the counter', () => {
  const [a, b] = match2(); on(a); on(b); lands(b, 5, 'Forest'); b.hand.push(inst(b, 'Pridemalkin'));
  const angel = putOn(b, 'Serra Angel'), elves = putOn(b, 'Llanowar Elves'), order = [];
  seated(b, (d) => { order.push(d.kind + (d.step ? ':' + d.step : '')); if (d.kind === 'target' && d.what === 'counters') return d.options.find(o => o.card && o.card.name === 'Llanowar Elves') || undefined; return undefined; }, () => { G.castPhase(b); });
  check('the target question was asked', order.includes('target'), order.join(','));
  check('Llanowar Elves (the pick) got the counter, Serra Angel did not', ctr(elves) === 1 && ctr(angel) === 0, ctr(elves) + ',' + ctr(angel));
});
T('distribute: Verdurous Gearhulk locks its targets; one leaves in response and only the legal ones get their share (no new target)', () => {
  const { a, b, angel, elves } = scene('Verdurous Gearhulk');
  seated(b, rig(b, a, angel), () => { G.castPhase(a); });
  const gh = a.battlefield.find(x => x.card.name === 'Verdurous Gearhulk');
  check('Gearhulk resolved', !!gh);
  check('the response happened', !!angel.gone);
  const tot = gh ? ctr(gh) + ctr(elves) : -1;
  check('fewer than four counters were placed (Serra Angel\'s share was lost)', gh && tot > 0 && tot < 4, gh && ctr(gh) + ',' + ctr(elves));
});
T('distribute, abilityTargets off: all four counters land on the remaining creatures', () => {
  const { a, b, angel, elves } = scene('Verdurous Gearhulk', false);
  seated(b, rig(b, a, angel), () => { G.castPhase(a); });
  const gh = a.battlefield.find(x => x.card.name === 'Verdurous Gearhulk');
  check('four counters placed', !!gh && ctr(gh) + ctr(elves) === 4, gh && ctr(gh) + ',' + ctr(elves));
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
