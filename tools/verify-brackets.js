#!/usr/bin/env node
// Checks the Commander bracket of every built-in deck with ICEYfish's own engine (task T-035, report in docs/agents/DECK-BRACKETS.md).
//   node tools/verify-brackets.js [--games=20000] [--jobs=4] [--only=death-tax]    simulate, write docs/agents/deck-brackets.json
//   node tools/verify-brackets.js --goldfish-only                                  the goldfish games and the card floor only, no round robin 
//   node tools/verify-brackets.js --matches-only                                   the round robin only (no longer used: there is no internal ranking for now, the user 2026-11-26), added to the goldfish results already in docs/agents/deck-brackets.json
//   node tools/verify-brackets.js --apply                                         write the verified bracket and a check line into each deck
//   node tools/verify-brackets.js --report                                        the table in docs/agents/DECK-BRACKETS.md
// Offline: the cards come from the set data (goldfish/static/data/sets), the combos from data/combos.json.
//
// For each deck:
//  1. Goldfish: --games games with the app's default options for its format (Simulate tab: 10 turns, keep 7 with 2-5 lands, first
//     mulligan free, on the draw, commander first, opponent at 40; the deck's learned Policy-lab choices; the Commander Spellbook combos
//     the goldfish counts). Kill-turn distribution, commander turn, mana by turn 4.
//  2. Matches: a round robin of every Commander deck against every other (the fixed field: all other built-in Commander decks, each with its
//     own learned choices and combos), ceil(games / 41) matches per pair, seats alternating, up to 25 turns (the Duel tab's default).
//     A deck without a commander plays its own mirror.
//  3. The bracket, by the rules in RULES below, applied the same way to every deck.
const fs = require('fs'), path = require('path'), os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const ROOT = path.join(__dirname, '..'), STATIC = path.join(ROOT, 'goldfish', 'static'), DECKS = path.join(STATIC, 'decks');
const OUT = path.join(ROOT, 'docs', 'agents', 'deck-brackets.json');

// ---------------------------------------------------------------------------------------------------------------------------------
// RULES: the official Commander Brackets (beta), as Wizards of the Coast wrote them, and the speed thresholds. Written once, used for all.
// Sources: "Introducing Commander Brackets Beta" (2025-02-11), "Commander Brackets Beta Update" 2025-10-21 and 2026-02-09, all at
// https://magic.wizards.com/en/news/announcements/ . Game Changers: Scryfall "is:gamechanger", fetched 2026-11-23 (53 cards; it
// matches the 2025-10-21 list plus Farewell and Biorhythm, added 2026-02-09).
const GAME_CHANGERS = ["Ad Nauseam", "Ancient Tomb", "Aura Shards", "Biorhythm", "Bolas's Citadel", "Braids, Cabal Minion", "Chrome Mox",
  "Coalition Victory", "Consecrated Sphinx", "Crop Rotation", "Cyclonic Rift", "Demonic Tutor", "Drannith Magistrate", "Enlightened Tutor",
  "Farewell", "Field of the Dead", "Fierce Guardianship", "Force of Will", "Gaea's Cradle", "Gamble", "Gifts Ungiven", "Glacial Chasm",
  "Grand Arbiter Augustin IV", "Grim Monolith", "Humility", "Imperial Seal", "Intuition", "Jeska's Will", "Lion's Eye Diamond", "Mana Vault",
  "Mishra's Workshop", "Mox Diamond", "Mystical Tutor", "Narset, Parter of Veils", "Natural Order", "Necropotence", "Notion Thief",
  "Opposition Agent", "Orcish Bowmasters", "Panoptic Mirror", "Rhystic Study", "Seedborn Muse", "Serra's Sanctum", "Smothering Tithe",
  "Survival of the Fittest", "Teferi's Protection", "Tergrid, God of Fright", "Thassa's Oracle", "The One Ring", "The Tabernacle at Pendrell Vale",
  "Underworld Breach", "Vampiric Tutor", "Worldly Tutor"];
