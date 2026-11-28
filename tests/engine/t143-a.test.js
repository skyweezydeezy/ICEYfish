// T-143 group A (CR 602.2b, 603.3d, 608.2b): the pump effects (pumpOne non-self incl. the legendary pool, gainFire with a target, attackerPump, pumpAttacker) choose their target as the ability goes on the stack and check it again as it resolves; with opts.abilityTargets off the old inline pick stands.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'goldfish', 'static', 'sim.js')), D = require(path.join(ROOT, 'goldfish', 'static', 'decide.js'));
const DS = path.join(ROOT, 'goldfish', 'static', 'data', 'sets');
const idx = JSON.parse(fs.readFileSync(path.join(DS, 'index.json'), 'utf8')), store = {};
idx.sets.forEach(s => { store[s.code] = JSON.parse(fs.readFileSync(path.join(DS, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')); });
const find = n => { for (const f of Object.values(store)) { const c = f.cards.find(x => x.name === n && !x.ref); if (c) return Object.assign({}, c, { qty: 1 }); } throw new Error('not in the database: ' + n); };
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'red-rum-raiders-loaded.json'), 'utf8'));
const NAMES = ['Lightning Bolt', 'Serra Angel', 'Shivan Dragon', 'Mountain', 'Swamp', 'Plains', 'Forest', 'Llanowar Elves', 'Okina, Temple to the Grandfathers', 'Adeline, Resplendent Cathar', 'Kenrith, the Returned King', 'Vizkopa Guildmage', 'Fire Nation Palace', 'Hollowmurk Siege'];
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
const remove = (x, p) => { x.battlefield.splice(x.battlefield.indexOf(p), 1); x.graveyard.push({ iid: p.iid, card: p.card }); p.gone = true; };
// the opponent (seated, holding a Bolt and open mana so the stack step is offered) removes `victim` from `owner` in response, once
const respond = (owner, victim) => d => { if (d.kind === 'priority' && d.step === 'stack' && !victim.gone) remove(owner, victim); return undefined; };
const abilityIdx = (g, p, re) => G.abilityMenu(g, p).findIndex(it => it.ok && re.test(it.label));
const arm = (a, b, flag) => { on(a); on(b); if (flag === false) { a.opts.abilityTargets = false; b.opts.abilityTargets = false; } lands(b, 3, 'Mountain'); b.hand.push(inst(b, 'Lightning Bolt')); };
const activate = (a, b, p, re, answer) => { const i = abilityIdx(a, p, re); if (i < 0) throw new Error('no ability matching ' + re + ' in ' + G.abilityMenu(a, p).map(x => x.label).join(' || ')); return seated(b, answer, () => { G.useAbility(a, p, i); }); };

// ---- pumpOne, the legendary pool (Okina) ----
const okina = flag => { const [a, b] = match2(); arm(a, b, flag); const ok = putOn(a, 'Okina, Temple to the Grandfathers'); lands(a, 1, 'Forest'); const ken = putOn(a, 'Kenrith, the Returned King'), ade = putOn(a, 'Adeline, Resplendent Cathar'); return { a, b, ok, ken, ade }; };
T('pumpOne (Okina): baseline pick on the stack is the strongest legendary creature (Kenrith) and it gets +1/+1', () => {
  const { a, b, ok, ken, ade } = okina();
  activate(a, b, ok, /legendary/i);
  check('Kenrith got +1/+1, Adeline did not', ken.eotP === 1 && !ade.eotP, `ken ${ken.eotP}, ade ${ade.eotP}`);
});
T('pumpOne (Okina): the target is kept while the ability is on the stack; if it leaves in response nothing else is pumped (CR 608.2b)', () => {
  const { a, b, ok, ken, ade } = okina();
  activate(a, b, ok, /legendary/i, (d) => respond(a, ken)(d));
  check('the response happened', !!ken.gone && !a.battlefield.includes(ken));
  check('Adeline was not retargeted', !ade.eotP && a.battlefield.includes(ade), 'ade ' + ade.eotP);
});
T('pumpOne (Okina) with abilityTargets off: the target is chosen on resolution (Adeline gets the pump)', () => {
  const { a, b, ok, ken, ade } = okina(false);
  activate(a, b, ok, /legendary/i, (d) => respond(a, ken)(d));
  check('Adeline was pumped (picked at resolution)', ade.eotP === 1, 'ade ' + ade.eotP);
});
T('pumpOne (Okina): a seated person is asked for the target as the ability goes on the stack, and the pick is the one that resolves', () => {
  const r = okina(); const qs = []; r.a.ask = (gg, d) => { const q = D.question(gg, d); qs.push(d.kind + (d.step ? ':' + d.step : '')); return d.kind === 'target' ? d.options.find(o => o.card && o.card.name === 'Adeline, Resplendent Cathar') : undefined; };
  try { G.useAbility(r.a, r.ok, abilityIdx(r.a, r.ok, /legendary/i)); } finally { r.a.ask = null; }
  check('a target question was asked at activation', qs.includes('target'), qs.join(','));
  check('the person\'s pick (Adeline) was pumped, Kenrith was not', r.ade.eotP === 1 && !r.ken.eotP, `ade ${r.ade.eotP}, ken ${r.ken.eotP}`);
});

// ---- pumpOne, a plain target (Vizkopa Guildmage: target creature gains lifelink) ----
const viz = flag => { const [a, b] = match2(); arm(a, b, flag); const vg = putOn(a, 'Vizkopa Guildmage'); lands(a, 1, 'Plains'); lands(a, 1, 'Swamp'); lands(a, 1, 'Island'); const ang = putOn(a, 'Serra Angel'), elf = putOn(a, 'Llanowar Elves'); return { a, b, vg, ang, elf }; };
const lifelinkRe = /lifelink until end of turn/i;
T('pumpOne (Vizkopa Guildmage): the target is locked when the ability goes on the stack; it leaving in response means the effect does nothing', () => {
  const { a, b, vg, ang, elf } = viz();
  const base0 = viz(); activate(base0.a, base0.b, base0.vg, lifelinkRe);
  const pick = [base0.ang, base0.elf, base0.vg].find(q => q.eotKw && q.eotKw.has('lifelink'));
  check('baseline: some creature gains lifelink', !!pick, pick && pick.card.name);
  if (!pick) return;
  const victim = { Serra: ang, Llanowar: elf, Vizkopa: vg }[pick.card.name.split(' ')[0].replace(',', '')];
  activate(a, b, vg, lifelinkRe, d => respond(a, victim)(d));
  check('the response happened', !!victim.gone);
  check('no other creature gained lifelink', [ang, elf, vg].filter(q => !q.gone).every(q => !(q.eotKw && q.eotKw.has('lifelink'))));
});
T('pumpOne (Vizkopa Guildmage) with abilityTargets off: a new creature gets it on resolution', () => {
  const base0 = viz(false); activate(base0.a, base0.b, base0.vg, lifelinkRe);
  const pick = [base0.ang, base0.elf, base0.vg].find(q => q.eotKw && q.eotKw.has('lifelink'));
  const { a, b, vg, ang, elf } = viz(false);
  const victim = { Serra: ang, Llanowar: elf, Vizkopa: vg }[pick.card.name.split(' ')[0].replace(',', '')];
  activate(a, b, vg, lifelinkRe, d => respond(a, victim)(d));
  check('a remaining creature gained lifelink', [ang, elf, vg].filter(q => !q.gone).some(q => q.eotKw && q.eotKw.has('lifelink')));
});

// ---- gainFire (Fire Nation Palace) ----
const palace = flag => { const [a, b] = match2(); arm(a, b, flag); const fp = putOn(a, 'Fire Nation Palace'); lands(a, 2, 'Mountain'); const dr = putOn(a, 'Shivan Dragon'), elf = putOn(a, 'Llanowar Elves'); return { a, b, fp, dr, elf }; };
const fireRe = /firebending/i;
const fired = q => !!(q.eotFire && q.eotFire.length);
T('gainFire (Fire Nation Palace): the target is locked on the stack; baseline gives firebending to one creature', () => {
  const { a, b, fp, dr, elf } = palace();
  activate(a, b, fp, fireRe);
  check('exactly one creature gained firebending 4', [dr, elf].filter(fired).length === 1, [dr, elf].map(q => (q.eotFire || []).join('/')).join(' ; '));
});
T('gainFire (Fire Nation Palace): the target leaving in response means nobody gains firebending', () => {
  const base0 = palace(); activate(base0.a, base0.b, base0.fp, fireRe);
  const chosen = fired(base0.dr) ? 'dr' : 'elf';
  const { a, b, fp, dr, elf } = palace(); const victim = chosen === 'dr' ? dr : elf, other = chosen === 'dr' ? elf : dr;
  activate(a, b, fp, fireRe, d => respond(a, victim)(d));
  check('the response happened', !!victim.gone);
  check('the other creature did not gain firebending', !fired(other));
});
T('gainFire (Fire Nation Palace) with abilityTargets off: the other creature gains it on resolution', () => {
  const base0 = palace(false); activate(base0.a, base0.b, base0.fp, fireRe);
  const chosen = fired(base0.dr) ? 'dr' : 'elf';
  const { a, b, fp, dr, elf } = palace(false); const victim = chosen === 'dr' ? dr : elf, other = chosen === 'dr' ? elf : dr;
  activate(a, b, fp, fireRe, d => respond(a, victim)(d));
  check('the other creature gained firebending (picked at resolution)', fired(other));
});

// ---- attackerPump (Hollowmurk Siege, Abzan: a +1/+1 counter and menace on target attacking creature) and pumpAttacker (a fake copy of the Siege with Hunter's Talent's effect) ----
const attackScene = (flag, fake) => {
  const [a, b] = match2(); arm(a, b, flag);
  const dr = putOn(a, 'Shivan Dragon'), ang = putOn(a, 'Serra Angel');
  let siege;
  if (fake) { const c = Object.assign({}, by('Hollowmurk Siege')); c.a = Object.assign({}, c.a, { triggers: [{ kinds: ['attackAny'], fx: [{ type: 'pumpAttacker', p: 1, t: 0, kw: ['trample'] }], once: true, text: 'fake' }] }); siege = G.enterWithTriggers(a, { iid: a.nextIid++, card: c }, {}, []); }
  else { siege = putOn(a, 'Hollowmurk Siege'); siege.siegeMode = 'abzan'; }
  return { a, b, dr, ang, siege };
};
const attack = (s, answer) => seated(s.b, answer, () => { G.combat(s.a); });
const countersOf = q => q.counters || 0;
T('attackerPump (Hollowmurk Siege): the attacking creature is chosen when the trigger goes on the stack; leaving in response means nobody else gets the counter', () => {
  const base0 = attackScene(); attack(base0);
  const gotC = [base0.dr, base0.ang].filter(q => countersOf(q) > 0);
  check('baseline: one attacker got a +1/+1 counter', gotC.length === 1, base0.a.battlefield.map(q => q.card.name + ':' + countersOf(q) + ':' + !!q.attacking).join(','));
  if (gotC.length !== 1) return;
  const s = attackScene(); const victim = gotC[0] === base0.dr ? s.dr : s.ang, other = victim === s.dr ? s.ang : s.dr;
  attack(s, d => respond(s.a, victim)(d));
  check('the response happened', !!victim.gone);
  check('the other attacker got no counter', countersOf(other) === 0, countersOf(other));
});
T('attackerPump (Hollowmurk Siege) with abilityTargets off: the other attacker gets the counter on resolution', () => {
  const base0 = attackScene(false); attack(base0);
  const gotC = [base0.dr, base0.ang].filter(q => countersOf(q) > 0);
  if (gotC.length !== 1) { check('baseline: one attacker got a counter', false); return; }
  const s = attackScene(false); const victim = gotC[0] === base0.dr ? s.dr : s.ang, other = victim === s.dr ? s.ang : s.dr;
  attack(s, d => respond(s.a, victim)(d));
  check('the other attacker got the counter', countersOf(other) === 1, countersOf(other));
});
T('pumpAttacker (fake Siege with Hunter\'s Talent\'s effect): locked on the stack; leaving in response means no other attacker is pumped', () => {
  const base0 = attackScene(undefined, true); attack(base0);
  const got = [base0.dr, base0.ang].filter(q => q.eotP === 1);
  check('baseline: one attacker got +1/+0', got.length === 1, base0.a.battlefield.map(q => q.card.name + ':' + (q.eotP || 0)).join(','));
  if (got.length !== 1) return;
  const s = attackScene(undefined, true); const victim = got[0] === base0.dr ? s.dr : s.ang, other = victim === s.dr ? s.ang : s.dr;
  attack(s, d => respond(s.a, victim)(d));
  check('the response happened', !!victim.gone);
  check('the other attacker was not pumped', !other.eotP, other.eotP);
});
T('pumpAttacker with abilityTargets off: the other attacker is pumped on resolution', () => {
  const base0 = attackScene(false, true); attack(base0);
  const got = [base0.dr, base0.ang].filter(q => q.eotP === 1);
  if (got.length !== 1) { check('baseline: one attacker got +1/+0', false); return; }
  const s = attackScene(false, true); const victim = got[0] === base0.dr ? s.dr : s.ang, other = victim === s.dr ? s.ang : s.dr;
  attack(s, d => respond(s.a, victim)(d));
  check('the other attacker was pumped', other.eotP === 1, other.eotP);
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
