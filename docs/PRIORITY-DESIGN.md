# T-127 design note: a real priority loop and one stack (CR 117, 405, 601-608)

Status: **design accepted by MAIN; stages 0+1 built on `claude/t127-stack-0-1` (see section 11).** Author: the T-122 TASK session. Base: default branch at Version 219.
Everything about today's engine below was read in the code (function names are the anchors); nothing in the engine is changed by this note.
Numbers for speed come from `node tools/bench.js` run on this base.

## 1. What exists today (the starting point)

| Piece | Where (`sim.js`) | What it is |
|---|---|---|
| Cast and resolve in one call | `castCard` / `castCard0` (~9876, 9910) | pay costs, lock targets, then `ownPriority` (a person's own response), `tryCounter`, then the effects, all synchronously; callers get the events back |
| The spell response window | `tryCounter`, `stackResponses`, `personAnswer`, `respondWith`, `respondAbility`, `responseCards`, `responseAbilities` (~14956-15215) | `g.pendingSpell = { inst, caster, responder, lock, gone }` on both players, only while one spell waits; a response is just a nested `castCard` |
| Triggers | `fire` -> `trigQ`, `settle` -> `stackItems` (~5746-5800), `acting` | triggers queue while an action runs; `settle` sorts APNAP and pops them one by one, with state-based actions between |
| Spells being cast | `g.spellStack` | a list used for `stackView` only |
| Activated abilities | `abilityList` / `useAbility` / `useAbilities0` (~10929, 11632) | a closure `it.run(ev)` that pays and does the effect at once. No stack object, no response possible |
| Opponent windows | `instantWindow` (after attackers are declared, at the end step), `answerAttack`, `protectLethal`, `protectOne` | the autopilot's own single-purpose hooks |
| Person choices | `decide(g, d)` -> `g.ask`; `decide.js` replays a call on a copy until every answer is known (`attempt`, `resolveSync`) | kinds `resolve`, `counter`, `instant`, `protect`... |

Facts the design must respect: the engine is synchronous and deterministic; a seated person who takes every default plays exactly the
autopilot's game (every-default sweep, `bad 0`); simulations run thousands of games (bench below); dry runs (`g.dry`, `cloneState`)
evaluate plays on a copy and must never touch the real stack.

## 2. The data model

One stack per table (the match record `g.match`, or the lone game in a goldfish), not one list per player.

```
table.stack = [ StackObject, ... ]            // index 0 is the bottom; resolve from the end
StackObject = {
  id,                                          // increasing number: stackView order, tests
  kind: 'spell' | 'activated' | 'triggered',
  controller,                                  // the player object
  source,                                      // the permanent, or the card instance for a spell
  inst,                                        // spells: the card instance (so it can go back to hand/graveyard)
  fx, text,                                    // what it does (the parsed effects, as today's trig.fx / a.spellFx / ab.fx)
  lock,                                        // targets locked as it was put on the stack (today's PENDING/lockTargets)
  snap: { xValue, lastCast, thatMuch, spellsCast },   // what it remembers (settle already saves these)
  flags: { splitSecond, copy, noCounter, ... },
  resolve(ev)                                  // run on resolution; a closure over the existing effect code
}
```

- `g.priority = { holder, passes }` on the table: who holds priority and how many players have passed in a row (CR 117.3-117.4).
- `stackView(g)` reads this stack (it already returns `{kind, card, pid, text}`).
- Compatibility shims while the paths move over: `g.pendingSpell` becomes a derived getter (the top spell and its responder);
  `g.spellStack`, `g.stackItems` and `g.trigQ` are removed once nothing reads them. The five current readers of `pendingSpell` (~7361, 7378,
  7387, 7962 and `tryCounter`) keep working through the shim, so they move last.
- Mana abilities never become stack objects (CR 605.3a): `pay`/`produce` stay as they are. A triggered mana ability resolves at once (605.4a).
- Copies (`copySpell`, Archaic, Return the Favor) push a `flags.copy` object above the original (CR 707.10).

## 3. The loop

`priorityRound(table, active)` implements CR 117.3-117.5 and 405.5:

1. `holder = active`. Before any player receives priority: state-based actions (the existing `sba`), then pending triggers go on the stack
   in APNAP order (the existing `settle` ordering rule, moved here); repeat until nothing changes (CR 117.5, 603.3).
2. The holder is offered the chance to act: the autopilot asks `autoRespond(player, topObject)`; a person gets the `priority` question (section 6).
   An action (cast, activate) pushes an object and gives the same player priority again (117.3c); passes reset to 0.
3. A pass: `passes++`, `holder` = next player in turn order. When `passes === playerCount`: if the stack is empty the step or phase ends
   (mana empties, CR 106.4, already done by `emptyPool`); otherwise `resolveTop(table)` pops and resolves the top object, then the active player
   receives priority (117.3b).
4. Split second (CR 702.61): while a split-second object is on the stack, nobody receives priority except for mana abilities and special actions.
   Today `splitSecondSpell` is only a "no answer" flag in `tryCounter`.
5. Guard: the existing `n > 600` loop guard in `settle` moves into the loop.

### The fast path (this is what keeps simulations quick)

Most priority rounds have nothing to decide: nobody holds an instant, a flash card or an instant-speed ability they can pay for, and nobody
is a seated person. `canRespond(player)` answers that cheaply: a per-player flag recomputed only when the hand, the battlefield or the mana
changed (the engine already counts these changes with `touch(g)` / `bfVer`). When no one other than the holder can respond and the holder is
the autopilot with no policy asking to hold up a response, the round is skipped and the object resolves at once. In a goldfish game (no
opponent) only the lone player's own responses remain, and the autopilot makes none today (except protection spells), so a goldfish game
runs the same code path as now plus a cheap flag check. Dry runs skip the loop completely.

## 4. Where it hooks into the turn loop

| Step / phase | Today | With the loop |
|---|---|---|
| untap | no priority | unchanged (CR 502.4) |
| upkeep, draw | triggers settle; no player acts | triggers go on the stack, a priority round at the end of each step |
| main phases | the autopilot casts and activates; the opponent never acts | the autopilot's `castPhase` keeps deciding the active player's plays, but each cast/activation goes through the stack and the opponent gets a round; when the active player has nothing more to do, one pass round ends the phase |
| beginning of combat | triggers settle | + priority round |
| declare attackers | one opponent window (`instantWindow 'combat'`) | priority round (replaces that window) |
| declare blockers | none | **new**: priority round after blocks are chosen (`resolveCombatVs` calls it) |
| first-strike and regular damage | none | **new**: a round after each damage step (the T-122 fix 3 already ends the first step before the second) |
| end of combat | inline flags | priority round; also the point for an `endCombat` trigger kind (T-122 audit row 15) |
| end step | `instantWindow 'end'` | priority round (replaces that window) |
| cleanup | no priority | priority only if something happened (T-122 fix 5 already repeats it) |

The turn-order functions (`playTurn`, `beginTurn0`, `combat0`, `postCombat0`, `endTurn0`) call `priorityRound` at those points; no function is
renamed or removed, and the exports stay.

## 5. Migrating each existing response path

| Path today | Becomes |
|---|---|
| `castCard0` "pay, lock, `ownPriority`, `tryCounter`, effects" | `castCard` = announce + pay + push the spell + `priorityRound`; the effects part (everything after `tryCounter`) is the object's `resolve`. `castCard` still returns the events synchronously: it runs the loop inside the call, so responses nest and resolve LIFO exactly as a real stack does. Callers (`castOne`, `respondWith`, ...) do not change |
| `tryCounter` / `tryCounter0` | the counterspell is a spell that is cast in the round; its `resolve` removes the target object (CR 701.5). `uncounterable`, `fieldCounter` (Cursecatcher...), Mistrise Village, Mana Drain's mana stay as logic inside those resolves/triggers |
| `stackResponses`, `casterVeil`, `personAnswer`, `ownPriority` | one function, `autoRespond(player, topObject)`, for the autopilot; the person gets the `priority` question. Redirect Lightning, Hydroelectric Specimen, Return the Favor, Hullbreaker Horror, Autumn's Veil are instants/abilities cast in the round that act on `topObject.lock` (today's `ps.lock`) |
| `boromirCounter`, `archaicTrigger` | real triggered abilities of the permanent, put on the stack above the spell (they are "whenever a player casts" triggers) |
| `protectOne`, `protectLethal`, `answerAttack` | `autoRespond` at the declare-attackers and damage priority points |
| `instantWindow('combat' / 'end')`, `flashLandWindow`, Teferi's end-step use | the priority rounds at those steps |
| `fire` / `trigQ` / `settle` / `stackItems` | `fire` queues; step 1 of the loop puts queued triggers on the stack (APNAP, the existing ordering); `settle` stays as the name of "run the loop until the stack is empty" so the 100+ call sites stay |
| `useAbility` / `abilityList` closures | see below |
| `stackView`, `spellStack` | read `table.stack` |
| `g.pendingSpell` readers | the shim, then migrated one by one |