// Mass land denial ("cards that regularly destroy, exile, and bounce other lands, keep lands tapped, or change what mana is produced by four
// or more lands per player without replacing them"): these names, plus Oracle text that destroys/exiles/bounces all lands.
const MLD_NAMES = ['Armageddon', 'Ravages of War', 'Catastrophe', 'Jokulhaups', 'Obliterate', 'Decree of Annihilation', 'Sunder', 'Devastation',
  'Boom // Bust', 'Ruination', 'Wildfire', 'Destructive Force', 'Burning of Xinye', 'Impending Disaster', 'Worldfire', 'Apocalypse',
  'Global Ruin', 'Epicenter', 'Thoughts of Ruin', 'Tsunami', 'Flashfires', 'Acid Rain', 'Boil', 'Winter Orb', 'Static Orb', 'Rising Waters',
  'Hokori, Dust Drinker', 'Back to Basics', 'Blood Moon', 'Magus of the Moon', 'Contamination', 'Infernal Darkness', 'Hall of Gemstone',
  'Stasis', 'Mana Breach', 'Armageddon Clock', 'Cataclysm', 'Keldon Firebombers', 'Numot, the Devastator', 'Avalanche Riders',
  'Myojin of Infinite Rage', 'Bearer of the Heavens', 'Mana Vortex', 'Aura of Silence', 'Tectonic Break', 'Death Cloud', 'Smallpox',
  'Desolation Angel', 'Ruinous Ultimatum', 'Jokulmorder', 'Winter Moon', 'Rishadan Brigand', 'Sire of Ruin', 'Temporal Distortion'];
const MLD_TEXT = /(destroy|exile|return) all (nonbasic )?lands|each player sacrifices (all|that many|\w+) lands|lands don't untap|lands? (can't|doesn't) untap/i;
// The thresholds. A rule a deck breaks sets the lowest bracket it can be in ("floor"); the simulated speed sets another; the verified
// bracket is the higher of the two. The card rules never go above B4: only the speed can say B5.
const RULES = {
  // card rules (the "Deck building" lines of each bracket)
  gameChangersMax: { 1: 0, 2: 0, 3: 3 },                 // B1, B2: none; B3: up to three; B4, B5: no limit
  massLandDenial: 4,                                     // B1-B3: "No mass land denial"
  extraTurnsChain: 3,                                    // B1: no extra-turn cards. B2, B3: "low quantities ... not intended to be chained in
                                                         //   succession or looped". The engine can't see intent: 3+ extra-turn cards count as a chain (B4).
  twoCardCombo: 3,                                       // B1, B2: "No intentional two-card infinite combos" -> at least B3
  earlyTwoCardCombo: 4,                                  // B3: "no two-card infinite combos that can happen cheaply and in about the first six or so
                                                         //   turns": a two-card infinite combo whose two cards cost 6 mana or less in all -> B4
  cheapComboMv: 6,
  // a "two-card infinite combo": a Commander Spellbook combo of exactly two cards, with nothing else needed (its "needs" list is empty),
  // that wins or ends the game by itself: ENDS below (infinite death triggers with no payoff do not count; infinite hasty creature tokens do,
  // added 2026-11-24 for Dualcaster Mage + Twinflame)
  // speed ("Setting Bracket Expectations and Turns Played", 2025-10-21: "expect to be able to play at least nine / eight / six / four
  // turns before you win or lose"; B5: "could end on any turn"). Read as: in the median goldfish game the deck has not won before turn
  // N. Median kill turn (games not won by turn 10 count as later than 10):
  speed: require(path.join(STATIC, 'tune.js')).SPEED,  // median < 4 -> B5, < 6 -> B4, < 8 -> B3, < 9 -> B2, otherwise B1. The one copy is in
                                                         //   goldfish/static/tune.js, so the Policy lab's bracket-speed goal uses the same numbers
};
const ENDS = { test: f => /win the game|loses the game/i.test(f) || (/^(near-)?infinite/i.test(f) && /mana|damage|lifeloss|mill|combat|turns|tokens with haste/i.test(f) && !/self-mill|damage to (all )?creatures|until end of turn/i.test(f)) };
const BRACKET_NAME = { 1: 'Exhibition', 2: 'Core', 3: 'Upgraded', 4: 'Optimized', 5: 'cEDH' };
// ---------------------------------------------------------------------------------------------------------------------------------

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const GAMES = +arg('games', 20000), JOBS = +arg('jobs', os.cpus().length), ONLY = arg('only', ''), SEED = 20261123;
const GF_ONLY = process.argv.includes('--goldfish-only'), MATCH_ONLY = process.argv.includes('--matches-only'), CHUNK = 2500, MATCH_TURNS = 25;

