/* ICEYfish - a person's choices in a played game (1v1 and Pod).

   The engine (sim.js) is synchronous and resolves every effect at once; a person's answer is not. So a played game asks first and
   resolves afterwards. An engine call is tried on an exact copy of the game and stops at the first choice the engine would make for the
   person's seat. The page asks, adds the answer to the list and tries again from the start; once a try runs to the end, the same call
   is made on the real game with the same answers. The engine never waits, and nothing changes for simulated games: a game without a
   chooser (g.ask) takes the autopilot's pick everywhere, exactly as before.

   Also here: one turn as a list of steps (untap, upkeep, draw, main, combat, second main, end), so the played game can show the step
   and the log can say in which step a thing happened; and what can be cast at instant speed at the end of another player's turn. */
(function (root) {
  'use strict';
  const G = root.Goldfish || (typeof require !== 'undefined' ? require('./sim.js') : null);
  if (!G) return;

  // ---------- an exact copy of a game in progress ----------
  // Cards, decks and options are data the engine only reads, so the copy shares them. Everything else (zones, permanents, counters,
  // the match record, each player's random generator) is copied, keeping every cross-reference: a permanent's card instance, the
  // attacked player, the players of the match.
  const isCard = v => typeof v.name === 'string' && v.a && typeof v.a === 'object' && 'type_line' in v;
  const isDeck = v => v.tokenCache && Array.isArray(v.unique) && Array.isArray(v.library);
  function copyRnd(f) { const r = G.mulberry32(0); r.state(f.state()); return r; }
  // What the engine read off a card (card.a: its costs, triggers, mana...) is shared data too, and permanents point into it (a land's
  // "produce" is its card's). Those objects are remembered here, so a copy keeps pointing at the same ones.
  const cardData = new WeakSet(), known = new WeakSet();
  function own(card) {
    if (known.has(card)) return; known.add(card);
    const walk = v => { if (v === null || typeof v !== 'object' || cardData.has(v) || isCard(v)) return; cardData.add(v); if (v instanceof Set || v instanceof Map) v.forEach(walk); else for (const k of Object.keys(v)) walk(v[k]); };
    walk(card.a);
  }
  function ownAll(games) {
    for (const g of games) {
      for (const z of [g.library, g.hand, g.battlefield, g.graveyard, g.exile, g.command]) for (const i of z) if (i && i.card) own(i.card);
      if (g.deck) { g.deck.unique.forEach(own); for (const k of Object.keys(g.deck.tokenCache)) own(g.deck.tokenCache[k]); }
    }
  }
  function clonePod(games) {
    const seen = new Map();
    ownAll(games);
    const copy = (v, key) => {
      if (typeof v === 'function') return v.state ? copyRnd(v) : v;
      if (v === null || typeof v !== 'object') return v;
      if (isCard(v)) { own(v); return v; }
      if (key === 'opts' || isDeck(v) || cardData.has(v)) return v;
      const had = seen.get(v); if (had) return had;
      let c;
      if (Array.isArray(v)) { c = new Array(v.length); seen.set(v, c); for (let i = 0; i < v.length; i++) c[i] = copy(v[i]); return c; }
      if (v instanceof Set) { c = new Set(); seen.set(v, c); for (const x of v) c.add(copy(x)); return c; }
      if (v instanceof Map) { c = new Map(); seen.set(v, c); for (const [k, x] of v) c.set(copy(k), copy(x)); return c; }
      c = {}; seen.set(v, c);
      for (const k of Object.keys(v)) c[k] = k === '_bf' ? null : copy(v[k], k);          // _bf is a cache of the battlefield; it is rebuilt on demand
      return c;
    };
    return games.map(g => copy(g));
  }
  // The whole state of a pod as text: two games are in the same state exactly when their dumps are equal (used by the tests).
  // skip: more keys to leave out. SCRATCH: what the engine writes while it works out what a card costs (G.effectiveCost), recomputed
  // before it is used. Looking at a card (can it be cast?) writes them, so two devices showing different cards differ only there.
  const SCRATCH = new Set(['_delve', '_convoke', '_pitch', 'altTap', '_krrik', '_defiler', '_spree', '_af', '_mono', '_warped', '_phyLife', '_phyPick', '_dl']);
  function dump(games, skip) {
    const ids = new Map();
    ownAll(games);
    const walk = (v, key) => {
      if (key === 'opts' || key === '_bf' || key === 'choices' || key === 'ask' || (skip && skip.has(key))) return null;
      if (typeof v === 'function') return v.state ? 'rnd:' + v.state() : 'fn';
      if (v === null || typeof v !== 'object') return v === undefined ? null : v;
      if (isDeck(v)) return 'deck';
      if (isCard(v)) return 'card:' + v.name;
      if (ids.has(v)) return '#' + ids.get(v);
      if (!cardData.has(v)) ids.set(v, ids.size);                                                        // card data is compared by value
      if (Array.isArray(v)) return v.map(x => walk(x));
      if (v instanceof Set) return { set: [...v].map(x => walk(x)).sort() };
      if (v instanceof Map) return { map: [...v].map(([k, x]) => [walk(k), walk(x)]) };
      const o = {};
      for (const k of Object.keys(v).sort()) { const w = walk(v[k], k); if (w !== null && w !== false && w !== 0 && w !== '' && !(Array.isArray(w) && !w.length)) o[k] = w; }
      return o;
    };
    return JSON.stringify(games.map(g => walk(g)));
  }

  // ---------- questions ----------
  const FX_WORDS = { draw: 'draw cards', token: 'make tokens', removal: 'remove a permanent', bounce: 'return a permanent to its owner\'s hand', damage: 'deal damage', burnCreature: 'deal damage to a creature',
    drain: 'drain life', gainLife: 'gain life', loseLife: 'lose life', counters: 'put counters on a creature', tutor: 'search your library', ramp: 'search for lands', pumpAll: 'pump your creatures', pumpOne: 'pump a creature',
    edict: 'an opponent sacrifices a creature', reanimate: 'return a creature from a graveyard', wrath: 'destroy creatures', treasure: 'make Treasure', scry: 'scry', mill: 'mill cards', discardSelf: 'discard', proliferate: 'proliferate',
    untapAll: 'untap permanents', extraTurn: 'take an extra turn', gyReturn: 'return a card from your graveyard', counter: 'counter a spell', loot: 'draw, then discard', food: 'make Food', tempt: 'the Ring tempts you' };
  const num = n => (typeof n === 'number' ? n : n === 'X' ? 'X' : null);
  const cap = w => String(w || '').replace(/^./, c => c.toUpperCase());
  function fxLabel(fx) {
    return (fx || []).map(f => {
      const n = num(f.n);
      switch (f.type) {
        case 'draw': return `draw ${n == null ? 'cards' : n + (n === 1 ? ' card' : ' cards')}`;
        case 'damage': case 'drain': return `${f.type === 'drain' ? 'drain' : 'deal'} ${n == null ? '' : n + ' '}${f.type === 'drain' ? 'life' : 'damage'}`;
        case 'burnCreature': return `deal ${n == null ? '' : n + ' '}damage to a creature`;
        case 'gainLife': return `gain ${n == null ? '' : n + ' '}life`;
        case 'loseLife': return `lose ${n == null ? '' : n + ' '}life`;
        case 'token': return `make ${n == null ? '' : n + ' '}${f.name || (f.subtypes || []).join(' ') || ''} token${n === 1 ? '' : 's'}`.replace(/\s+/g, ' ');
        case 'removal': return `${f.how === 'exile' ? 'exile' : f.how === 'tuck' ? 'put into its owner\'s library' : 'destroy'} ${f.what === 'creature' ? 'a creature' : f.what === 'artifact' ? 'an artifact' : f.what === 'enchantment' ? 'an enchantment' : f.what === 'artOrEnch' ? 'an artifact or enchantment' : f.what === 'planeswalker' ? 'a planeswalker' : f.what === 'creatureOrPw' ? 'a creature or planeswalker' : f.what === 'nonland' ? 'a nonland permanent' : 'a permanent'}`;
        case 'bounce': return `return ${f.what === 'creature' ? 'a creature' : 'a permanent'} to its owner's hand`;
        case 'counters': return `put ${n == null ? '' : n + ' '}${f.kind || '+1/+1'} counter${n === 1 ? '' : 's'} on ${f.scope === 'each' ? 'each creature' : f.scope === 'self' ? 'this' : 'a creature'}`;
        case 'tutor': return `search your library for ${filterWords(f)}`;
        case 'wrath': return `destroy all ${f.onlyType ? cap(f.onlyType) + ' ' : f.notType ? 'non-' + cap(f.notType) + ' ' : ''}creatures${f.minPower ? ' with power ' + f.minPower + ' or greater' : f.maxPower != null ? ' with power ' + f.maxPower + ' or less' : ''}`;
        case 'sweep': return `destroy all ${f.what === 'artOrEnch' ? 'artifacts and enchantments' : (f.what || 'permanent') + 's'}${f.mvMax != null ? ' with mana value ' + f.mvMax + ' or less' : f.mvMin != null ? ' with mana value ' + f.mvMin + ' or greater' : ''}`;
        case 'edict': return `each opponent sacrifices ${f.what === 'planeswalker' ? 'a planeswalker' : f.what === 'artifact' ? 'an artifact' : f.what === 'enchantment' ? 'an enchantment' : 'a ' + (f.what || 'creature')}`;
        case 'exileYards': return 'exile all graveyards';
        default: return FX_WORDS[f.type] || f.type;
      }
    }).filter(Boolean).join(', then ') || 'no effect the engine plays';
  }
  function filterWords(f) {
    if (f.words) return f.words;                                         // the card's own words (Intuition: "three cards")
    if (f.transmute != null) return `a nonland card with mana value ${f.transmute}`;
    if (f.land) {                                                        // a land search: basic lands, any land, or the land types of a fetch land
      const ls = [].concat(f.land), what = f.land === 'basic' ? 'basic land' : f.land === 'land' ? 'land' : ls.length > 2 ? ls.slice(0, -1).join(', ') + ', or ' + ls[ls.length - 1] : ls.join(' or ');          // "a Plains, Island, Swamp, or Mountain card"
      const n = f.n || 1;
      return n > 1 ? `up to ${n} ${what} cards` : (/^[aeiou]/i.test(what) ? 'an ' : 'a ') + what + ' card';
    }
    const w = (f.filters || []).filter(Boolean);
    let t = w.length ? (/^[aeiou]/.test(w[0]) ? 'an ' : 'a ') + w.join(' or ') + ' card' : 'a card';
    if (f.permanent && !w.length) t = 'a permanent card';
    if (f.maxMv != null) t += ` with mana value ${f.maxMv} or less`;
    return t;
  }
  // the card a choice comes from. A spell's own effects carry no source in the engine: the spell being cast (g.lastCast) stands in for it.
  const srcOf = (d, g) => (d.source && d.source.card ? d.source.card : (d.kind === 'search' || d.kind === 'target' || d.kind === 'mode') && !d.source && g && g.lastCast ? g.lastCast.card : null);
  const ptOf = (o, p) => (G.isCreaturePerm(p) ? `${G.powerOf(o, p)}/${G.toughnessOf(o, p)}` : '');
  // T-072: the targets a spell chose as it was cast (CR 601.2c), as text for the person deciding (g) and as data for the sheet (picture of a card target)
  function targetsOf(d, g, m) {
    const ts = (d.targets || []).map(t => {
      const nm = pid => m && m.names && m.names[pid] != null ? m.names[pid] : 'Opponent';
      if (t.kind === 'player') return { kind: 'player', pid: t.pid, you: t.pid === g.pid, name: t.pid === g.pid ? 'you' : nm(t.pid) };
      return { kind: 'perm', card: t.card, iid: t.iid, owner: t.owner, you: t.owner === g.pid, name: (t.owner === g.pid ? 'your ' : (t.owner != null ? nm(t.owner) + '\'s ' : '')) + t.name };
    });
    return ts.length ? { list: ts, text: 'Targeting ' + ts.map(t => t.name).join(' and ') + '. ' } : null;
  }
  // T-080: "<spell> ... unless that player pays {N}" (Rhystic Study, Smothering Tithe, Mystic Remora, Esper Sentinel, Mana Leak): what happens when you do not pay
  const taxThen = (d, g, m) => String(d.then || 'it takes effect').replace('{who}', d.owner && m && m.names ? m.names[d.owner.pid] : 'The opponent');
  const HOW = { mana: 'counter it: pay its mana cost', free: 'counter it: free', daze: 'counter it: return an Island to your hand', pitch: 'counter it: exile a card from your hand', pitchX: 'counter it: exile a blue card with that mana value', cleave: 'counter it: cleaved', respond: 'in response: it resolves first' };
  // What the engine is about to choose, as plain data the page can show: the options (with the card to draw for each), the autopilot's
  // pick, how many may be chosen. Returns null when there is nothing to choose between.
  // titles and help for the targets of activated abilities (G.abilityMenu): what -> [title, text]
  const TARGET_WORDS = {
    steal: ['gain control of which creature?', 'Choose a creature an opponent controls with mana value equal to X: you gain control of it (for good). It is chosen as the spell is cast.'],
    gate: ['exile a card from a graveyard', 'Choose a card from any graveyard to exile. Whenever a player plays a land or casts a spell that shares a card type with it, that player takes 2 damage.'],
    needle: ['name a card', 'Choose a nonland card name: activated abilities of sources with that name can\'t be activated. The permanents with an activated ability on the table are listed.'],
    breath: ['attach Breath of Fury to which creature?', 'The enchanted creature is sacrificed: choose another creature you control to enchant. Then untap all your creatures and there is an additional combat phase.'],
    redirect: ['choose the new target', 'Change the target of the spell to another legal target: the spell then does what it says to that permanent.'],
    strive: ['choose the creatures to copy', 'Choose any number of creatures you control: each gets a token copy with haste, exiled at the beginning of the next end step. Each target beyond the first costs {2}{R} more.'],
    untapMany: ['untap which permanents?', 'Choose up to the number of permanents the ability names, none if you like: each is untapped.'],
    demandCost: ['sacrifice an artifact or discard a card', 'Choose what you give up as an additional cost to cast it: an artifact you control, or a card from your hand.'],
    lookBf: ['put a creature onto the battlefield?', 'Choose a creature card from the cards you looked at: it enters the battlefield, and the rest go to the bottom of your library in a random order.'],
    sozin: ['put which creature cards onto the battlefield?', 'Choose creature cards from that player\'s graveyard with total mana value up to what you can pay for {X}: each enters the battlefield under your control.'],
    airbendMany: ['airbend which permanents?', 'Choose any number of other nonland permanents you control (none is allowed): each is exiled, and while it is exiled you may cast it for {2} rather than its mana cost.'],
    goad: ['goad which creature?', 'Choose the creature an opponent controls that is goaded: until your next turn it attacks each combat if able.'],
    yardExile: ['exile which card?', 'Choose a card from a graveyard to exile (or none).'],
    yardBottomAll: ['whose graveyard goes to the bottom?', 'Choose up to one player: that player puts all the cards from their graveyard on the bottom of their library in a random order.'],
    bounceMany: ['return which permanents?', 'Choose up to the number of other nonland permanents the card names (none is allowed): each returns to its owner\'s hand.'],
    mirrorCopy: ['copy which creature?', 'Choose the creature on the battlefield it becomes a copy of until end of turn (it has haste), or none.'],
    becomeArtifact: ['make which permanent an artifact?', 'Choose the permanent that becomes an artifact in addition to its other types until end of turn.'],
    yardBottom: ['put which card on the bottom?', 'Choose a card from your graveyard to put on the bottom of your library.'],
    airbend: ['airbend which permanent?', 'Choose the permanent to exile. While it is exiled, its owner may cast it for {2} rather than its mana cost (a token is gone for good).'],
    firebend: ['give firebending to which creature?', 'Choose the creature that gains firebending until end of turn: when it attacks it adds red mana that lasts until end of combat.'],
    tapCost: ['tap which permanent?', 'Choose the untapped permanent you tap as part of the cost of this mana ability.'],
    return: ['return a creature to your hand', 'Choose a creature you control to return to its owner\'s hand.'],          // Whitemane Lion, Shrieking Drake
    skate: ['double the counters', 'Choose any number of your permanents with counters: each kind of counter on them is doubled.'],
    flickerwisp: ['exile another permanent', 'Choose a permanent to exile. A card of yours returns at the beginning of the next end step; a token is gone for good.'],
    proliferate: ['proliferate', 'Choose any number of permanents and players with counters (none is fine): each gets another counter of each kind already there. The kinds on one permanent or player can\'t be split: all of them grow.'],
    untap: ['untap what?', 'Choose the permanent to untap.'],
    tap: ['tap what?', 'Choose the permanent to tap.'],
    fiendhunter: ['exile which creature?', 'Choose the creature to exile until Fiend Hunter leaves the battlefield.'],
    hostage: ['exile which creature or artifact?', 'Choose the creature or artifact to exile until it leaves the battlefield. You may cast that card while it stays exiled, with mana of any type.'],
    drake: ['exchange for which creature?', 'Choose the creature of theirs you gain control of; they gain control of this creature.'],
    threaten: ['gain control of which creature?', 'Choose the creature you gain control of until end of turn. It untaps and gains haste.'],
    astral: ['copy which permanent?', 'Choose the noncreature permanent: you create two tokens that are copies of it, 3/3 flying Dragon creatures as well.'],
    distribute: ['put a +1/+1 counter on which creature?', 'Choose up to three target creatures, one at a time (choose none to stop). The three +1/+1 counters are distributed among them, each getting at least one, and they gain vigilance until end of turn.'],
    distributeExtra: ['which creature gets the extra counter?', 'With fewer than three targets, the remaining +1/+1 counters are distributed among them.'],
    oath: ['exile which permanent?', 'Choose another permanent of yours to exile. It returns to the battlefield at the beginning of the next end step.'],
    fangs: ['choose a creature', 'Choose the creature that gets a +1/+1 counter; then its +1/+1 counters are doubled.'],
    flickerAll: ['flicker which creatures?', 'Choose any number of your creatures to exile. They return to the battlefield at the beginning of the next end step (a token does not come back, so tokens are left alone).'],
    animate: ['choose an artifact', 'Choose the noncreature artifact that becomes an artifact creature.'],
    pump: ['choose a creature', 'Choose the creature that gets the bonus until end of turn.'],
    double: ['choose a creature', 'Choose the creature whose power is doubled.'],
    fight: ['choose what it fights', 'Choose the creature it fights: each deals damage equal to its power to the other.'],
    uncounter: ['choose a target', 'Choose the permanent that loses its counters.'],
    copy: ['copy what?', 'Choose the permanent to copy.'],
    equip: ['equip which creature?', 'Choose the creature to attach it to.'],
    deathReturn: ['choose a creature', 'Choose the creature that returns to the battlefield when it dies this turn.'],
    flickerTwo: ['flicker which permanents?', 'Choose up to two of your permanents to exile and return to the battlefield (their enter effects happen again).'],
    earthbend: ['choose a land', 'Choose the land that becomes a 0/0 creature with haste and gets the +1/+1 counters.'],
    flicker: ['flicker which creature?', 'Choose the creature to exile and return to the battlefield (it comes back untapped, its enter effects happen again).'],
  };
  function question(g, d) {
    const opts = d.options || [], multi = !!d.multi, m = g.match;
    if (!opts.length && !d.always) return null;          // always: asked with nothing to pick too (a spell on the stack: "does it resolve?")
    const defs = multi ? (d.def || []) : (d.def == null ? [] : [d.def]);
    const optional = !multi && (!!d.optional || d.def == null);
    let min = 1, max = 1;
    if (multi) {
      if (typeof d.pick === 'number') { max = Math.min(d.pick, opts.length); min = d.upTo ? 0 : max; if (opts.length <= d.pick && !d.upTo) return null;  if (d.min != null) min = Math.min(d.min, max); }
      else { max = opts.length; min = defs.length ? 1 : 0; }
    } else if (opts.length === 1 && !optional) return null;
    const src = srcOf(d, g), sn = src ? src.name : null, owner = p => (m && m.players ? m.players.find(x => x.battlefield.includes(p)) : null) || g;
    const q = { kind: d.kind, what: d.what || null, seat: g.pid, multi, min, max, optional, source: src, none: null, title: '', text: '', options: [], def: [] };
    opts.forEach((o, k) => {
      const item = { k, name: '', card: null, iid: null, note: '', owner: null, def: defs.includes(o), smart: !!(d.smart && d.smart.includes(o)) };
      if (d.kind === 'pay') {                                                                             // T-089: one (source, role) pair of a payment
        const u = d.units[o.u], same = d.units.filter((x, i) => i < o.u && x.src === u.src && x.src).length, sn2 = u.src && u.src.card ? u.src.card.name : (u.floating ? 'Floating mana' : 'Mana');
        item.name = sn2 + (same ? ' #' + (same + 1) : '') + ' → ' + (o.role === 'generic' ? 'generic' : (G.COLOR_NAME[o.role] || (o.role === 'C' ? 'colorless' : o.role))); item.iid = u.src && u.src.iid != null ? u.src.iid : null; item.card = u.src && u.src.card ? u.src.card : null;
        item.note = d.side(u).join(' · '); item.u = o.u; item.role = o.role;
      } else if (d.kind === 'mode' && d.spree) { item.name = String(o.text || fxLabel(o.mode)).replace(/^\+\s*/, ''); const c = o.cost || {}, n = (c.generic || 0) + (c.pips || []).length; item.note = `costs ${n} more mana`; }
      else if (d.kind === 'mode' && o.text) { item.name = o.text; }
      else if (d.kind === 'mode') { item.name = fxLabel(o.mode); const same = opts.filter(x => fxLabel(x.mode) === item.name); if (same.length > 1) item.name += ` (mode ${(d.f && d.f.modes ? d.f.modes.indexOf(o.mode) : k) + 1} on the card)`; }
      else if (d.kind === 'explore') { item.name = o ? 'Put it into your graveyard' : 'Keep it on top of your library'; item.note = o ? 'mill it: you draw something else next' : 'you draw it next'; }
      else if (o && o.ability) { item.name = `${o.card.name}: ${o.label}`; item.card = o.card; item.iid = o.iid; item.note = 'in response: activate' + (o.cost ? ` (${o.cost})` : ''); item.ability = true; }          // one of your permanents' abilities, used in response
      else if (d.kind === 'counter') { item.name = o.c.card.name; item.card = o.c.card; item.iid = o.c.iid; item.note = o.how === 'pitchX' ? `counter it (X is its mana value): exile ${o.pitch.card.name}` : o.how === 'pitch' ? `counter it: exile ${o.pitch.card.name}${o.c.card.a.pitch.life ? ' and pay ' + o.c.card.a.pitch.life + ' life' : ''}` : (HOW[o.how] || '') + (o.free && o.how === 'respond' ? ' (free: you control a commander)' : ''); }
      else if (d.kind === 'resolve') { item.name = o.card.name; item.card = o.card; item.iid = o.iid; item.note = HOW.respond; }
      else if (d.kind === 'protect') { item.name = o; }
      else if (d.kind === 'combo') { item.name = o.label; item.note = o.note || ''; item.id = o.id; }
      else if (d.kind === 'shock') { item.name = o === 'pay' ? `Pay ${d.life} life` : 'Enter tapped'; item.note = o === 'pay' ? `it enters untapped · you go to ${g.life - d.life} life` : 'no life paid · it can\'t tap for mana this turn'; }
      else if (d.kind === 'tax') { item.name = o === 'pay' ? `Pay {${d.cost}}` : 'Do not pay'; item.note = o === 'pay' ? `you have ${G.allUnits(g).length} untapped mana` : taxThen(d, g, m); }          // T-080: "unless that player pays"
      else if (d.kind === 'may') { item.name = o === 'yes' ? d.yes || 'Yes' : d.no || 'No'; if (o === 'yes' && d.yesWhy) { item.disabled = true; item.note = d.yesWhy; } }          // T-090: a plain "you may" (Sylvan Library)
      else if (d.kind === 'color') { item.name = d.basic ? { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' }[o] + ' (' + (G.COLOR_NAME[o] || o) + ')' : G.COLOR_NAME[o] || o; const n = (d.counts || {})[o] || 0; item.note = `${n} card${n === 1 ? '' : 's'} left in your library and hand`; }
      else if (d.kind === 'player') { item.name = m && m.names ? m.names[o.pid] : 'Opponent'; item.owner = o.pid; item.note = `${o.life} life · ${o.hand.length} card${o.hand.length === 1 ? '' : 's'} in hand · ${o.battlefield.filter(p => G.isCreaturePerm(p)).length} creatures`; }
      else if (d.kind === 'x' && d.what === 'squad') { item.name = o ? `Pay squad ${o === 1 ? 'once' : o + ' times'}` : 'Don\'t pay squad'; item.note = o ? `${o} token cop${o === 1 ? 'y' : 'ies'} of it as it enters` : 'just the card'; }
      else if (d.kind === 'x' && d.what === 'prelate') { item.name = 'Number ' + o; item.note = 'noncreature spells with mana value ' + o + ' can\'t be cast'; }
      else if (d.kind === 'x') { item.name = 'X = ' + o; item.note = o === opts[opts.length - 1] ? 'all the mana you can pay' : ''; }
      else if (d.kind === 'tribe') { item.name = o; const n = (d.counts || {})[o] || 0; item.note = (o === d.learned ? (d.spellAsk ? 'the autopilot\'s pick · ' : 'learned · ') : '') + (n ? `${n} creature card${n === 1 ? '' : 's'}${d.spellAsk ? ' in your graveyard' : ''}` : 'named by your cards'); }
      else if (d.what === 'proliferate' && o && o.prolPlayer) { item.name = o.o === g ? 'You' : o.o && m && m.names ? m.names[o.o.pid] : 'Opponent'; item.note = o.kinds.map(([k, n]) => k + ' ×' + n).join(' · '); item.owner = o.o && o.o !== g ? o.o.pid : null; }          // T-128: a player's counters
      else {
        item.name = o.card.name; item.card = o.card; item.iid = o.iid;
        if (d.what === 'proliferate') { const w = owner(o), cl = []; if (o.counters) cl.push((o.counters > 0 ? '+1/+1' : '-1/-1') + ' ×' + Math.abs(o.counters)); if (o.loyalty > 0) cl.push('loyalty ×' + o.loyalty); for (const k of Object.keys(o.other || {})) if (o.other[k]) cl.push(k + ' ×' + o.other[k]); item.owner = w.pid; item.note = [w !== g && m && m.names ? m.names[w.pid] : '', cl.join(' · ')].filter(Boolean).join(' · '); }
        else
        if (d.what === 'graveyard') { item.note = [d.theirs && d.theirs.has(o) ? "in another player's graveyard" : '', (o.card.type_line || '').split(' — ')[0]].filter(Boolean).join(' · '); }
        else if (d.kind === 'target' || d.kind === 'sacrifice' || d.kind === 'legend') { const w = owner(o); item.owner = w.pid; item.note = [w !== g && m && m.names ? m.names[w.pid] : '', ptOf(w, o), o.counters ? (o.counters > 0 ? '+' : '') + o.counters + ' counters' : '', o.token ? 'token' : ''].filter(Boolean).join(' · '); }
      }
      if (item.def) q.def.push(k);
      q.options.push(item);
    });
    const by = d.by && m && m.names ? m.names[d.by.pid] : 'An opponent';
    if (d.kind === 'search') {
      const f = d.f || {}, tapped = f.tapped ? ', tapped' : '';
      const where = f.dest === 'intuition' ? 'to an opponent, who chooses one for your hand; the rest go into your graveyard' : f.dest === 'graveyard' ? 'into your graveyard' : f.dest === 'top' ? 'on top of your library' : f.dest === 'battlefield' ? 'onto the battlefield' + tapped : f.dest === 'split' ? `${f.bf === 1 ? 'one goes' : f.bf + ' go'} onto the battlefield${f.tapped ? ' tapped' : ''} and the other${f.hand === 1 ? '' : 's'} into your hand` : 'into your hand';
      q.dest = f.dest === 'intuition' ? 'Revealed: an opponent picks one for your hand' : f.dest === 'graveyard' ? 'Your graveyard' : f.dest === 'top' ? 'Top of your library (after the shuffle)' : f.dest === 'battlefield' ? 'Battlefield' + (f.tapped ? ', tapped' : '') : f.dest === 'split' ? `${f.bf} to the battlefield${tapped}, ${f.hand} to your hand` : 'Your hand';
      if (d.what === 'battlefield') { q.title = `${sn || 'Search'}: which land goes onto the battlefield?`; q.text = `Choose ${f.bf === 1 ? 'the land' : f.bf + ' lands'} to put onto the battlefield${tapped}; the rest go into your hand.`; }
      else { q.title = `${sn || 'Search'}: search your ${f.land ? 'library for ' + (f.land === 'basic' ? 'basic lands' : 'a land') : 'library'}`; q.text = `Choose ${filterWords(f)}. ${f.dest === 'split' ? 'Then ' + where.replace(/^one goes/, 'you choose which one goes') : (f.n > 1 ? 'They go ' : 'It goes ') + where}; your library is shuffled.`; }
      if (f.slot) { q.title = `${sn || 'Search'}: search for ${filterWords(f)} (${f.slot} of ${f.of})`; q.text = `Choose ${filterWords(f)}. It goes ${where}${f.slot < f.of ? '; the next search follows' : '; your library is then shuffled'}.`; }
      if (d.optional) q.none = 'Find nothing';                            // a search of a hidden zone may come up empty
      q.fan = true;
    } else if (d.kind === 'target') {
      const f = d.f || {};
      if (d.what === 'removal') { q.title = `${sn || 'Removal'}: choose a target`; q.text = `Choose the permanent to ${f.how === 'exile' ? 'exile' : f.how === 'tuck' ? 'put into its owner\'s library' : 'destroy'}.`; q.none = 'No target (nothing happens)'; }
      else if (d.what === 'graveyard') { q.title = `${sn || 'Effect'}: choose a card in ${d.theirs && d.theirs.size ? 'a' : 'your'} graveyard`; q.text = `Choose the card that ${d.dest === 'flashback' ? 'gains flashback: you cast it now from your graveyard, paying its mana cost, and then it is exiled' : d.dest === 'yardCast' ? 'you may cast from your graveyard this turn (an instant or sorcery is exiled afterwards)' : d.dest === 'kaervek' ? 'is exiled and copied: you may cast the copy by paying its mana cost, and if you do you lose 2 life' : 'returns ' + (d.dest === 'battlefield' ? 'to the battlefield' : d.dest === 'top' ? 'to the top of your library' : 'to your hand')}. Only the cards it can take are listed.`; q.none = d.dest === 'yardCast' || d.dest === 'kaervek' ? 'None (cast nothing)' : 'No target (nothing returns)'; q.fan = true; }
            else if (d.what === 'bounce') { q.title = `${sn || 'Bounce'}: choose a target`; q.text = 'Choose the permanent to return to its owner\'s hand.'; q.none = 'No target (nothing happens)'; }
      else if (d.what === 'burn') { q.title = `${sn || 'Damage'}: ${d.n} damage`; q.text = `Choose a creature this kills${d.face ? ', or deal the damage to the players' : ''}. Only creatures the damage would kill are listed: the engine does not keep damage on a creature that survives.`; q.none = d.face ? 'Deal it to the players' : 'No target (nothing happens)'; }
      else if (d.what === 'counters' && multi) { q.title = `${sn || 'Counters'}: choose up to ${max === 1 ? 'one creature' : max + ' creatures'}`; q.text = `Choose up to ${max} creature${max === 1 ? '' : 's'}: each gets ${typeof d.n === 'number' ? d.n + ' ' : ''}${f.kind || '+1/+1'} counter${d.n === 1 ? '' : 's'}.`; }
      else if (d.what === 'counters') { q.title = `${sn || 'Counters'}: choose a creature`; q.text = `Choose the creature that gets ${typeof d.n === 'number' ? d.n + ' ' : ''}${f.kind || '+1/+1'} counter${d.n === 1 ? '' : 's'}.`; }
      else if (d.what === 'explore') { q.title = `${sn || 'Explore'}: choose a creature`; q.text = 'Choose the creature that explores: you reveal the top card of your library; a land goes to your hand, otherwise the creature gets a +1/+1 counter.'; }
      else if (d.what === 'aura') { q.title = `${sn || 'Aura'}: choose a creature`; q.text = 'Choose the creature it enchants.'; }
      else if (d.what === 'biter' || d.what === 'fighter') { q.title = `${sn || 'Fight'}: choose your creature`; q.text = d.what === 'biter' ? 'Choose your creature: it deals damage equal to its power to a creature you choose next.' : 'Choose your creature: it fights a creature you choose next (each deals damage equal to its power to the other).'; }
      else if (d.what === 'bitten' || d.what === 'fought') { const fn = d.fighter ? d.fighter.card.name : 'your creature'; q.title = `${sn || 'Fight'}: choose what ${fn} ${d.what === 'bitten' ? 'damages' : 'fights'}`; q.text = d.what === 'bitten' ? `${fn} deals damage equal to its power to the creature you choose.` : `${fn} and the creature you choose each deal damage equal to their power to the other.`; }
      else if (d.what === 'pumpAttacker') { const f = d.f || {}; q.title = `${sn || 'Attack'}: choose an attacking creature`; q.text = `Choose the attacking creature that gets +${f.p || 0}/+${f.t || 0}${(f.kw || []).length ? ' and gains ' + f.kw.join(', ') : ''} until end of turn.`; }
      else if (TARGET_WORDS[d.what]) { const [t, x] = TARGET_WORDS[d.what]; q.title = `${sn || 'Ability'}: ${t}`; q.text = x; if (d.what === 'lookBf') q.none = 'Put none of them onto the battlefield'; }          // the activated abilities' targets (G.abilityMenu)
      else { q.title = `${sn || 'Effect'}: choose a creature`; q.text = 'Choose the creature that gets the bonus.'; }
    } else if (d.kind === 'mode' && d.spree) {                                                            // spree: a mode is paid for as the spell is cast, more may be added
      q.title = d.spree === 'first' ? `${sn || 'Spree'}: choose a mode to cast it with` : `${sn || 'Spree'}: add another mode?`;
      q.text = d.spree === 'first' ? 'Spree: you pay for at least one mode as you cast it. Only the modes you can pay for are listed; more can be added next.' : 'You can pay for another mode. Choose it, or cast the spell as it is.';
      if (d.spree === 'more') q.none = 'No more modes';
      if (src) { q.spell = src; q.spellNote = 'being cast'; }
    } else if (d.kind === 'mode' && d.will) {                                                              // Jeska's Will: you control a commander
      q.title = `${sn || 'Spell'}: choose one or both`; q.text = 'You control a commander, so you may choose both modes.';
    } else if (d.kind === 'mode') {
      q.title = `${sn || 'Spell'}: choose ${typeof d.pick === 'number' ? (d.pick === 1 ? 'one' : d.pick === 2 ? 'two' : d.pick) : 'one or more'}`;
      q.text = 'Only the modes the engine can play are listed.';
    } else if (d.kind === 'land') {                                                                        // Hakbal: a land from your hand, or a card
      q.title = `${sn || 'Effect'}: put a land onto the battlefield?`;
      q.text = 'Choose a land card from your hand to put onto the battlefield. If you do not, you draw a card.';
      q.none = 'Draw a card instead';
    } else if (d.kind === 'may') {                                                                        // a plain yes/no: the title and text come with the question
      q.title = d.title || `${sn || 'Choose'}?`; q.text = d.text || '';
      if (src) { q.spell = src; q.spellNote = 'yours'; }
    } else if (d.kind === 'discard' && d.sylvan) {                                                        // Sylvan Library: which two cards drawn this turn, and which goes on top
      if (d.sylvan === 'choose') { q.title = `${sn}: choose ${max === 1 ? 'a card' : max + ' cards'} drawn this turn`; q.text = 'For each card you choose, pay 4 life or put it on top of your library. The cards you do not choose stay in your hand for free.'; }
      else { q.title = `${sn}: which card goes on top?`; q.text = 'You put two cards back. The one you choose goes on top of your library, so you draw it next.'; }
    } else if (d.kind === 'discard') {
      if (d.rack) { q.title = `${sn}: which cards go on top of your library?`; q.text = 'Choose any number of cards from your hand. They go on top of your library, and you take that many cards from the top first.'; }
      else {
      q.title = d.cost ? `${sn}: discard ${max === 1 ? 'a card' : max + ' cards'} to cast it` : d.cleanup ? `End of turn: discard down to ${d.cleanup.max}` : 'Discard a card';
      q.text = d.cleanup ? `Your hand is over its maximum size of ${d.cleanup.max}. Choose a card to discard (${d.cleanup.left} to go).` : max === 1 ? 'Choose the card to discard.' : `Choose ${max} cards to discard.`; }
    } else if (d.kind === 'imprint') {                                                                      // T-086: Chrome Mox, Isochron Scepter, Semblance Anvil, Ugin's Labyrinth, Extraplanar Lens, Mimic Vat
      const zone = /died/.test(d.what) ? 'graveyard' : /land you control/.test(d.what) ? 'battlefield' : 'hand';
      q.title = `${sn || 'Imprint'}: ${zone === 'graveyard' ? 'exile the creature that died?' : 'imprint which card?'}`;
      q.text = zone === 'graveyard' ? 'You may exile the creature card that just died. If you do, the card already exiled with it returns to its owner\'s graveyard.' : `You may exile ${/^a[n]? /.test(d.what) ? d.what : 'a card'} ${zone === 'battlefield' ? '' : 'from your hand '}as it comes in. Only the cards its text allows are listed.`.replace(/ +/g, ' ');
      q.none = 'Don\'t imprint';
    } else if (d.kind === 'sacrifice') {
      const w = d.what || 'creature';                                                                     // what: 'land' (Crop Rotation)
      q.title = d.ability ? `${d.ability}: sacrifice a ${w}` : d.cost ? `${sn}: sacrifice a ${w} to cast it` : d.by ? `${by} makes you sacrifice a ${w}` : `${sn || 'Effect'}: sacrifice a ${w}`;          // no by: your own card's effect (Roiling Regrowth)
      q.text = `Choose the ${w} to sacrifice.` + (d.cost && d.def == null ? ' The autopilot would not cast this: it has nothing it wants to give up.' : '');
      q.none = d.ability ? 'Cancel' : 'Do not cast it';
    } else if (d.kind === 'legend') {                                                                       // the legend rule (state-based action)
      q.title = `Legend rule: you control ${opts.length} ${d.what}`;
      q.text = 'Only one legendary permanent with the same name can stay. Choose the one you keep; the others go to the graveyard.';
    } else if (d.kind === 'instant') {
      const who = d.caster && m && m.names ? m.names[d.caster.pid] : 'An opponent';
      q.step = d.step;
      q.title = d.step === 'end' ? `End of ${who}'s turn: cast an instant?` : `${who} attacks: cast an instant?`;
      q.text = d.step === 'end' ? 'You may cast an instant or a card with flash now with the mana you left untapped (only the ones you can pay for are listed).' : 'Attackers are declared. You may cast an instant or a card with flash now (only the ones you can pay for are listed); then combat goes on.';
      q.none = 'Not now';
    } else if (d.kind === 'priority') {                                                                    // T-127 stage 1 (docs/PRIORITY-DESIGN.md): you hold priority at a step; the default is to pass
      const lab = { stack: 'Ability on the stack', upkeep: 'Upkeep', draw: 'Draw step', main: 'Main phase', beginCombat: 'Beginning of combat', blockers: 'Blockers declared', damage: 'Combat damage', endCombat: 'End of combat', combat: 'Attackers declared', end: 'End step' }[d.step] || d.step;
      const own = d.active && d.active === g;
      q.step = d.step; q.stepName = lab; q.turnOf = own ? 'You' : (m && m.names && d.active ? m.names[d.active.pid] : 'Opponent');          // T-130: the priority sheet (choices.js) writes its own one-line context from these
      if (d.step === 'stack') { q.title = `${d.topCard ? d.topCard.name : 'An ability'} is on the stack: respond?`; q.text = (d.top ? d.top + ' ' : '') + 'You have priority before it resolves. Cast an instant or a card with flash, or use an ability, or pass.'; q.none = 'Pass'; }
      else {
        q.title = `${lab}${own ? '' : ' (' + (m && m.names && d.active ? m.names[d.active.pid] : 'their') + ' turn)'}: cast an instant or use an ability?`;
        q.text = 'You have priority. Cast an instant or a card with flash, or use an ability, or pass (only what you can pay for is listed).';
        q.none = 'Pass';
      }
    } else if (d.kind === 'ringbearer') {
      const lv = Math.min(4, d.n || 1), ord = ['', 'first', 'second', 'third', 'fourth'][d.n] || d.n + 'th';
      q.title = `💍 The Ring tempts you (${ord} time): choose your Ring-bearer`;
      q.text = `Your Ring-bearer has: ${G.RING_TEXT.slice(0, lv).map((t, i) => (i + 1) + '. ' + t.replace(/^Your Ring-bearer /, '').replace(/^Whenever your Ring-bearer /, 'whenever it ')).join(' ')}`;
    } else if (d.kind === 'x' && d.what === 'squad') {                                                    // squad: pay the extra cost any number of times
      const cm = String(src && src.oracle_text || '').match(/^Squad ((?:\{[^}]+\})+)/m), cs = cm ? cm[1] : null;
      q.title = `${sn}: pay squad how many times?`;
      q.text = `Squad${cs ? ' ' + cs : ''}: each time you pay it, a token copy of it enters with it. Up to ${opts[opts.length - 1]} with the mana you have.`;
      q.spell = src; q.spellNote = 'being cast';
    } else if (d.kind === 'x' && d.what === 'prelate') {
      q.title = `${sn}: choose a number`; q.text = 'Noncreature spells with mana value equal to the chosen number can\'t be cast.';
    } else if (d.kind === 'x') {
      q.title = `${sn}: choose X`;
      q.text = `X can be up to ${opts[opts.length - 1]} with the mana you have${d.less ? ` (your first X spell this turn costs {${d.less}} less)` : ''}.`;
      q.spell = src; q.spellNote = 'being cast';
    } else if (d.kind === 'explore') {
      const pn = src ? src.name : 'Your creature';
      q.title = `${pn} explores: ${d.reveal.card.name}`;
      q.text = `The revealed card is not a land, so ${pn} gets a +1/+1 counter. Keep ${d.reveal.card.name} on top of your library, or put it into your graveyard?`;
      q.spell = d.reveal.card; q.spellNote = 'revealed';
    } else if (d.kind === 'counter') {
      const who = d.caster && m && m.names ? m.names[d.caster.pid] : 'An opponent';
      const nc = opts.filter(o => o.how !== 'respond' && o.how !== 'ability').length, nr = opts.length - nc;
      q.title = `${who} casts ${d.spell.card.name}: does it resolve?`;
      const tg = targetsOf(d, g, m); if (tg) q.targets = tg.list;
      q.text = (tg ? tg.text : '') + (d.unc ? 'It cannot be countered. ' : '') + (!opts.length ? 'You have no counterspell, instant, card with flash or ability you can pay for: let it resolve.' : `You may ${nc ? 'counter it' : ''}${nc && nr ? ', or ' : ''}${nr ? 'respond with an instant, a card with flash or an ability of one of your permanents (it resolves first; then you are asked again)' : ''}. Only what you can pay for is listed.`);
      q.none = 'Let it resolve';
      q.spell = d.spell.card; q.spellNote = 'on the stack';
    } else if (d.kind === 'tribe') {                                                                      // Metallic Mimic, Cavern of Souls, Kindred Discovery: "As ~ enters, choose a creature type"
      q.title = `${sn || 'This permanent'}: choose a creature type`;
      const spell = (src && /\b(Instant|Sorcery)\b/.test(src.type_line || '')) || d.spellAsk;
      q.text = d.spellAsk ? `It names a creature type: the creature cards of that type in your graveyard return to the battlefield. The types in your graveyard are listed; ★ is the autopilot's pick (${d.learned}), the type worth the most.`
        : `${spell ? 'As it resolves it names a creature type for what it does' : 'As it enters it names a creature type, and plays as that type from now on'}. The types of your deck's creatures are listed; ★ is the learned type (${d.learned}), the one the autopilot names.`;
      if (src) { q.spell = src; q.spellNote = spell ? 'resolving' : 'entering'; }
    } else if (d.kind === 'player') {                                                                     // a pod: "target opponent"
      q.title = `${sn || 'Spell'}: choose an opponent`;
      q.text = 'It targets an opponent. ★ is the player you are facing this turn (the autopilot\'s pick).';
      if (src) { q.spell = src; q.spellNote = 'resolving'; }
    } else if (d.kind === 'color') {                                                                      // "As ~ enters, choose a color": Caged Sun, Utopia Sprawl, the Thriving lands
      q.title = d.basic ? `${sn || 'This land'}: choose a basic land type` : `${sn || 'This permanent'}: choose a color`;
      q.text = d.basic ? 'As it enters you choose a basic land type. The land is that type, so it taps for that color (and only that color).' : 'As it enters it names a color, and plays with that color from now on. ★ is the autopilot\'s pick: the color most of your remaining cards have.';
      if (src) { q.spell = src; q.spellNote = 'entering'; }
    } else if (d.kind === 'combo') {                                                                      // T-061: an assembled combo, and what to do with it
      const cb = d.combo || {};
      q.title = `Combo assembled: ${cb.name}${cb.cards && cb.cards.length ? ' (' + cb.cards.join(' + ') + ')' : ''}`;
      q.text = { mana: 'It makes mana without end. Say how much you want: ∞ is as much as you like.', mill: 'It can mill a whole library.', draw: 'It draws your whole library.', tokens: 'It makes as many hasty attackers as you like.', damage: 'It deals damage or drains every opponent as often as you like.' }[cb.outcome] + (opts.some(o => o.id === 'win') ? ' ★ is the autopilot\'s pick: play it out to the win.' : '');
      q.combo = { name: cb.name, cards: cb.cards || [], outcome: cb.outcome };
    } else if (d.kind === 'tax') {                                                                        // "...unless that player pays {N}": the player the tax is aimed at chooses
      q.title = `${sn || 'Tax'}: pay {${d.cost}}, or ${taxThen(d, g, m)}?`;
      q.text = `${d.why || 'You may pay'} Pay {${d.cost}} and nothing happens, or do not pay and ${taxThen(d, g, m)}. You can spend ${G.allUnits(g).length} mana now. ★ is the autopilot's pick: it pays only with spare mana (what is left after its turn's plan, or after the instants it holds).`;
      if (src) { q.spell = src; q.spellNote = 'it taxes you'; }
    } else if (d.kind === 'pay') {                                                                        // T-089: pay a cost with the sources you choose
      const c = d.cost, sym = x => (/^[WUBRGC]$/.test(x) ? x : '?'), ctext = (c.generic ? '{' + c.generic + '}' : '') + c.pips.map(p => '{' + p.map(sym).join('/') + '}').join('');
      q.title = `${sn ? sn + ': pay ' : 'Pay '}${ctext || 'nothing'}`;
      q.text = 'Choose the sources that pay, and the colour a many-coloured source makes. Confirm is on once the choice pays the cost exactly; "Pay automatically" is the payment that wastes no mana.';
      if (src && src.type_line) { q.spell = src; q.spellNote = 'being paid for'; }
      q.pay = { cost: { generic: c.generic, pips: c.pips.map(p => p.slice()) }, n: c.generic + c.pips.length, text: ctext, units: d.units.map((u, i) => ({ u: i, name: u.src && u.src.card ? u.src.card.name : (u.floating ? 'Floating' : 'Mana'), card: u.src && u.src.card ? u.src.card : null, colors: [...u.colors].filter(x => d.options.some(o => o.u === i && o.role === x)), side: d.side(u), floating: !!u.floating, used: d.options.some(o => o.u === i) })).filter(x => x.used),
        // sel: [{ u, force }]: the option numbers of a payment that pays exactly, or null
        smart: d.smart ? d.smart.map(o => d.options.indexOf(o)).filter(k => k >= 0) : null,
        // T-099: what a selection (unit numbers) leaves floating: [{ name, made, left }]
        waste: sel => G.payWaste(d.units, new Set(sel)).map(w => ({ name: w.name, made: w.made, left: w.left })),
        solve: sel => { const roles = G.payAssign(d.cost, d.units, sel.map(x => ({ i: x.u, force: x.force || null }))); if (!roles) return null; const ks = sel.map((x, j) => d.options.findIndex(o => o.u === x.u && o.role === roles[j])); return ks.some(k => k < 0) ? null : ks.sort((x, y) => x - y); } };
    } else if (d.kind === 'shock') {                                                                      // shock lands: "you may pay 2 life. If you don't, it enters tapped"
      q.title = `${sn || 'Land'}: pay ${d.life} life?`;
      q.text = `As it enters, you may pay ${d.life} life. If you don't, it enters tapped.`;
      if (src) { q.spell = src; q.spellNote = 'entering'; }
    } else if (d.kind === 'protect') {                                                                    // an answer the autopilot would give for you: Heroic Intervention, Spellskite, Cursecatcher, Teferi at their end step
      q.title = `${d.why}: respond?`;
      q.text = d.def == null ? 'You can answer it this way; the autopilot would let it happen. Choose it, or "Not now".' : 'The autopilot would answer it this way. Choose it, or "Not now" to let it happen.';
      q.none = 'Not now';
      if (d.target && d.target.card) { q.spell = d.target.card; q.spellNote = 'yours'; }
    } else if (d.kind === 'resolve') {
      q.title = `You cast ${d.spell.card.name}: does it resolve?`;
      const tg = targetsOf(d, g, m); if (tg) q.targets = tg.list;
      q.text = (tg ? tg.text : '') + `It is on the stack. ${opts.length ? 'You may respond to your own spell first with an instant, a card with flash or an ability (it resolves first). ' : ''}When you pass, the other players answer: they counter it or let it resolve.`;
      q.none = 'Pass';
      q.spell = d.spell.card; q.spellNote = 'on the stack';
    }
    { const st = G.stackView ? G.stackView(g) : [];          // what waits on the stack while you choose (newest first)
      if (st.length) q.stack = st.map(x => ({ name: x.card ? x.card.name : 'An ability', card: x.card, kind: x.kind, text: x.text || '', who: x.pid === g.pid ? 'You' : (m && m.names ? m.names[x.pid] : 'Opponent') })); }
    if (!q.optional) q.none = null;
    // every option the same card (two Swamps for Cultivate's battlefield half, five identical Soldier tokens): there is nothing to choose
    if (!q.optional && q.min === q.max && new Set(q.options.map(o => [o.name, o.note, o.owner].join('|'))).size === 1) return null;
    q.sig = [d.kind, d.what || '', min, max, q.options.map(o => o.name + (o.iid == null ? '' : '#' + o.iid)).join('|')].join('/');
    return q;
  }
  // an answer is { sig, pick }: pick is 'auto' (the autopilot decides), 'none', an option number, or a list of option numbers
  function take(d, q, a, c) {
    if (!a || a.sig !== q.sig) { c.mismatch = (c.mismatch || 0) + 1; return d.def; }          // not the question that was answered: the autopilot's pick
    if (a.pick === 'auto' || a.pick == null) return d.def;
    if (a.pick === 'smart') return d.smart || d.def;          // T-099: a person's "Pay automatically": the payment that wastes no mana
    if (q.multi) {
      const ks = [...new Set([].concat(a.pick))].filter(k => Number.isInteger(k) && k >= 0 && k < d.options.length).sort((x, y) => x - y);
      if (!(ks.length >= q.min && ks.length <= q.max)) return d.def;
      const list = ks.map(k => d.options[k]);
      return d.valid && !d.valid(list) ? d.def : list;          // a payment (T-089) must pay the cost exactly
    }
    if (d.kind === 'combo' && a.pick && typeof a.pick === 'object' && Number.isInteger(a.pick.mana) && a.pick.mana > 0 && d.options.some(o => o.id === 'mana:inf')) { const n = a.pick.mana; return n > 99 ? d.options.find(o => o.id === 'mana:inf') : { id: 'mana:' + n, label: `${n} mana`, note: '' }; }          // "[number] mana": any amount typed
    if (a.pick === 'none') return q.optional ? null : d.def;
    return Number.isInteger(a.pick) && a.pick >= 0 && a.pick < d.options.length ? d.options[a.pick] : d.def;          // an option may itself be false (explore: "keep it on top")
  }
  const PENDING = { pending: true };
  // the chooser of a seat a person plays. It keeps nothing itself: the answers and the place in them live on the game (g.choices),
  // so a copy of the game carries its own.
  function ask(g, d) {
    const c = g.choices;
    if (!c || !c.on) return d.def;
    const q = question(g, d);
    if (!q) return d.def;
    c.asked = (c.asked || 0) + 1;
    if (c.i < c.answers.length) return take(d, q, c.answers[c.i++], c);
    if (c.probe) { c.pending = q; throw PENDING; }
    return d.def;
  }
  function seat(g) { g.ask = ask; g.choices = { on: false }; return g; }

  // Try a call with the answers so far. run(games) makes the engine call on the games it is given (the real ones or a copy) and returns
  // its result. { done: true, result } when the call went through on the real game; { done: false, ask, view } when a question is
  // still open: ask is the question, view is the copy of the game as it stands at that moment (what the table looks like right now).
  function attempt(games, pid, run, answers) {
    const copy = clonePod(games);
    copy[pid].choices = { on: true, probe: true, answers, i: 0 };
    try { run(copy); } catch (e) { if (e !== PENDING) throw e; return { done: false, ask: copy[pid].choices.pending, view: copy }; }
    const me = games[pid], c = me.choices = { on: true, probe: false, answers, i: 0 };
    try { return { done: true, result: run(games), asked: c.i, mismatch: c.mismatch || 0 }; } finally { me.choices = { on: false }; }
  }
  // choose(question, view) gives the answer's pick ('auto', 'none', a number, a list of numbers), now or later
  async function resolve(games, pid, run, choose) {
    const answers = [];
    for (;;) {
      const r = attempt(games, pid, run, answers);
      if (r.done) return r.result;
      answers.push({ sig: r.ask.sig, pick: await choose(r.ask, r.view) });
    }
  }
  // The same with several seats played by people at once (a game between two people: your removal spell asks you for its target, and
  // asks the other player whether to counter it). answers: seat -> list. The probe stops at the first question of any of them; q.seat
  // says whose it is.
  function attemptSeats(games, pids, run, answers) {
    const copy = clonePod(games);
    pids.forEach(p => { copy[p].choices = { on: true, probe: true, answers: answers[p] || [], i: 0 }; });
    try { run(copy); } catch (e) { if (e !== PENDING) throw e; const p = pids.find(x => copy[x].choices.pending); return { done: false, ask: copy[p].choices.pending, view: copy }; }
    const cs = pids.map(p => (games[p].choices = { on: true, probe: false, answers: answers[p] || [], i: 0 }));
    try { return { done: true, result: run(games), mismatch: cs.reduce((t, c) => t + (c.mismatch || 0), 0) }; } finally { pids.forEach(p => { games[p].choices = { on: false }; }); }
  }
  async function resolveSeats(games, pids, run, choose) {
    const answers = {};
    for (;;) {
      const r = attemptSeats(games, pids, run, answers);
      if (r.done) return r.result;
      (answers[r.ask.seat] = answers[r.ask.seat] || []).push({ sig: r.ask.sig, pick: await choose(r.ask, r.view) });
    }
  }
  function resolveSync(games, pid, run, choose) {
    const answers = [];
    for (;;) {
      const r = attempt(games, pid, run, answers);
      if (r.done) return r.result;
      answers.push({ sig: r.ask.sig, pick: choose(r.ask, r.view) });
    }
  }

  // ---------- one turn, step by step ----------
  const STEPS = ['untap', 'upkeep', 'draw', 'main1', 'combat', 'main2', 'end'];
  const STEP_NAME = { untap: 'Untap', upkeep: 'Upkeep', draw: 'Draw', main1: 'Main', combat: 'Combat', main2: 'Second main', end: 'End' };
  const turn = {
    begin(g, target) { G.podFocus(g, target); return G.beginTurn(g); },                                  // untap, upkeep and draw: split them with beginSteps
    main1(g) { const ev = [], le = G.matchOver(g) ? null : G.landStep(g); if (le) ev.push(le, ...le.ev); G.comboLines(g, ev); ev.push(...G.castPhase(g).ev); G.comboLines(g, ev); return ev; },
    declare(g) { return G.matchOver(g) ? null : G.previewAttack(g); },                                   // beginning of combat: who would attack
    // force = { attackers: [iid], blocks: { attackerIid: [blockerIid] } } when a person chose them
    combat(g, force) {
      if (G.matchOver(g)) return [];
      if (!force) return G.combat(g);
      const d = g.opp;
      if (force.attackers) g.forceAttackers = force.attackers;
      if (force.blocks && d) d.forcedBlocks = force.blocks;
      try { return G.combat(g); } finally { g.forceAttackers = null; if (d) d.forcedBlocks = null; }
    },
    main2(g) { return G.matchOver(g) ? [] : G.postCombat(g); },
    main2Mine(g) { return G.matchOver(g) ? [] : G.postCombatTriggers(g); },          // a person's second main phase: its triggers only; casting is theirs
    end(g) { return G.endTurn(g); },
    out(g) { const ev = []; if (g.match.winner == null && !g.dead && g.library.length === 0 && g.hand.length === 0) G.eliminate(g, null, ev, 'empty'); return ev; },
  };
  // The events of the beginning of a turn, by step (the engine marks where each step starts: g.stepMarks).
  function beginSteps(g, ev) {
    const mk = g.stepMarks || {}, u = mk.upkeep == null ? ev.length : mk.upkeep, dr = mk.draw == null ? ev.length : mk.draw, mn = mk.main == null ? ev.length : mk.main;
    return [['untap', ev.slice(0, u)], ['upkeep', ev.slice(u, dr)], ['draw', ev.slice(dr, mn)], ['main1', ev.slice(mn)]];
  }
  // The turn of an autopilot seat as a list of steps to play in order: the same turn as podTurn, cut where a person may have to answer
  // and where the page pauses. Each item is { step, run(games, force) }; run plays that step on the games it is given and returns its
  // events ('declare' returns the attack preview, or null). The generator looks at the real games between steps.
  function* turnPlan(games, pid, target) {
    const g = games[pid], m = g.match;
    if (g.dead || m.winner != null) return;
    for (let k = 0; ; k++) {
      yield { step: 'begin', run: gs => turn.begin(gs[pid], k === 0 && target != null ? gs[target] : undefined) };
      yield { step: 'main1', run: gs => turn.main1(gs[pid]) };
      yield { step: 'declare', run: gs => turn.declare(gs[pid]) };
      yield { step: 'combat', run: (gs, force) => turn.combat(gs[pid], force) };
      yield { step: 'main2', run: gs => turn.main2(gs[pid]) };
      yield { step: 'end', run: gs => turn.end(gs[pid]) };
      if (!(g.extraTurns > 0 && k < 3 && m.winner == null && !g.dead)) break;
      g.extraTurns--;                                                                                    // an extra turn: at most three in a row, as in podTurn
    }
    yield { step: 'out', run: gs => turn.out(gs[pid]) };
  }
  // A whole turn played from the plan with nobody asked (the tests compare this with podTurn). preview: also look at the attack first.
  function playPlan(games, pid, target, preview) {
    const ev = [];
    for (const it of turnPlan(games, pid, target)) { if (it.step === 'declare') { if (preview) it.run(games); continue; } ev.push(...it.run(games)); }
    return ev;
  }

  // ---------- the log ----------
  // What happened, as short lines: the engine's own summary plus what a person chose or had done to them (searches, targets, discards,
  // sacrifices, counterspells). A card another player searched for and did not show stays unnamed.
  const EXTRA = /^(Sylvan Library: |Proliferate: |Tutored |Destroyed |Exiled |Returned |Discarded |Sacrificed |The opponent sacrifices |\d+ damage kills |Searched the library|Cleanup: |In response to )| counters |'s controller pays | explores: /;
  function summary(g, ev, viewer) {
    const base = G.turnSummary(g, ev), mine = viewer == null || g.pid === viewer, out = base.slice();
    for (const e of ev) {
      if (e.type === 'tutor' && e.inst) out.push(mine ? `searched for ${e.inst.card.name}` : 'searched their library for a card');
      else if (e.type === 'pw' && e.perm) out.push(`${e.perm.card.name.split(' // ')[0]} ${e.x ? '−X' : e.cost > 0 ? '+' + e.cost : e.cost < 0 ? '−' + (-e.cost) : '0'}: ${String(e.text || '').replace(/^[+−-]?(?:\d+|x|X):\s*/, '')}`);          // a loyalty ability
      else if (e.type === 'tempt') out.push(`💍 the Ring tempts ${mine ? 'you' : 'them'} (${e.n}${e.n === 1 ? 'st' : e.n === 2 ? 'nd' : e.n === 3 ? 'rd' : 'th'} time)${e.bearer ? ': ' + e.bearer.card.name + ' is the Ring-bearer' : ''}`);
      else if (e.type === 'note' && e.text && EXTRA.test(e.text) && !base.includes(e.text)) out.push(!mine && e.pub ? e.pub : !mine && /^Tutored .* to the top/.test(e.text) ? 'searched their library and put a card on top' : e.text);          // e.pub: the version without card names for another player
    }
    return out;
  }

  // ---------- a planeswalker's loyalty abilities: the menu ----------
  // Opened by clicking your planeswalker when you have priority (your main phase, nothing else waiting). One tile per ability with its
  // cost (+1, 0, −3, −X); an ability that cannot be used now is shown but cannot be picked, with the reason (not enough loyalty, already
  // used this turn, the engine does not play it). The autopilot's pick is marked; "Not now" closes the menu. Returns null for no planeswalker.
  // active: the player whose turn it is, on another player's turn (Teferi, Master of Time).
  function loyaltyQuestion(g, p, active) {
    if (!p || !p.card || !p.card.a.isPlaneswalker) return null;
    const st = G.loyaltyState(g, p, active);
    if (!st.list.length) return null;
    const options = st.list.map((it, k) => ({ k, i: it.i, label: it.label, name: `${it.label}: ${it.text}`, note: it.ok ? (it.x ? 'the autopilot picks X' : '') : it.why, disabled: !it.ok, def: false }));
    const dk = st.auto ? st.list.findIndex(it => it.ab === st.auto) : -1;
    if (dk >= 0) options[dk].def = true;
    const left = st.allowed - st.used;
    const q = { kind: 'loyalty', what: null, seat: g.pid, multi: false, min: 1, max: 1, optional: true, none: 'Not now', source: p.card, options, def: dk >= 0 ? [dk] : [],
      spell: p.card, spellNote: `loyalty ${p.loyalty}`, blocked: st.why,
      title: `${p.card.name.split(' // ')[0]}: loyalty abilities`,
      text: st.why ? `Not now: ${st.why}.` : `Loyalty ${p.loyalty}. Choose one${st.other ? " (on another player's turn, once each turn)" : left > 1 ? ` (${left} activations left this turn)` : ' (once a turn)'}.` };
    q.sig = 'loyalty/' + p.iid + '/' + options.map(o => o.name).join('|');
    return q;
  }

  // ---------- a permanent's activated abilities ----------
  // Opened by clicking a permanent of yours that has one (a Food, Gilded Goose, Ashnod's Altar, Walking Ballista...) whenever you have
  // priority: your turn, or a response on another player's turn. One tile per ability with its cost; one that cannot be used now is shown
  // with the reason. Returns null when the permanent has none.
  function abilityQuestion(g, p) {
    const list = p && p.card ? G.abilityMenu(g, p) : [];
    if (!list.length) return null;
    const options = list.map((it, k) => ({ k, i: k, name: it.label + (it.cost ? ` (${it.cost})` : ''), note: it.ok ? '' : it.why, disabled: !it.ok, def: false }));
    const q = { kind: 'ability', what: null, seat: g.pid, multi: false, min: 1, max: 1, optional: true, none: 'Not now', source: p.card, options, def: [],
      spell: p.card, spellNote: '', title: `${p.card.name}: activate an ability`, text: 'Choose one. These can be used any time you have priority: on your turn, or in a response.' };
    q.sig = 'ability/' + p.iid + '/' + options.map(o => o.name).join('|');
    return q;
  }

  // ---------- a two-faced card: which face is cast ----------
  // Esika, Queen of the Hollows // The Prismatic Bridge, Jennifer Walters // The Sensational She-Hulk: the face is chosen as it is cast.
  // The question lists the faces you can pay for right now (as card pictures, each face with its cost and type); the default is the
  // deck's face setting for that card (Simulation tab), else the front. Returns null when neither face can be cast; q.only when one can.
  function faceQuestion(g, inst) {
    const c = inst && inst.card;
    if (!c || c.layout !== 'modal_dfc' || !c.a.backCard || c.a.isLand) return null;
    const bc = c.a.backCard, half = (s, i) => String(s || '').split(' // ')[i] || '';
    const front = G.canPay(G.effectiveCost(g, inst), G.allUnits(g)), back = G.canCastBack(g, inst);
    if (!front && !back) return null;
    const set = G.faceChoice(g, c), options = [];
    if (front) options.push({ face: 0, name: half(c.name, 0), card: c, note: [half(c.mana_cost, 0), half(c.type_line, 0)].filter(Boolean).join(' · ') });
    if (back) options.push({ face: 1, name: bc.name || half(c.name, 1), card: c, note: [bc.mana_cost, bc.type_line || half(c.type_line, 1)].filter(Boolean).join(' · ') });
    options.forEach((o, k) => { o.k = k; o.def = false; });
    const d = options.find(o => o.face === (set === 'back' ? 1 : 0)) || options[0]; d.def = true;
    const q = { kind: 'face', what: null, seat: g.pid, multi: false, min: 1, max: 1, optional: false, none: null, source: c, options, def: [d.k], only: options.length === 1,
      title: `${half(c.name, 0)}: which face do you cast?`,
      text: `A two-faced card: you choose the face as you cast it. ${options.length < 2 ? '' : 'Both faces can be paid for now. '}The starting pick is ${set === 'auto' ? 'the front face' : 'the face set for this card on the Simulation tab'}.` };
    q.sig = 'face/' + options.map(o => o.name).join('|');
    return q;
  }

  // ---------- the end of another player's turn ----------
  // Instants, cards with flash and spells a permanent lets you cast as though they had flash (Leyline of Anticipation, Vedalken Orrery,
  // Teferi, Time Raveler's +1), cast with the mana that is still untapped. Counterspells are not offered here: they are asked when a
  // spell is cast.
  const instantSpeed = card => /\bInstant\b/.test(card.type_line || '') || (card.keywords || []).includes('Flash');
  function instants(g) {
    return g.hand.concat(g.command).filter(i => !i.card.a.isLand && !i.card.a.counter && G.instantSpeedFor(g, i.card) && G.canPay(G.effectiveCost(g, i), G.allUnits(g)));
  }
  // planeswalkers that may activate a loyalty ability now, on another player's turn (Teferi, Master of Time)
  function otherTurnWalkers(g, active) {
    return g.battlefield.filter(p => p.card.a.isPlaneswalker && p.card.a.masterTime && G.loyaltyState(g, p, active).list.some(it => it.ok));
  }
  // the autopilot's ability pass without what can only be done at sorcery speed (loyalty abilities, equipping)
  function instantAbilities(g) {
    const ev = [];
    g.instantOnly = true;
    try { for (let k = 0; k < 12; k++) { const e = G.useAbilities(g); if (!e.length) break; ev.push(...e); } } finally { g.instantOnly = false; }
    return ev;
  }
  // does anything happen at the beginning of this player's combat (a trigger, a crewed vehicle)? Looked up on a copy.
  function quietBeginCombat(games, pid) {
    const copy = clonePod(games);
    try { const pv = turn.declare(copy[pid]); return !pv || !pv.ev.length; } catch (e) { return false; }
  }
  // would that pass do anything right now? (looked up on a copy, so nothing happens)
  function wouldUseAbilities(games, pid) {
    const copy = clonePod(games);
    try { return instantAbilities(copy[pid]).filter(e => e.type !== 'note' || e.source).length > 0; } catch (e) { return false; }
  }

  const api = { loyaltyQuestion, abilityQuestion, faceQuestion, filterWords, clonePod, dump, question, ask, seat, attempt, resolve, resolveSync, attemptSeats, resolveSeats, SCRATCH, PENDING, STEPS, STEP_NAME, turn, beginSteps, turnPlan, playPlan, summary, fxLabel, instantSpeed, instants, otherTurnWalkers, instantAbilities, wouldUseAbilities, quietBeginCombat };
  root.Decide = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
