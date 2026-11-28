// More combos (moreCombos and the extra infinite-mana loops in sim.js), each piece recognised by its rules text. Found by running every
// built-in deck through Commander Spellbook: sacrifice loops, Underworld Breach, Peer into the Abyss with a punisher, Aetherflux Reservoir,
// Sensei's Divining Top, Hermit Druid, Ad Nauseam, Aggravated Assault, Najeela + Derevi, Goblin loops, Ulalek, Vraska + Vorinclex,
// Forsaken Monument, Nyxbloom Ancient, Voltaic Key, Lithoform Engine + Tezzeret, Tidespout Tyrant, and Scepter with a cast trigger.
const fs = require('fs'), path = require('path');
const G = require('../../goldfish/static/sim.js');
const DIR = path.join(__dirname, '..', '..', 'goldfish', 'static', 'data', 'sets');
const BASICS = ['Island', 'Forest', 'Swamp', 'Mountain', 'Plains', 'Wastes'];
const WANT = BASICS.concat(['Gravecrawler', 'Reassembling Skeleton', 'Phyrexian Altar', 'Ashnod\'s Altar', 'Pitiless Plunderer', 'Warren Soultrader', 'Viscera Seer', 'Blood Artist', 'Zulaport Cutthroat', 'Teysa Karlov',
  'Kitchen Finks', 'Heliod, Sun-Crowned', 'Archangel of Thune', 'Walking Ballista', 'Underworld Breach', 'Brain Freeze', 'Lion\'s Eye Diamond', 'Lotus Petal', 'Wheel of Fortune', 'Thassa\'s Oracle',
  'Peer into the Abyss', 'Nekusar, the Mindrazer', 'Underworld Dreams', 'Psychosis Crawler', 'Aetherflux Reservoir', 'Exquisite Blood', 'Sensei\'s Divining Top', 'Bolas\'s Citadel', 'Mystic Forge', 'Cloud Key', 'Glaring Fleshraker',
  'Hermit Druid', 'Ad Nauseam', 'Angel\'s Grace', 'Laboratory Maniac', 'Aggravated Assault', 'Savage Ventmaw', 'Old Gnawbone', 'Najeela, the Blade-Blossom', 'Derevi, Empyrial Tactician',
  'Conspicuous Snoop', 'Goblin Recruiter', 'Kiki-Jiki, Mirror Breaker', 'Krenko, Mob Boss', 'Skirk Prospector', 'Goblin Warchief', 'Ulalek, Fused Atrocity', 'Echoes of Eternity', 'Kozilek\'s Unsealing',
  'Vraska, Betrayal\'s Sting', 'Vorinclex, Monstrous Raider', 'Basalt Monolith', 'Grim Monolith', 'Forsaken Monument', 'Nyxbloom Ancient', 'Voltaic Key', 'Rings of Brighthearth', 'Thran Dynamo', 'Lithoform Engine',
  'Tezzeret the Seeker', 'Tidespout Tyrant', 'Hullbreaker Horror', 'Sol Ring', 'Mana Crypt', 'Isochron Scepter', 'Dramatic Reversal', 'Arcane Signet', 'Vivi Ornitier', 'Approach of the Second Sun', 'Demonic Tutor', 'Mystical Tutor',
  'Sifter of Skulls', 'Zombie Infestation']);