function loadAll() {
  const G = require(path.join(STATIC, 'sim.js')), Source = require(path.join(STATIC, 'source.js')), Combos = require(path.join(STATIC, 'combos.js'));
  const D = path.join(STATIC, 'data', 'sets'), idx = JSON.parse(fs.readFileSync(path.join(D, 'index.json'), 'utf8')), byName = new Map();
  idx.sets.forEach(s => { for (const c of JSON.parse(fs.readFileSync(path.join(D, (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s.code) ? s.code + '_' : s.code) + '.json'), 'utf8')).cards) if (!c.ref) { byName.set(c.name, c); const f = c.name.split(' // ')[0]; if (!byName.has(f)) byName.set(f, c); } });
  const db = JSON.parse(fs.readFileSync(path.join(STATIC, 'data', 'combos.json'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(DECKS, 'index.json'), 'utf8')).decks;
  const decks = index.map(d => {
    const text = fs.readFileSync(path.join(DECKS, d.file), 'utf8'), cards = [];
    for (const e of Source.parseDecklist(text)) {
      const c = byName.get(e.name) || byName.get(e.name.split(' // ')[0]); if (!c) throw new Error(d.file + ': not in the set data: ' + e.name);
      const hit = cards.find(x => x.name === c.name); if (hit) { hit.qty += e.qty; hit.commander = hit.commander || e.commander; } else cards.push(Object.assign({}, c, { qty: e.qty, commander: e.commander }));
    }
    if (!cards.some(c => c.commander)) for (const n of d.commanders || []) { const c = cards.find(x => x.name === n || x.name.split(' // ')[0] === n); if (c) c.commander = true; }
    const cmdr = cards.some(c => c.commander), deck = G.buildDeck(cards, [], d.policy && d.policy.tribe);
    const id = cmdr ? [...new Set(cards.filter(c => c.commander).flatMap(c => c.color_identity || []))] : null;
    const found = Combos.find(db, deck.unique.map(c => c.name), id), bookCombos = Combos.goldfished(found, G.deckCombos(deck));
    const opts = { turns: 10, onPlay: false, minLands: 2, maxLands: cmdr ? 5 : 4, freeMulligan: cmdr, minHandSize: 5, oppLife: cmdr ? 40 : 20,
      prioritizeCommander: true, idealLandRatio: cmdr ? 0.42 : 0.4, policy: d.policy || {}, bookCombos };
    return { d, text, cards, cmdr, deck, found, opts };
  });
  return { G, decks };
}

// ---------- worker: one job at a time ----------
if (!isMainThread) {
  const { G, decks } = loadAll();
  parentPort.on('message', job => {
    let out;
    if (job.kind === 'goldfish') {
      const L = decks[job.i], r = G.monteCarlo(L.cards, Object.assign({}, L.opts, { n: job.n }), job.n, job.seed, null, []);
      out = { n: job.n, errors: r.errors, firstError: r.firstError, kill: r.kill, cmdr: r.cmdr, mana4: r.agg.manaAvail[3].mean, winBy: r.winBy, winLines: r.winLines };
    } else {
      const A = decks[job.i], B = decks[job.j], o = Object.assign({}, A.opts, { turns: MATCH_TURNS }), oB = Object.assign({}, B.opts, { turns: MATCH_TURNS });
      out = { n: job.n, a: 0, b: 0, none: 0, errors: 0, firstError: null };
      for (let k = 0; k < job.n; k++) {
        const s = (job.seed + k * 7919) >>> 0;
        try { const m = G.playMatch(A.deck, B.deck, o, s, k % 2 === 0, null, oB), w = m.match.winner; if (w === 0) out.a++; else if (w === 1) out.b++; else out.none++; }
        catch (e) { out.errors++; if (!out.firstError) out.firstError = String(e && e.stack || e).slice(0, 400); }
      }
    }
    parentPort.postMessage(Object.assign({ job }, out));
  });
  return;
}