### Activated abilities (the hard part)

`abilityList` is hundreds of closures in which paying the cost and doing the effect are one function. They cannot all be split at once.
Plan: (a) the *declarative* abilities (parsed `a.activated` entries: cost, tap flag, effects) are split exactly: pay and tap at activation,
push an object, resolve with `applyEffects`. (b) The hand-coded closures (`zombieAbilities`, the one-card helpers) are wrapped: they run as
today, but are announced as a stack object first so they can be responded to only where the closure has an explicit `pay` vs `effect` seam.
A counter in the test run lists which abilities are still legacy, so the migration is measurable and the "responses to abilities" claim is
only made for the ones that are real. This is the largest part of the work and is stage 4.

## 6. The person's side

- New question kind `priority` in `decide.js` (a new kind: MAIN must approve the name before it is added; `choices.js` gets its sheet). The
  options are the `responseCards` + `responseAbilities` the person can use now, plus "Pass". The default is the autopilot's choice
  (`autoRespond`), so a person who takes every default plays the autopilot's game and the every-default sweep stays `bad 0`.
- **Auto-pass** (an option, `opts.autoPass`): `'smart'` (default) asks only when the person holds something castable or activatable at
  instant speed *and* the object or step is one they could care about (an opposing spell/ability on the stack, a declared attack,
  the end step); `'stops'` asks only at stops the person set (a list of steps); `'never'` asks at every step (a rules-complete mode, slow);
  `'always'` never asks (today's behaviour). The seat's setting lives with the other per-seat options.
- Replays: `decide.js` replays a call on a copy until every answer is known. The stack lives in the game object, so `clonePod` / `cloneState`
  must deep-copy it (today they reset `spellStack`/`stackItems`/`trigQ`). A test asserts that a replay leaves the real stack untouched.

## 7. Performance budget

Baseline (this base, `node tools/bench.js`): goldfish 6 decks x 100 games **89.07 s**, match 3 pairs x 20 **2.25 s**, pod 4 decks x 10 **0.87 s**;
total **92.19 s**. Budget: total at most **+20% (110.6 s)**, and each of the three lines at most +20% on its own. The result hash will change
(behaviour changes by design); the gate is the time. Measured after every stage and recorded in the stage report.

Why it should fit: the fast path (section 3) makes a no-response round a flag check; goldfish games have no opponent; dry runs skip the loop;
stack objects are small records created only when something is put on the stack (the engine already builds `stackItems` records per trigger).
Where the extra cost is real: matches and pods (rounds at every step; the flag keeps it to a few comparisons) and the trigger path
(one record per trigger, as now). If a stage exceeds the budget it is not merged until the fast path is tightened.

## 8. Stages (each one reviewable, green and measured on its own)

| Stage | Content | Behaviour change |
|---|---|---|
| 0 | `table.stack`, the object type, `stackView` and the `pendingSpell` shim over it; deep-copy in the clones | none; fingerprint identical |
| 1 | `priorityRound` + the turn-loop hooks + fast path + the `priority` question + auto-pass option; nothing yet responds | none when nobody can respond; fingerprint identical |
| 2 | spells on the real stack; every response path in section 5 moved; cast triggers go above the spell | **yes**, see risks |
| 3 | triggers via the loop (APNAP, a round between objects) | small; most triggers have no response |
| 4 | declarative activated abilities on the stack, then the legacy closures one group at a time | yes: abilities become respondable |
| 5 | blockers and damage windows; `endCombat` trigger kind | yes |
| 6 | the loop on by default for everyone; built-in decks re-bracketed (the user's rule: bracket check on every deck change) | yes |

Stages 0 and 1 can be merged ahead of the rest. Stages 2-6 are behind `opts.priority` (default off) until stage 6 so a half-migrated engine
never reaches the live site.

## 9. Test plan

- One engine test per CR rule, each citing it: 117.3 (active player first, both pass in a row), 117.4, 405.5 (last in, first out), 608.1,
  603.3b (APNAP), 117.5 (SBAs and triggers before priority), 702.61 (split second), 605.3a (mana abilities do not use the stack), 701.5 (counter),
  707.10 (copies), 106.4 (mana between steps), responses after blockers and to an ability and a trigger (the three the user asked for).
- Equivalence: with every player passing (stage 1) the fingerprint (`tools/autopilot-fingerprint.js`) and the every-default sweep are unchanged.
- Existing suites that cover today's response paths (`stack*.test.js`, `trigger-stack`, `decisions`, the T-100 group tests, the counterspell tests)
  must pass at each stage or be changed with a reason written in the stage report.
- Person tests: a seated person offered `priority` with the default = autopilot; auto-pass modes; replay leaves the stack untouched; a pod of
  three, priority order by turn order.
- Speed: `tools/bench.js` after every stage against section 7.
- Stress: the infinite-loop guard; a 600-game random soak per deck (no throws; no stack left over at end of turn).

## 10. Risks and decisions for MAIN / the user

1. **Cast triggers resolve before the spell** (CR 603.3, 601.2): today they resolve after the spell, because `castOne` settles at the end.
   With the real stack the order is the rules' order. This changes results for storm, Young Pyromancer-style, Rhystic Study, and "whenever you
   cast" decks. It is right by the CR; every built-in deck gets re-rated afterwards.
2. **Matches get slower per game** because of the rounds; the fast path is the mitigation and the +20% budget the gate.
3. **The legacy ability closures** (section 5) cannot all be made respondable in one go; the claim "responses to abilities" will be true
   per ability group, with a count.
4. **Policy lab** policies (`instantTiming`, `counterWorth`, ...) stay as the autopilot's response policy inside `autoRespond`; they are not removed.
5. New names: the question kind `priority`, `opts.autoPass`, `table.stack`, `priorityRound`, `autoRespond`. No existing export is renamed.
   MAIN approves the new names before stage 1.
6. UI: the `priority` sheet in `choices.js` and the pass/respond controls in `versus.js` are a separate UI task; the engine stages do not depend on it
   (the default pass keeps the page working).
7. Estimated size: stage 0-1 are small; stage 2 is the bulk (castCard0 split plus every response path); stage 4 is the longest.
   Suggested owners: one engine session per stage in order (they all edit `sim.js`), a UI session for the sheet after stage 1.

## 11. Stages 0+1: what was built (and where it differs from sections 2-8)

- `tableOf(g)` / `tableStack(g)`: one stack per table (`g.match.stack`, or `g.stack` in a goldfish game). `castCard` pushes `{ kind: 'spell', controller, source, inst, seq }`
  and removes it when the cast ends; `settle` puts triggers there as `{ kind: 'triggered', controller, ... }` and works above its own `base`, so a nested call never pops what
  is under it. `stackView` reads it (same output). The old `spellStack` / `stackItems` are gone; `trigQ` stays as the list of triggers that wait to go on the stack.
  `cloneState` gives a rehearsal its own empty stack; `decide.js`'s `clonePod` already deep-copies it.
- **Difference:** `g.pendingSpell` was **not** turned into a getter in stage 0. It is still set and cleared by `tryCounter`; it is replaced when the response paths move in stage 2.
- `priorityRound(g, step, ev)`, `priorityPlayers`, `wantsPriority`, `priorityAct`: off unless `opts.priority`; skipped at once when nobody is seated (the fast path); only
  when the stack is empty; a seated person with something to cast or use is asked (kind `priority`, default Pass), acts, and gets priority again.
  Hooks (inert by default): end of upkeep, end of draw, end of each main phase (once per turn per player), beginning of combat, after blockers, after damage, end of combat.
  Not hooked yet (the old windows still serve them, so they would ask twice): declare attackers (`instantWindow 'combat'`) and the end step (`instantWindow 'end'`).
- `opts.autoPass`: `'smart'` (default: own turn at the beginning of combat, blockers, end of combat; another player's turn also at upkeep, main, damage), `'stops'` (`opts.stops`), `'never'`, `'always'`.
- `decide.js`: question kind `priority` (title, text, "Pass"). The UI sheet is the UI session's task; the generic list of options works as for `instant`.
- `tools/every-default-sweep.js`: `PRIORITY=1` runs the sweep with `opts.priority` and `autoPass: 'never'`.

## 12. Stage 2: what was built (branch `claude/t127-stack-2`)

All behind `opts.priority` (and `ISF_PRIORITY=1` for the test suite: `newGame` turns it on for every game that does not set `priority` itself).

- **Cast triggers first (CR 603.3):** `resolveSpellInner` settles the stack (triggers, APNAP) before the response window, so "whenever you cast" triggers resolve before the spell can be answered or resolve.
  Measured note: Young Pyromancer's token already came before Lightning Bolt's damage with the rule off, so the visible change is smaller than the design feared; it matters for triggers that were queued rather than run inline.
- **Boromir and Wandering Archaic are triggers on the stack:** `queueRun` queues a hand-played triggered ability (`{ run }`) like any trigger; `settle` runs it when it resolves. Boromir's counter sets `inst._boromired`; `boromirCounter` and the Archaic call in `stackResponses` stand down when the rule is on.
- **Windows:** with the rule on, `instantWindow` (attackers declared, end step) asks a seated person the `priority` question (`step` 'combat' / 'end', titles "Attackers declared" / "End step") and obeys `opts.autoPass` (a person who is not asked passes; the autopilot's own plays are unchanged).
- **Not moved (deliberate):** the counterspell, redirect, copy, Hullbreaker, Return the Favor and protection responders (`tryCounter0`, `stackResponses`, `casterVeil`, `personAnswer`, `protectOne`) still run as nested casts inside the response window. They already sit on the real stack (a nested `castCard` pushes its own object and resolves last in, first out), so moving them behind `autoRespond` changes nothing observable and is left for stage 3 with the trigger loop. `g.pendingSpell` is still the record of the response window.
- **Puzzles:** `puzzle-core.js` / `puzzle.js` answer the new question with "pass", and the hidden opponent acts only in the old windows (attack, end step).

## 13. Stage 3: what was built (branch `claude/t127-stack-3`)

- `autoRespond(g, d, inst, ev, ps, by)`: the autopilot's responders to a spell in one place (caster's veil, `stackResponses`, `tryCounter0`); `tryCounter` calls it. A pure move: with the rule off nothing changes. A seated person's answers still come from `personAnswer` (inside `tryCounter0`) and `priorityRound`.
- `settle` runs a priority round (`priorityRound(h, 'stack', ev, over)`) before each trigger resolves when `opts.priority` is on: a seated person who holds something to cast or use is asked (question kind `priority`, step `stack`, titled "<card> is on the stack: respond?"), and a response resolves first. `smart` asks only for the other player's objects; `never` for every object; `always` never.
- Not done: moving the person's responders into the loop (they are already asked in `personAnswer`/`priorityRound`), and abilities (stage 4). Handoff: `docs/agents/PRIORITY.md`.

## 14. Stage 4: what was built (branch `claude/t127-stack-4`)

- Activated abilities (CR 602): with `opts.priority` on, the cost is paid at activation and the effect goes on the stack (`queueRun(..., 'activated')`, kind kept by `settle`), below the triggers the cost caused and above nothing else, so it resolves last of its own batch and gets the stage-3 priority round (step `stack`, "<card> is on the stack: respond?"). `useAbility` then settles at once so the caller sees the finished board (the autopilot's loops depend on it).
- Which abilities: every declarative `a.activated` entry (`cost`, `tap`, `sac*`, `fx`) and four hand-coded closures with a clean seam (Food: gain 3 life, `sacRamp`, `pingCounter`, `reservoir`) via `resolveAs`. Mana abilities (CR 605) are not in `abilityList` and never use the stack.
- Counter: `G.ABIL_STATS = { stacked, legacy }` counts activations by `useAbility`; an entry that ran in one piece (every other hand-coded closure in `abilityList`: equip, loyalty-style sacrifice outlets, cycling/channel, the one-ring/necro/squirrel family, command-zone put, ...) counts as legacy. Targets are still chosen when the effect resolves (as for triggers), not at activation.
- Not moved: `zombieAbilities`, `deathTaxAbilities` and other autopilot-only routines that perform an ability inline without `useAbility`; planeswalker loyalty abilities (`pwAbilities`).

## 15. Stage 5: what was built (branch `claude/t127-stack-5`)

- **Autopilot defender through the loop:** `priorityRound` at `blockers` and `damage` (the rule on, the attacker's turn) runs `instantWindow(defender, ev, step)` for an autopilot defender and, for a seated defender, offers the autopilot's own pick (`instantPick`, extracted from `instantWindow`) as the default of the `priority` question, so a person who takes every default plays the autopilot's game (the sweep). `priorityAct` casts at these steps exactly as `instantWindow` does (same flags, same X rule).
- **First-strike damage step:** `resolveCombatVs` runs `priorityRound(g, 'damage')` after the first-strike step settles (CR 510.4).
- **`endCombat` trigger kind:** the parser reads "At end of combat, ..." (also "on your turn"); `combat0` fires those triggers and settles them just before the end-of-combat priority round. Fires only with `opts.priority` on, so the rule-off game is unchanged (no card in the current data uses it yet).
- **autoRespond group:** `autoRespondAttack(g, d, attackers, ev)` = `answerAttack` + `protectLethal` + `instantWindow('combat')` (a pure move, same order); `autoRespondTarget` = `protectOne`, called from `answered`. The old function names stay.
- Exports: `instantPick`, `priorityRound`.

## 16. Stage 6: the rule is on by default (branch `claude/t127-stack-6`)

- `newGame` turns `opts.priority` on unless the options say `priority: false` or the environment says `ISF_PRIORITY=0` (the old engine, for comparisons: `ISF_PRIORITY=0 node tools/autopilot-fingerprint.js $PWD out.txt` still gives b8ce7c978cde92903e43f579873e1ffe). `ISF_PRIORITY=1` is no longer needed. The hidden `isf_display.priority` toggle in `app.js` is gone.
- Effect on results (autopilot fingerprint, 40 pod games per pod, 40 games per match, 25 goldfish games per deck, seeds fixed): 22 of 29 fingerprint lines change. Pods 0/2/4/6: wins move by 1-3 games of 40 (e.g. pod 6 seats 2/3: 9/9 to 6/12 wins). Matches: 7 of 9 unchanged in wins, match 7 14-26 to 15-25, match 8 18-22 to 17-23 (average winner life moves by up to 0.7). Goldfish: kill turn is identical in 174 of 175 games (Veyran 1 game); what moves is damage/mana/other counters in 1-11 of 25 games per deck (Zimone 11, Loyalty Program 10, Veyran 9, Mermaids 8, Red Rum Raiders 3, Death Tax 2, Frodo 1), from cast triggers resolving before the spell and abilities resolving after their cost triggers. The deck brackets need the MAIN re-check.

## 17. T-132: targets of abilities chosen on the stack (branch `claude/t132-ability-targets`)

- `opts.abilityTargets` (on by default; `abilityTargets: false` or `ISF_ABILITY_TARGETS=0` turns it off; with it off the fingerprint is the v229 default, a2e96ee33608669c02845f94a0b1448c). With it on, `settle` runs `lockAbility` for each trigger as it goes on the stack: the same lock mode as a spell's `lockTargets` (T-072) runs the ability's lockable effects (`lockable`: removal, bounce, burnCreature, divideDamage, threaten, tapOpp, stealOne, airbend, earthbend, strive copies) once, the pickers (a seated person's `target` question, or the autopilot's pick) record the targets on the stack object (`it.lock`), and as the ability resolves `settle` puts that lock in force (`LOCKS`) so the handlers use the stored target and check it is still legal (`lockLegal`, CR 608.2b) instead of choosing again. A response that removes the target makes the ability do nothing for it.
- Activated abilities: `useAbility`'s declarative path locks the ability's targets when it queues the effect (`lockAbilityFx`). A scan of the card data finds almost no declarative `a.activated` entry with a lockable effect (Sequence Engine), so the activated path is small; hand-coded closures (stage 4's legacy list) are unchanged.
- Skipped on purpose (they behave as before): "first/second time" lists (`trig.nth`), triggers that ask for an opponent in a pod (`trigOpp`), hand-played triggers (`it.run`), effects not in `lockable` (target-choosing code that picks inline: damage to any target, pump, counters, ...). The list of effect types that still choose on resolution is the remaining work for the rules roadmap line 1.

## 18. T-143: the target residue (branch `claude/t143-target-residue`)

- `lockable` is now `lockableBase` (spells, T-072, unchanged) plus seven group predicates `lockableA`..`lockableG` that only abilities use (`lockAbilityFx`): A pumps (pumpOne, attackerPump, pumpAttacker, gainFire), B counters (target scope) and distribute, C fight, flickerOne, flickerwisp, flicker (oath), D goad, stealOne without mvX, hostage, fiendHunter, drakeSwap, totemSwap, E untap/animate/copy effects, F graveyard and own-return targets (with `lockLegalYard`), G damage shapes and other effects. Each handler follows the same pattern as the T-132 ones: in lock mode it makes its usual pick and records it; on resolution it uses `tgtLock`, checks legality (CR 608.2b) and does nothing for a target that is no longer legal.
- What is still chosen on resolution is listed in the T-143 report with the reason for each.