const found = {};
for (const s of JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).sets) for (const c of JSON.parse(fs.readFileSync(path.join(DIR, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref && WANT.includes(c.name) && !found[c.name]) found[c.name] = c;
const mk = (name, mana_cost, cmc, type_line, oracle_text, pt) => Object.assign({ name, mana_cost, cmc, type_line, oracle_text, colors: [], color_identity: [], keywords: [] }, pt ? { power: pt[0], toughness: pt[1] } : {});
const EXTRA = [mk('Grizzly Bears', '{1}{G}', 2, 'Creature — Bear', '', ['2', '2']), mk('Walking Corpse', '{1}{B}', 2, 'Creature — Zombie', '', ['2', '2']),
  mk('Eldrazi Devastator', '{5}', 5, 'Creature — Eldrazi', 'Trample', ['5', '5']), mk('Goblin Piker', '{1}{R}', 2, 'Creature — Goblin Warrior', '', ['2', '1'])];
const missing = WANT.filter(n => !found[n] && n !== 'Zombie Infestation' && n !== 'Mana Crypt' && n !== 'Wastes');
const all = WANT.filter(n => found[n]).map(n => found[n]).concat(EXTRA);
const mkDeck = (names, cmdr) => G.buildDeck(all.filter(c => !names || names.includes(c.name)).map(c => Object.assign({}, c, { commander: c.name === (cmdr || 'Krenko, Mob Boss'), qty: BASICS.includes(c.name) ? 10 : 1 })), []);
const deck = mkDeck(null);
const O = { turns: 12, onPlay: false, minLands: 2, maxLands: 5, freeMulligan: true, minHandSize: 5, oppLife: 40, policy: {} };
let pass = 0, fail = 0;
const check = (n, ok, d) => { (ok ? pass++ : fail++); console.log((ok ? 'PASS' : 'FAIL') + '  ' + n + (d !== undefined ? '   [' + d + ']' : '')); };
const by = n => { const c = deck.unique.find(c => c.name === n); if (!c) throw new Error('no card ' + n); return c; };
const fresh = () => { const g = G.newGame(deck, O, 5); g.turn = 5; g.command = []; g.hand = []; g.battlefield = []; g.graveyard = []; g.library = g.library.filter(i => BASICS.includes(i.card.name)).slice(0, 40); return g; };
const put = (g, n) => { const p = G.enterWithTriggers(g, { iid: g.nextIid++, card: by(n) }, {}, []); p.sick = false; p.tapped = false; p.enteredTurn = 1; return p; };
const hand = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.hand.push(i); return i; };
const yard = (g, n) => { const i = { iid: g.nextIid++, card: by(n) }; g.graveyard.push(i); return i; };
const lib = (g, n, top) => { const i = { iid: g.nextIid++, card: by(n) }; if (top) g.library.unshift(i); else g.library.push(i); return i; };
const lands = (g, n, name) => { for (let i = 0; i < n; i++) { const p = G.enter(g, { iid: g.nextIid++, card: by(name) }, {}); p.tapped = false; p.enteredTurn = 1; } };
const run = g => { const ev = []; G.comboLines(g, ev); return ev; };
const won = g => g.killTurn != null;
const sc = (name, setup, want, more) => { const g = fresh(); setup(g); run(g); const ok = won(g) === want && (!want || (g.winBy && g.winBy.kind === 'combo')) && (!more || more(g)); check(name, ok, won(g) ? g.comboWin : 'no win'); return g; };
check('the test cards are in the set database', !missing.length, missing.join(', '));

// ---- sacrifice loops ----
sc('Gravecrawler + Phyrexian Altar + Blood Artist with another Zombie: win', g => { put(g, 'Gravecrawler'); put(g, 'Phyrexian Altar'); put(g, 'Blood Artist'); put(g, 'Walking Corpse'); }, true);
sc('...without another Zombie Gravecrawler cannot be cast again', g => { put(g, 'Gravecrawler'); put(g, 'Phyrexian Altar'); put(g, 'Blood Artist'); }, false);
sc('...without a card that drains it is a loop, not a win', g => { put(g, 'Gravecrawler'); put(g, 'Phyrexian Altar'); put(g, 'Walking Corpse'); }, false);
sc('Gravecrawler + Ashnod\'s Altar is no loop (colorless mana does not pay {B})', g => { put(g, 'Gravecrawler'); put(g, 'Ashnod\'s Altar'); put(g, 'Blood Artist'); put(g, 'Walking Corpse'); }, false);
sc('Gravecrawler + Warren Soultrader + Zulaport Cutthroat: win (the Soultrader is the Zombie)', g => { put(g, 'Gravecrawler'); put(g, 'Warren Soultrader'); put(g, 'Zulaport Cutthroat'); }, true);
sc('Gravecrawler + Pitiless Plunderer + Viscera Seer + Blood Artist + a Zombie: win', g => { put(g, 'Gravecrawler'); put(g, 'Pitiless Plunderer'); put(g, 'Viscera Seer'); put(g, 'Blood Artist'); put(g, 'Walking Corpse'); }, true);
sc('Reassembling Skeleton + Phyrexian Altar alone is one mana short', g => { put(g, 'Reassembling Skeleton'); put(g, 'Phyrexian Altar'); put(g, 'Blood Artist'); }, false);
sc('Reassembling Skeleton + Pitiless Plunderer + Phyrexian Altar + Blood Artist: win', g => { put(g, 'Reassembling Skeleton'); put(g, 'Pitiless Plunderer'); put(g, 'Phyrexian Altar'); put(g, 'Blood Artist'); }, true);
sc('Reassembling Skeleton + Pitiless Plunderer + Ashnod\'s Altar + Zulaport Cutthroat: win', g => { put(g, 'Reassembling Skeleton'); put(g, 'Pitiless Plunderer'); put(g, 'Ashnod\'s Altar'); put(g, 'Zulaport Cutthroat'); }, true);
sc('Reassembling Skeleton + Pitiless Plunderer + Viscera Seer is one Treasure short', g => { put(g, 'Reassembling Skeleton'); put(g, 'Pitiless Plunderer'); put(g, 'Viscera Seer'); put(g, 'Blood Artist'); }, false);
sc('...Teysa Karlov doubles the Treasure: win', g => { put(g, 'Reassembling Skeleton'); put(g, 'Pitiless Plunderer'); put(g, 'Viscera Seer'); put(g, 'Blood Artist'); put(g, 'Teysa Karlov'); }, true);
sc('Reassembling Skeleton + Sifter of Skulls + Phyrexian Altar + Blood Artist: win', g => { put(g, 'Reassembling Skeleton'); put(g, 'Sifter of Skulls'); put(g, 'Phyrexian Altar'); put(g, 'Blood Artist'); }, true);
sc('Grizzly Bears with an altar and Blood Artist is nothing', g => { put(g, 'Grizzly Bears'); put(g, 'Phyrexian Altar'); put(g, 'Blood Artist'); }, false);
sc('Kitchen Finks + Viscera Seer + Heliod + Blood Artist: win', g => { put(g, 'Kitchen Finks'); put(g, 'Viscera Seer'); put(g, 'Heliod, Sun-Crowned'); put(g, 'Blood Artist'); }, true);
sc('Kitchen Finks + Viscera Seer + Blood Artist without the counter: no win', g => { put(g, 'Kitchen Finks'); put(g, 'Viscera Seer'); put(g, 'Blood Artist'); }, false);
sc('Archangel of Thune + Walking Ballista with lifelink: win', g => { put(g, 'Archangel of Thune'); const b = put(g, 'Walking Ballista'); b.counters = 1; b.eotKw = new Set(['lifelink']); }, true);
sc('Archangel of Thune + Walking Ballista without lifelink: no win', g => { put(g, 'Archangel of Thune'); put(g, 'Walking Ballista').counters = 2; }, false);

// ---- Underworld Breach ----
const five = g => { for (let i = 0; i < 5; i++) yard(g, 'Grizzly Bears'); };
sc('Underworld Breach + Lion\'s Eye Diamond + Brain Freeze with cards in the graveyard: win', g => { put(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Brain Freeze'); five(g); }, true);
sc('...Breach cast from hand this turn: win, and it is paid for', g => { lands(g, 2, 'Mountain'); hand(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Brain Freeze'); five(g); }, true, g => g.battlefield.some(p => p.card.name === 'Underworld Breach') && g.battlefield.filter(p => p.asLand && p.tapped).length === 2);
sc('...Breach in hand with no mana: no win', g => { hand(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Brain Freeze'); five(g); }, false);
sc('...an empty graveyard has nothing to exile', g => { put(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Brain Freeze'); }, false);
sc('Underworld Breach + Lotus Petal + Brain Freeze with a full graveyard and two mana: win', g => { lands(g, 2, 'Island'); put(g, 'Underworld Breach'); put(g, 'Lotus Petal'); hand(g, 'Brain Freeze'); for (let i = 0; i < 8; i++) yard(g, 'Grizzly Bears'); }, true);
sc('Underworld Breach + Brain Freeze with no rock: no win', g => { lands(g, 2, 'Island'); put(g, 'Underworld Breach'); hand(g, 'Brain Freeze'); five(g); }, false);
sc('Underworld Breach + Lion\'s Eye Diamond + Wheel of Fortune with Thassa\'s Oracle in the library, the Wheel paid for and three other cards to exile: win', g => { lands(g, 3, 'Mountain'); put(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Wheel of Fortune'); lib(g, 'Thassa\'s Oracle'); five(g); }, true);
sc('...T-140: with no mana for the Wheel (and nothing to exile) it is not a win', g => { put(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Wheel of Fortune'); lib(g, 'Thassa\'s Oracle'); }, false);
sc('...T-140: Breach in hand, only one land for it: no win (nothing was cast)', g => { lands(g, 1, 'Mountain'); hand(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Wheel of Fortune'); lib(g, 'Thassa\'s Oracle'); five(g); }, false);
sc('...with nothing to find: no win', g => { put(g, 'Underworld Breach'); put(g, 'Lion\'s Eye Diamond'); hand(g, 'Wheel of Fortune'); }, false);

// ---- Peer into the Abyss ----
sc('Peer into the Abyss with Nekusar out and seven mana: win', g => { lands(g, 7, 'Swamp'); put(g, 'Nekusar, the Mindrazer'); hand(g, 'Peer into the Abyss'); }, true, g => g.hand.length === 0 && g.graveyard.some(i => i.card.name === 'Peer into the Abyss'));
sc('...with Underworld Dreams too', g => { lands(g, 7, 'Swamp'); put(g, 'Underworld Dreams'); hand(g, 'Peer into the Abyss'); }, true);
sc('...six mana is not enough', g => { lands(g, 6, 'Swamp'); put(g, 'Nekusar, the Mindrazer'); hand(g, 'Peer into the Abyss'); }, false, g => g.hand.length === 1);
sc('...and alone it is no win', g => { lands(g, 7, 'Swamp'); hand(g, 'Peer into the Abyss'); }, false);
sc('Peer into the Abyss with Psychosis Crawler and 80 cards in the library: win', g => { lands(g, 7, 'Swamp'); put(g, 'Psychosis Crawler'); hand(g, 'Peer into the Abyss'); while (g.library.length < 80) lib(g, 'Swamp'); }, true);
sc('...with 40 cards in the library it is 20 life short', g => { lands(g, 7, 'Swamp'); put(g, 'Psychosis Crawler'); hand(g, 'Peer into the Abyss'); }, false);
{ const g = fresh(); lands(g, 7, 'Swamp'); hand(g, 'Peer into the Abyss'); lib(g, 'Nekusar, the Mindrazer'); G.castPhase(g);
  check('the autopilot keeps Peer into the Abyss while its punisher is still to come', g.hand.some(i => i.card.name === 'Peer into the Abyss')); }

// ---- Aetherflux Reservoir, Sensei's Divining Top ----
sc('Aetherflux Reservoir + Exquisite Blood at 51 life: win', g => { put(g, 'Aetherflux Reservoir'); put(g, 'Exquisite Blood'); g.life = 51; }, true);
sc('...at 50 life the payment would kill you', g => { put(g, 'Aetherflux Reservoir'); put(g, 'Exquisite Blood'); g.life = 50; g.opts = Object.assign({}, g.opts, { oppLife: 400 }); }, false);
sc('Sensei\'s Divining Top + Bolas\'s Citadel + Aetherflux Reservoir: win', g => { put(g, 'Sensei\'s Divining Top'); put(g, 'Bolas\'s Citadel'); put(g, 'Aetherflux Reservoir'); g.life = 30; }, true);
sc('...Top and Citadel without the Reservoir: no win', g => { put(g, 'Sensei\'s Divining Top'); put(g, 'Bolas\'s Citadel'); g.life = 30; }, false);
sc('Sensei\'s Divining Top + Mystic Forge + Glaring Fleshraker with one mana: win', g => { lands(g, 1, 'Island'); put(g, 'Sensei\'s Divining Top'); put(g, 'Mystic Forge'); put(g, 'Glaring Fleshraker'); }, true);
sc('Sensei\'s Divining Top + Mystic Forge + Cloud Key with Thassa\'s Oracle in the library and {U}{U} to cast it: win', g => { lands(g, 2, 'Island'); put(g, 'Sensei\'s Divining Top'); put(g, 'Mystic Forge'); put(g, 'Cloud Key'); lib(g, 'Thassa\'s Oracle'); }, true);
sc('...T-140: with a Walking Ballista found and no mana to cast it for anything, it is not a win', g => { put(g, 'Sensei\'s Divining Top'); put(g, 'Mystic Forge'); put(g, 'Cloud Key'); lib(g, 'Walking Ballista'); }, false);
sc('...with nothing to find it only draws', g => { put(g, 'Sensei\'s Divining Top'); put(g, 'Mystic Forge'); put(g, 'Cloud Key'); }, false);
sc('Sensei\'s Divining Top + Mystic Forge alone: no win', g => { lands(g, 3, 'Island'); put(g, 'Sensei\'s Divining Top'); put(g, 'Mystic Forge'); lib(g, 'Walking Ballista'); }, false);

// ---- Hermit Druid, Ad Nauseam ----
sc('Hermit Druid with no basic land left and Thassa\'s Oracle in hand: win', g => { g.library = []; for (let i = 0; i < 30; i++) lib(g, 'Grizzly Bears'); lands(g, 3, 'Forest'); put(g, 'Hermit Druid'); hand(g, 'Thassa\'s Oracle'); g.battlefield.filter(p => p.asLand).forEach(p => { p.produce = { colors: new Set(['G', 'U']), amount: 1 }; }); }, true, g => g.library.length === 0);
sc('...with basic lands in the library it only finds one', g => { lands(g, 3, 'Forest'); put(g, 'Hermit Druid'); hand(g, 'Thassa\'s Oracle'); g.battlefield.filter(p => p.asLand).forEach(p => { p.produce = { colors: new Set(['G', 'U']), amount: 1 }; }); }, false);
sc('...a Hermit Druid that just arrived cannot tap', g => { g.library = []; for (let i = 0; i < 30; i++) lib(g, 'Grizzly Bears'); lands(g, 3, 'Forest'); put(g, 'Hermit Druid').sick = true; hand(g, 'Thassa\'s Oracle'); g.battlefield.filter(p => p.asLand).forEach(p => { p.produce = { colors: new Set(['G', 'U']), amount: 1 }; }); }, false);
sc('Ad Nauseam + Angel\'s Grace with Laboratory Maniac in the library and six mana: win', g => { lands(g, 5, 'Swamp'); lands(g, 1, 'Plains'); hand(g, 'Ad Nauseam'); hand(g, 'Angel\'s Grace'); lib(g, 'Laboratory Maniac'); }, true);
sc('...five mana is one short, and both stay in hand', g => { lands(g, 5, 'Swamp'); hand(g, 'Ad Nauseam'); hand(g, 'Angel\'s Grace'); lib(g, 'Laboratory Maniac'); }, false, g => g.hand.length === 2);

// ---- combat after combat ----
sc('Aggravated Assault + Savage Ventmaw ready to attack: win', g => { put(g, 'Aggravated Assault'); put(g, 'Savage Ventmaw'); }, true);
sc('...a Ventmaw that just arrived cannot attack', g => { put(g, 'Aggravated Assault'); put(g, 'Savage Ventmaw').sick = true; }, false);
sc('Aggravated Assault + Old Gnawbone ready to attack: win', g => { put(g, 'Aggravated Assault'); put(g, 'Old Gnawbone'); }, true);
sc('Aggravated Assault + Grizzly Bears: no win', g => { put(g, 'Aggravated Assault'); put(g, 'Grizzly Bears'); }, false);
const wubrg = g => { ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].forEach(n => lands(g, 1, n)); };
sc('Najeela + Derevi with WUBRG and one more land: win', g => { wubrg(g); lands(g, 1, 'Forest'); put(g, 'Najeela, the Blade-Blossom'); put(g, 'Derevi, Empyrial Tactician'); }, true);
sc('...with exactly five lands and another attacker: win', g => { wubrg(g); put(g, 'Najeela, the Blade-Blossom'); const d = put(g, 'Derevi, Empyrial Tactician'); d.sick = true; put(g, 'Grizzly Bears'); }, true);
sc('...five lands and no other attacker is one untap short', g => { wubrg(g); put(g, 'Najeela, the Blade-Blossom'); put(g, 'Derevi, Empyrial Tactician').sick = true; }, false);
sc('Najeela alone: no win', g => { wubrg(g); lands(g, 2, 'Forest'); put(g, 'Najeela, the Blade-Blossom'); }, false);

// ---- Goblins ----
sc('Conspicuous Snoop with Kiki-Jiki on top of the library: win', g => { put(g, 'Conspicuous Snoop'); lib(g, 'Kiki-Jiki, Mirror Breaker', true); }, true);
sc('...Kiki-Jiki deeper in the library does nothing', g => { put(g, 'Conspicuous Snoop'); lib(g, 'Kiki-Jiki, Mirror Breaker'); }, false);
sc('...Goblin Recruiter puts Kiki-Jiki on top: win', g => { lands(g, 2, 'Mountain'); put(g, 'Conspicuous Snoop'); lib(g, 'Kiki-Jiki, Mirror Breaker'); hand(g, 'Goblin Recruiter'); }, true, g => g.library[0].card.name === 'Kiki-Jiki, Mirror Breaker' && g.battlefield.some(p => p.card.name === 'Goblin Recruiter'));
sc('...a Snoop that just arrived cannot tap', g => { put(g, 'Conspicuous Snoop').sick = true; lib(g, 'Kiki-Jiki, Mirror Breaker', true); }, false);
sc('Krenko (commander) + Skirk Prospector + Goblin Warchief with six Goblins: win', g => { put(g, 'Krenko, Mob Boss'); put(g, 'Skirk Prospector'); put(g, 'Goblin Warchief'); for (let i = 0; i < 3; i++) put(g, 'Goblin Piker'); }, true);
sc('...with three Goblins the loop does not grow fast enough yet', g => { put(g, 'Krenko, Mob Boss'); put(g, 'Skirk Prospector'); put(g, 'Goblin Warchief'); }, false);
sc('...without haste Krenko cannot tap again', g => { put(g, 'Krenko, Mob Boss'); put(g, 'Skirk Prospector'); for (let i = 0; i < 4; i++) put(g, 'Goblin Piker'); }, false);

// ---- Ulalek, Vraska ----
sc('Ulalek + Echoes of Eternity + Glaring Fleshraker, casting an Eldrazi with {C}{C} to spare: win', g => { lands(g, 7, 'Wastes'); put(g, 'Ulalek, Fused Atrocity'); put(g, 'Echoes of Eternity'); put(g, 'Glaring Fleshraker'); hand(g, 'Eldrazi Devastator'); }, true);
sc('...without the two extra mana Ulalek copies nothing', g => { lands(g, 5, 'Wastes'); put(g, 'Ulalek, Fused Atrocity'); put(g, 'Echoes of Eternity'); put(g, 'Glaring Fleshraker'); hand(g, 'Eldrazi Devastator'); }, false);
{ const g = fresh(); lands(g, 7, 'Wastes'); put(g, 'Ulalek, Fused Atrocity'); put(g, 'Echoes of Eternity'); put(g, 'Kozilek\'s Unsealing'); hand(g, 'Eldrazi Devastator'); const ev = run(g);
  check('Ulalek + Echoes of Eternity + Kozilek\'s Unsealing: infinite mana, no win without an outlet', !won(g) && !!G.infiniteMana(g) && ev.some(e => /no way to win/.test(e.text || '')), (G.infiniteMana(g) || {}).how);
  hand(g, 'Walking Ballista'); run(g); check('...and a win with Walking Ballista', won(g), g.comboWin); }
sc('Vraska, Betrayal\'s Sting cast beside Vorinclex: win', g => { lands(g, 6, 'Swamp'); put(g, 'Vorinclex, Monstrous Raider'); hand(g, 'Vraska, Betrayal\'s Sting'); }, true);
sc('...Vraska alone: no win', g => { lands(g, 6, 'Swamp'); hand(g, 'Vraska, Betrayal\'s Sting'); }, false);

// ---- more infinite mana ----
const inf = (name, setup, want) => { const g = fresh(); setup(g); const r = G.infiniteMana(g); check(name, !!r === want, r ? r.how : 'none'); return g; };
inf('Basalt Monolith + Forsaken Monument is infinite mana', g => { put(g, 'Basalt Monolith'); put(g, 'Forsaken Monument'); }, true);
inf('Grim Monolith + Forsaken Monument is not (4 to untap, 4 made)', g => { put(g, 'Grim Monolith'); put(g, 'Forsaken Monument'); }, false);
inf('Grim Monolith + Forsaken Monument + Rings of Brighthearth is infinite mana only with the 6 to start the loop ({4} untap + {2} copy; the Monolith makes 4)', g => { put(g, 'Grim Monolith'); put(g, 'Forsaken Monument'); put(g, 'Rings of Brighthearth'); }, false);
inf('...with two more lands to pay it', g => { put(g, 'Grim Monolith'); put(g, 'Forsaken Monument'); put(g, 'Rings of Brighthearth'); lands(g, 2, 'Mountain'); }, true);
inf('Basalt Monolith + Nyxbloom Ancient is infinite mana', g => { put(g, 'Basalt Monolith'); put(g, 'Nyxbloom Ancient'); }, true);
inf('Grim Monolith + Nyxbloom Ancient too', g => { put(g, 'Grim Monolith'); put(g, 'Nyxbloom Ancient'); }, true);
inf('Voltaic Key + Rings of Brighthearth + Thran Dynamo is not (3 made, 3 paid)', g => { put(g, 'Voltaic Key'); put(g, 'Rings of Brighthearth'); put(g, 'Thran Dynamo'); }, false);
inf('...with Forsaken Monument it is', g => { put(g, 'Voltaic Key'); put(g, 'Rings of Brighthearth'); put(g, 'Thran Dynamo'); put(g, 'Forsaken Monument'); }, true);
inf('Lithoform Engine + Tezzeret the Seeker + Thran Dynamo is infinite mana', g => { put(g, 'Lithoform Engine'); put(g, 'Tezzeret the Seeker'); put(g, 'Thran Dynamo'); }, true);
inf('...with only a Sol Ring it is not', g => { put(g, 'Lithoform Engine'); put(g, 'Tezzeret the Seeker'); put(g, 'Sol Ring'); }, false);
inf('Tidespout Tyrant + Sol Ring + Lotus Petal is infinite mana', g => { put(g, 'Tidespout Tyrant'); put(g, 'Sol Ring'); put(g, 'Lotus Petal'); }, true);
inf('Hullbreaker Horror + Sol Ring + a Lotus Petal in hand too', g => { put(g, 'Hullbreaker Horror'); put(g, 'Sol Ring'); hand(g, 'Lotus Petal'); }, true);
inf('Tidespout Tyrant + Sol Ring alone is not', g => { put(g, 'Tidespout Tyrant'); put(g, 'Sol Ring'); }, false);
inf('Tidespout Tyrant + Arcane Signet + Lotus Petal is not (the Signet costs more than it makes)', g => { put(g, 'Tidespout Tyrant'); put(g, 'Arcane Signet'); put(g, 'Lotus Petal'); }, false);

// ---- outlets: a cast trigger with a loop that casts ----
sc('Isochron Scepter + Dramatic Reversal with Vivi Ornitier: every cast deals damage, win', g => { lands(g, 2, 'Island'); put(g, 'Sol Ring'); put(g, 'Arcane Signet'); put(g, 'Isochron Scepter').imprinted = { iid: 999, card: by('Dramatic Reversal') }; put(g, 'Vivi Ornitier'); }, true);
sc('Tidespout Tyrant + Sol Ring + Lotus Petal with Vivi Ornitier: win', g => { put(g, 'Tidespout Tyrant'); put(g, 'Sol Ring'); put(g, 'Lotus Petal'); put(g, 'Vivi Ornitier'); }, true);
sc('Basalt Monolith + Forsaken Monument with Vivi Ornitier: no spell is cast, no win', g => { put(g, 'Basalt Monolith'); put(g, 'Forsaken Monument'); put(g, 'Vivi Ornitier'); }, false);

// ---- Approach of the Second Sun: once cast, a tutor finds it again ----
{ const g = fresh(); lands(g, 7, 'Plains'); lib(g, 'Approach of the Second Sun'); lib(g, 'Sol Ring'); lib(g, 'Walking Ballista');
  const t0 = G.bestTutorTarget(g, { filters: [] }).inst.card.name; g.winSpellCasts = 1; const t1 = G.bestTutorTarget(g, { filters: [] }).inst.card.name;
  check('a tutor fetches Approach of the Second Sun once it has been cast', t1 === 'Approach of the Second Sun', `before: ${t0}, after: ${t1}`); }

// ---- the Build tab's list ----
const ids = names => G.deckCombos(mkDeck(names.concat(BASICS))).map(c => c.id + (c.open ? ' (open)' : ''));
const lists = (name, names, want) => { const got = ids(names); check(name, want.every(w => got.includes(w)) && got.length === want.length, got.join(' | ')); };
lists('Gravecrawler, Phyrexian Altar, Blood Artist: the sacrifice loop', ['Gravecrawler', 'Phyrexian Altar', 'Blood Artist'], ['recur+sacPays+deathDrain']);
lists('Underworld Breach, Brain Freeze, Lotus Petal: Breach storm', ['Underworld Breach', 'Brain Freeze', 'Lotus Petal'], ['breach+stormMill+ritualRock']);
lists('Peer into the Abyss + Nekusar', ['Peer into the Abyss', 'Nekusar, the Mindrazer'], ['peer+drawPunish']);
lists('Approach of the Second Sun + Mystical Tutor', ['Approach of the Second Sun', 'Mystical Tutor'], ['approach+anyTutor']);
lists('Aggravated Assault + Savage Ventmaw', ['Aggravated Assault', 'Savage Ventmaw'], ['assault+combatMana']);
lists('Vraska + Vorinclex', ['Vraska, Betrayal\'s Sting', 'Vorinclex, Monstrous Raider'], ['poisonNine+counterTwice']);
lists('Basalt Monolith + Forsaken Monument with no outlet is listed as open', ['Basalt Monolith', 'Forsaken Monument'], ['rock+enabler+outlet (open)']);
lists('Tidespout Tyrant + Sol Ring + Lotus Petal with no outlet is listed as open', ['Tidespout Tyrant', 'Sol Ring', 'Lotus Petal'], ['bouncer+plusRock+freeRock+outlet (open)']);
lists('Isochron Scepter + Dramatic Reversal + Vivi: Scepter storm', ['Isochron Scepter', 'Dramatic Reversal', 'Vivi Ornitier'], ['scepter+untapAll+castPing']);
check('Hermit Druid + Thassa\'s Oracle is listed only in a list with no basic land', G.deckCombos(mkDeck(['Hermit Druid', 'Thassa\'s Oracle', 'Grizzly Bears'])).some(c => c.id === 'hermit+emptyWinner') && !ids(['Hermit Druid', 'Thassa\'s Oracle']).includes('hermit+emptyWinner'));
lists('a Demonic Tutor, a Sol Ring and Grizzly Bears are no combo', ['Demonic Tutor', 'Sol Ring', 'Grizzly Bears', 'Viscera Seer', 'Blood Artist'], []);

// ---- whole games with every piece in one deck: nothing throws ----
{ const cards = all.map(c => Object.assign({}, c, { commander: c.name === 'Krenko, Mob Boss', qty: BASICS.includes(c.name) ? 8 : 1 }));
  const r = G.monteCarlo(cards, Object.assign({}, O, { turns: 10 }), 300, 7);
  const total = Object.values(r.winBy).reduce((s, v) => s + v, 0), killed = r.kill.slice(0, r.turns).reduce((s, v) => s + v, 0);
  check('300 games with every combo piece in one deck run without an error', r.errors === 0, r.firstError);
  check('the shares of the ways to win add up to the games won', Math.abs(total - killed) < 1e-9, `${total} vs ${killed}`); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