// ---------- the card rules (no simulation needed) ----------
function cardRules(L) {
  const names = L.cards.map(c => c.name), front = n => n.split(' // ')[0];
  const gc = L.cards.filter(c => GAME_CHANGERS.some(g => g === c.name || front(g) === front(c.name))).map(c => c.name);
  const text = c => [c.oracle_text || ''].concat((c.faces || []).map(f => f.oracle_text || '')).join('\n');
  const mld = L.cards.filter(c => MLD_NAMES.includes(c.name) || MLD_TEXT.test(text(c))).map(c => c.name);
  const extra = L.cards.filter(c => /takes? (an|two|three|\w+) extra turns?|extra turn after this one/i.test(text(c))).map(c => c.name);
  const mv = n => { const c = L.cards.find(x => x.name === n || front(x.name) === front(n)); return c ? c.cmc || 0 : 99; };
  const two = L.found.included.filter(c => c.cards.length === 2 && !c.needs.length && c.does.some(f => ENDS.test(f)))
    .map(c => ({ cards: c.cards, mv: c.cards.reduce((s, n) => s + mv(n), 0), does: c.does.filter(f => ENDS.test(f)).slice(0, 2) }));
  const cheap = two.filter(c => c.mv <= RULES.cheapComboMv);
  let floor = 1; const why = [];
  const up = (b, w) => { if (b > floor) floor = b; why.push(w); };
  if (gc.length > RULES.gameChangersMax[3]) up(4, gc.length + ' Game Changers (B3 allows 3)'); else if (gc.length) up(3, gc.length + ' Game Changer' + (gc.length > 1 ? 's' : '') + ' (B1-B2 allow none)');
  if (mld.length) up(RULES.massLandDenial, 'mass land denial: ' + mld.join(', '));
  if (extra.length >= 3) up(RULES.extraTurnsChain, extra.length + ' extra-turn cards (a chain)'); else if (extra.length) up(2, extra.length + ' extra-turn card' + (extra.length > 1 ? 's' : ''));
  if (cheap.length) up(RULES.earlyTwoCardCombo, cheap.length + ' cheap two-card infinite combo' + (cheap.length > 1 ? 's' : '') + ' (e.g. ' + cheap[0].cards.join(' + ') + ', ' + cheap[0].mv + ' mana)');
  else if (two.length) up(RULES.twoCardCombo, two.length + ' two-card infinite combo' + (two.length > 1 ? 's' : '') + ' (all over ' + RULES.cheapComboMv + ' mana)');
  return { gameChangers: gc, mld, extraTurns: extra, twoCard: two.length, cheapTwoCard: cheap.slice(0, 5), floor, why, names: names.length };
}
function speedBracket(median) { for (const [t, b] of RULES.speed) if (median < t) return b; return 1; }
// median turn of a "by turn" distribution: share[t] = games ending on turn t+1, share[T] = not by turn T
function medianTurn(share) { let s = 0; for (let t = 0; t < share.length; t++) { s += share[t]; if (s >= 0.5) return t + 1; } return share.length; }
const pct = x => Math.round(1000 * x) / 10;

// the Drive claim (the [Bn] of the Drive file name, kept in drive-sync.json) is "stated"; the deck file's own bracket line is the verified one once checked
let DRIVE_CLAIMS = null;
function driveClaim(file) {
  if (!DRIVE_CLAIMS) { DRIVE_CLAIMS = {}; try { for (const r of Object.values(JSON.parse(fs.readFileSync(path.join(DECKS, 'drive-sync.json'), 'utf8')).files)) if (r.deck && r.bracket) DRIVE_CLAIMS[r.deck] = r.bracket; } catch (e) { /* no drive-sync: the deck file's bracket is the claim */ } }
  return DRIVE_CLAIMS[file] || null;
}
function verdict(L, gf, field) {
  const T = gf.kill.length - 1, cum = t => gf.kill.slice(0, t).reduce((a, b) => a + b, 0);
  const median = medianTurn(gf.kill), spd = L.cmdr ? speedBracket(median) : null, rules = cardRules(L);
  const verified = L.cmdr ? Math.max(rules.floor, spd) : null;
  return {
    file: L.d.file, name: L.d.name, stated: driveClaim(L.d.file) || L.d.bracket || null, verified, commander: L.cmdr,
    goldfish: { games: gf.n, errors: gf.errors, medianKill: median > T ? `>${T}` : median, by2: pct(cum(2)), by3: pct(cum(3)), by4: pct(cum(4)), by5: pct(cum(5)), by6: pct(cum(6)), by7: pct(cum(7)), by8: pct(cum(8)), byT: pct(cum(T)),
      earliestKill: (i => i < 0 || i >= T ? null : i + 1)(gf.kill.findIndex(x => x > 0)), killHist: gf.kill.map(x => Math.round(x * 100000) / 1000),          // earliest turn a game was won (null: none by T10); killHist: % of games won on turn 1..T, then % not won by T
      cmdrMedian: L.cmdr ? (medianTurn(gf.cmdr) > T ? `>${T}` : medianTurn(gf.cmdr)) : null, mana4: Math.round(gf.mana4 * 100) / 100,
      winBy: Object.fromEntries(Object.entries(gf.winBy).map(([k, v]) => [k, pct(v)])), topLine: (gf.winLines[0] || null) },
    field: field ? { games: field.n, wins: field.w, losses: field.l, none: field.none, errors: field.errors, winRate: pct(field.w / Math.max(1, field.n - field.errors)), opponents: field.opps } : null,
    rules: { gameChangers: rules.gameChangers, massLandDenial: rules.mld, extraTurns: rules.extraTurns, twoCardInfinite: rules.twoCard, cheapTwoCard: rules.cheapTwoCard, floor: rules.floor, why: rules.why },
    speedBracket: spd,
  };
}

function reason(v) {
  if (!v.commander) return 'not a Commander deck: brackets do not apply';
  const parts = [`speed says B${v.speedBracket} (median kill T${v.goldfish.medianKill})`, `card rules say at least B${v.rules.floor}${v.rules.why.length ? ' (' + v.rules.why.join('; ') + ')' : ''}`];
  return parts.join('; ');
}

async function simulate() {
  const t0 = Date.now(), { decks } = loadAll();
  const pick = decks.map((L, i) => i).filter(i => !ONLY || decks[i].d.file.includes(ONLY));
  const cmd = decks.map((L, i) => i).filter(i => decks[i].cmdr), perPair = Math.ceil(GAMES / Math.max(1, cmd.length - 1));
  const jobs = [];
  if (!MATCH_ONLY) for (const i of pick) for (let k = 0; k * CHUNK < GAMES; k++) { const n = Math.min(CHUNK, GAMES - k * CHUNK); jobs.push({ kind: 'goldfish', i, n, seed: (SEED + k * CHUNK * 7919) >>> 0 }); }
  if (!GF_ONLY) {
  for (let x = 0; x < cmd.length; x++) for (let y = x + 1; y < cmd.length; y++) if (pick.includes(cmd[x]) || pick.includes(cmd[y])) jobs.push({ kind: 'match', i: cmd[x], j: cmd[y], n: perPair, seed: (SEED + 1000003 * (x * 64 + y)) >>> 0 });
  for (const i of pick) if (!decks[i].cmdr) for (let k = 0; k * CHUNK < GAMES; k++) jobs.push({ kind: 'match', i, j: i, n: Math.min(CHUNK, GAMES - k * CHUNK), seed: (SEED + 77 + k * CHUNK * 7919) >>> 0 });
  }
  jobs.sort((a, b) => (b.kind === 'match' ? b.n * 2.5 : b.n) - (a.kind === 'match' ? a.n * 2.5 : a.n));
  const gf = new Map(), field = new Map(), total = jobs.length; let done = 0, next = 0;
  const addField = (i, w, l, none, errors, n, opp) => { const f = field.get(i) || { n: 0, w: 0, l: 0, none: 0, errors: 0, opps: new Set() }; f.n += n; f.w += w; f.l += l; f.none += none; f.errors += errors; f.opps.add(opp); field.set(i, f); };
  // Checkpoint: every finished job is appended to a file, so a run that is killed (this container is restarted while idle) resumes where it stopped.
  // The file is named by mode, games, engine version and seed; a different engine version starts afresh.
  const verNow = (fs.readFileSync(path.join(STATIC, 'version.js'), 'utf8').match(/ISF_VERSION\s*=\s*(\d+)/) || [])[1];
  const CK_DIR = process.env.ISF_CKPT_DIR || path.join(os.tmpdir(), 'isf-verify'), CK = path.join(CK_DIR, `${MATCH_ONLY ? 'match' : GF_ONLY ? 'gf' : 'full'}-${GAMES}-v${verNow}-s${SEED}${ONLY ? '-' + ONLY : ''}.jsonl`);
  fs.mkdirSync(CK_DIR, { recursive: true });
  const keyOf = j => [j.kind, decks[j.i].d.file, j.j != null ? decks[j.j].d.file : '', j.n, j.seed].join('|'), finished = new Set();
  const absorb = r => {
    const j = r.job;
    if (j.kind === 'goldfish') {
      const g = gf.get(j.i) || { n: 0, errors: 0, kill: null, cmdr: null, mana4: 0, winBy: {}, winLines: [] }, ok = r.n - r.errors;
      const mix = (a, b) => (a ? a.map((v, t) => v + b[t] * ok) : b.map(v => v * ok));
      g.kill = mix(g.kill, r.kill); g.cmdr = mix(g.cmdr, r.cmdr); g.mana4 += r.mana4 * r.n; g.n += r.n; g.errors += r.errors;
      for (const [k, v] of Object.entries(r.winBy)) g.winBy[k] = (g.winBy[k] || 0) + v * ok;
      if (!g.winLines.length) g.winLines = r.winLines;
      gf.set(j.i, g);
    } else if (j.i === j.j) addField(j.i, r.a + r.b, 0, r.none, r.errors, r.n, 'mirror');
    else { addField(j.i, r.a, r.b, r.none, r.errors, r.n, decks[j.j].d.file); addField(j.j, r.b, r.a, r.none, r.errors, r.n, decks[j.i].d.file); }
  };
  if (fs.existsSync(CK)) for (const line of fs.readFileSync(CK, 'utf8').split('\n')) {
    if (!line) continue; let r; try { r = JSON.parse(line); } catch (e) { continue; }                  // a half-written last line is ignored
    const k = keyOf(r.job); if (!finished.has(k) && jobs.some(x => keyOf(x) === k)) { finished.add(k); absorb(r); done++; }
  }
  if (done) console.log(`  resuming: ${done} of ${total} jobs already done (${CK})`);
  const todo = jobs.filter(j => !finished.has(keyOf(j)));
  await new Promise((resolve, reject) => {
    let live = 0, nx = 0;
    if (!todo.length) return resolve();
    for (let w = 0; w < Math.min(JOBS, todo.length); w++) {
      const wk = new Worker(__filename, { argv: process.argv.slice(2) }); live++;
      const feed = () => { if (nx < todo.length) wk.postMessage(todo[nx++]); else { wk.terminate(); if (--live === 0) resolve(); } };
      wk.on('message', r => {
        const j = r.job;
        if (r.errors && r.firstError) console.warn('  engine error in', j.kind, decks[j.i].d.file, j.j != null ? 'vs ' + decks[j.j].d.file : '', String(r.firstError).split('\n')[0]);
        absorb(r); fs.appendFileSync(CK, JSON.stringify(r) + '\n');
        if (++done % 5 === 0 || done === total) console.log(`  ${done}/${total} jobs, ${Math.round((Date.now() - t0) / 1000)} s`);
        feed();
      });
      wk.on('error', reject);
      feed();
    }
  });
  console.log('');
  if (MATCH_ONLY) {            // the goldfish results stay as they are; each deck gets its field win % (same fields as verdict() writes)
    const old = JSON.parse(fs.readFileSync(OUT, 'utf8')), version = +(fs.readFileSync(path.join(STATIC, 'version.js'), 'utf8').match(/ISF_VERSION\s*=\s*(\d+)/) || [])[1];
    for (const i of pick) {
      const v = old.decks.find(x => x.file === decks[i].d.file), f = field.get(i); if (!v || !f) throw new Error('no goldfish result or no matches for ' + decks[i].d.file);
      v.field = { games: f.n, wins: f.w, losses: f.l, none: f.none, errors: f.errors, winRate: pct(f.w / Math.max(1, f.n - f.errors)), opponents: f.opps.has('mirror') ? 'its own mirror' : f.opps.size + ' other Commander decks' };
    }
    old.roundRobin = { version, date: new Date().toISOString().slice(0, 10), matchesPerPair: perPair, matchTurns: MATCH_TURNS, seed: SEED, seconds: Math.round((Date.now() - t0) / 1000), jobs: JOBS, decks: pick.length };
    fs.writeFileSync(OUT, JSON.stringify(old, null, 1) + '\n');
    console.log(`round robin: ${pick.length} decks, ${perPair} matches per pair; ${old.roundRobin.seconds} s on ${JOBS} threads. Wrote ${path.relative(ROOT, OUT)}`); return;
  }
  const results = pick.map(i => {
    const g = gf.get(i), ok = Math.max(1, g.n - g.errors);
    g.kill = g.kill.map(v => v / ok); g.cmdr = g.cmdr.map(v => v / ok); g.mana4 /= g.n; for (const k in g.winBy) g.winBy[k] /= ok;
    const f = field.get(i); if (f) f.opps = f.opps.has('mirror') ? 'its own mirror' : f.opps.size + ' other Commander decks';
    const v = verdict(decks[i], g, f); v.reason = reason(v); return v;
  });
  let old = {}; try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first run */ }
  const keep = (old.decks || []).filter(o => !results.some(r => r.file === o.file));
  const version = (fs.readFileSync(path.join(STATIC, 'version.js'), 'utf8').match(/ISF_VERSION\s*=\s*(\d+)/) || [])[1];
  const doc = { about: 'Bracket check of the built-in decks. Re-run: node tools/verify-brackets.js; then --apply. Method: docs/agents/DECK-BRACKETS.md',
    version: +version, date: new Date().toISOString().slice(0, 10), gamesPerDeck: GAMES, matchesPerPair: perPair, matchTurns: MATCH_TURNS, seed: SEED,
    seconds: Math.round((Date.now() - t0) / 1000), jobs: JOBS, rules: RULES, decks: keep.concat(results).sort((a, b) => a.file.localeCompare(b.file)) };
  if (ONLY && old.decks) {          // a run for some decks only: the full run's details stay at the top, this run is listed under "runs"
    const run = { only: results.map(r => r.file), version: doc.version, date: doc.date, gamesPerDeck: GAMES, matchesPerPair: perPair, matchTurns: MATCH_TURNS, seed: SEED, seconds: doc.seconds, jobs: JOBS };
    results.forEach(r => { r.version = doc.version; r.date = doc.date; });
    Object.assign(doc, { version: old.version, date: old.date, gamesPerDeck: old.gamesPerDeck, matchesPerPair: old.matchesPerPair, seconds: old.seconds, jobs: old.jobs, runs: (old.runs || []).concat([run]) });
  }
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
  for (const v of results) console.log(`${(v.stated ? 'B' + v.stated : '--')} -> ${v.verified ? 'B' + v.verified : '--'}  ${v.name.slice(0, 48).padEnd(48)} med T${v.goldfish.medianKill} by5 ${v.goldfish.by5}% GC ${v.rules.gameChangers.length} field ${v.field ? v.field.winRate + '%' : '-'}`);
  console.log(`${results.length} decks, ${GAMES} goldfish games each, ${perPair} matches per pair; ${doc.seconds} s on ${JOBS} threads. Wrote ${path.relative(ROOT, OUT)}`);
}

// ---------- --apply: the bracket line and one check line in each deck file ----------
// The check line starts "// Checked" (not "// Bracket", which tools/import-decks.js replaces); the deck parser skips every "//" line.
function apply() {
  const doc = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  for (const v of doc.decks) {
    if (ONLY && !v.file.includes(ONLY)) continue;          // --apply --only=<deck>: only that deck is written
    const file = path.join(DECKS, v.file), lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n').filter(l => !/^\/\/\s*Checked\b/i.test(l));
    const g = v.goldfish, f = v.field;
    let line = `// Checked by ICEYfish (v${v.version || doc.version}, ${g.games.toLocaleString('en-US')} games): median kill T${g.medianKill}, ${g.by5}% by T5, ${g.by7}% by T7; fastest ${g.earliestKill ? 'T' + g.earliestKill : 'none by T' + (g.byT != null ? 10 : '')}: ${g.by2}% by T2, ${g.by3}% by T3, ${g.by4}% by T4; ${v.rules.gameChangers.length} Game Changers`;
    if (v.commander) line += v.verified === v.stated ? `; B${v.verified} confirmed` : (v.stated ? `; was B${v.stated} -> B${v.verified}: card rules B${v.rules.floor}, speed B${v.speedBracket}` + (v.stated === 5 ? '; B5 needs a median kill before T4' : v.verified > v.stated ? `; the rules rule out B${v.stated}` : '') : `; B${v.verified}: card rules B${v.rules.floor}, speed B${v.speedBracket} (no Drive bracket given)`);
    else line += '; not a Commander deck, no bracket';
    if (v.commander) { const b = lines.findIndex(l => /^\/\/\s*Bracket\s*\d/i.test(l)); if (b >= 0) lines[b] = `// Bracket ${v.verified}`; else lines.splice(1, 0, `// Bracket ${v.verified}`); }
    const at = lines.findIndex(l => /^\/\/\s*Bracket\s*\d/i.test(l));
    lines.splice(at >= 0 ? at + 1 : 1, 0, line);
    fs.writeFileSync(file, lines.join('\n'));
    if (v.commander && v.verified !== v.stated) console.log(`${v.stated ? "B" + v.stated : "no Drive bracket"} -> B${v.verified}  ${v.name}: ${v.reason}`);
  }
  // index.json: the ranking fields the deck menus sort by (T-077). bracket = the verified one (the higher of floor and speedBracket).
  const IDX = path.join(DECKS, 'index.json'), idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  for (const d of idx.decks) {
    const v = doc.decks.find(x => x.file === d.file); if (!v || (ONLY && !v.file.includes(ONLY))) continue;
    d.medianKill = v.goldfish.medianKill; d.by5 = v.goldfish.by5; d.by7 = v.goldfish.by7;
    if (v.commander) { d.floor = v.rules.floor; d.speedBracket = v.speedBracket; d.bracket = v.verified; }
    d.checkedAt = v.date || doc.date;
  }
  for (const d of idx.decks) {            // the kill-turn ceiling: share of games won by turn 2, 3 and 4, and the earliest turn a game was won (T-077)
    const v = doc.decks.find(x => x.file === d.file); if (!v || (ONLY && !v.file.includes(ONLY)) || v.goldfish.by2 == null) continue;
    d.by2 = v.goldfish.by2; d.by3 = v.goldfish.by3; d.by4 = v.goldfish.by4; d.earliestKill = v.goldfish.earliestKill;
  }
  fs.writeFileSync(IDX, JSON.stringify(idx, null, 1) + '\n');
  // drive-sync.json: "bracket" stays what the Drive file name says (the user's claim); "verified" is ICEYfish's (tools/import-decks.js keeps it)
  const SYNC = path.join(DECKS, 'drive-sync.json'), sync = JSON.parse(fs.readFileSync(SYNC, 'utf8'));
  for (const rec of Object.values(sync.files)) { const v = doc.decks.find(x => x.file === rec.deck); if (v && v.commander && (!ONLY || v.file.includes(ONLY))) { rec.verified = v.verified; rec.verifiedAt = v.date || doc.date; } }
  fs.writeFileSync(SYNC, JSON.stringify(sync, null, 1) + '\n');
  console.log('Now run: node tools/build-deck-index.js');
}

// ---------- --report: the table in docs/agents/DECK-BRACKETS.md, between the "<!-- table -->" markers ----------
function report() {
  const doc = JSON.parse(fs.readFileSync(OUT, 'utf8')), md = path.join(ROOT, 'docs', 'agents', 'DECK-BRACKETS.md');
  const rows = doc.decks.slice().sort((a, b) => (b.verified || 0) - (a.verified || 0) || a.name.localeCompare(b.name)).map(v => {
    const g = v.goldfish, ch = v.commander && v.verified !== v.stated ? `**B${v.stated} → B${v.verified}**` : v.verified ? `B${v.verified}` : '–';
    const why = !v.commander ? 'not a Commander deck' : `speed B${v.speedBracket}; cards ≥ B${v.rules.floor}${v.rules.why.length ? ': ' + v.rules.why.join('; ') : ''}`;
    return `| ${v.name} | ${v.stated ? 'B' + v.stated : '–'} | ${ch} | T${g.medianKill} | ${g.by4} | ${g.by5} | ${g.by6} | ${g.by7} | ${g.by8} | ${g.byT} | ${g.cmdrMedian ? 'T' + g.cmdrMedian : '–'} | ${g.mana4} | ${v.field ? v.field.winRate : '–'} | ${v.rules.gameChangers.length} | ${why.replace(/\|/g, '/')} |`;
  });
  const table = ['| Deck | Stated | Verified | Median kill | % by T4 | T5 | T6 | T7 | T8 | T10 | Commander cast (median) | Mana T4 | Field win % | GC | Reason |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'].concat(rows).join('\n');
  const text = fs.readFileSync(md, 'utf8').replace(/<!-- table -->[\s\S]*<!-- \/table -->/, `<!-- table -->\n${table}\n<!-- /table -->`);
  fs.writeFileSync(md, text); console.log('Wrote the table into', path.relative(ROOT, md));
}

if (require.main !== module) module.exports = { RULES, GAME_CHANGERS, BRACKET_NAME, cardRules, speedBracket, medianTurn, loadAll, OUT };
else if (process.argv.includes('--apply')) apply(); else if (process.argv.includes('--report')) report(); else simulate().catch(e => { console.error(e); process.exit(1); });
