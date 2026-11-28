# T-122 Timing audit (Phase 1: audit only, no code changed)

Base: Version 217 (`2b66d34`), branch `claude/t122-timing-audit`. Rule numbers are from the Comprehensive Rules (CR).

**How this was done.** By reading `goldfish/static/sim.js` (`beginTurn0`, `untapStep`, `landStep0`, `castPhaseInner`, `combat0`,
`resolveCombatVs`, `postCombat0`, `endTurn0`, `cleanupDiscard`, `fire`, `settle`, `acting`, `sba`, `tryCounter`/`stackResponses`,
`instantWindow`, `emptyPool`) and `decide.js`. **Nothing here was run or reproduced yet.** Every row is "by reading"; Phase 2
writes a failing test first for each fix, which turns a row into a verified one. Where I am unsure, the row says so.

Verdicts: **MATCHES** (same observable order as the CR), **DEVIATES** (does something the CR does not), **MISSING** (the CR has
it, the engine has no such thing).
Impact: **R** = can change a game's result (wins, who gets damage, what is cast); **C** = cosmetic (log order, no result change).

The engine's design is one fact behind most rows: there is **no general stack and no priority loop**. Spells get a response window
(`g.pendingSpell`, `tryCounter`/`stackResponses`); triggers queue in `trigQ` and `settle()` pops them; everything else (activated
abilities, many "triggers", turn-based effects) is resolved inline when it is chosen.

## 1. Turn structure and steps (CR 500-514)

| # | Rule area | CR | What the engine does (file / function) | Verdict | Impact |
|---|---|---|---|---|---|
| 1 | Step order untap, upkeep, draw, main 1, combat, main 2, end, cleanup | 500.1, 501-514 | `playTurn` runs `beginTurn` (untap, upkeep, draw, main-1 triggers), `landStep`, `castPhase`, `combat`, `postCombat`, `endTurn` | MATCHES | - |
| 2 | Untap step: no priority, phasing in first, untap all | 502.1-502.4 | `beginTurn0` phases in, then `untapStep`; nothing is cast between | MATCHES | - |
| 3 | Untap step locks (Stasis, Winter Orb, stun, exert) | 502.3 | `untapStep` | MATCHES | - |
| 4 | Upkeep triggers go on the stack, resolve before the draw | 503.1, 117.3a | `eachTrigger(g,'upkeep')` then `settle(g,ev)` then `emptyPool` before the draw | MATCHES | - |
| 5 | Draw step: first player skips the draw in a 2-player game | 103.8a | `beginTurn0`: `!(g.turn===1 && g.opts.onPlay)` | MATCHES | - |
| 6 | Multiplayer: starting player draws | 103.8b | Pod games set `onPlay` only when `decks.length === 2` (`runPod`, ~15463) | MATCHES | - |
| 7 | Draw-step triggers resolve in the draw step, before main-phase triggers go on the stack | 504.2, 505.4 | No `settle` between the draw and `eachTrigger(g,'main')`; both wait for the one `settle` at the end of `beginTurn0` (queue order keeps draw triggers first) | DEVIATES (log/ordering only; an item that triggers from a draw trigger resolves before, not after, the main-phase triggers, which is what the stack would do anyway) | C |
| 8 | Saga lore counter and Urza's Saga counter are added at the start of precombat main, after the draw step | 714.3b | `sagaAdvance`/`urzaSaga` after the draw, before `eachTrigger('main')` | MATCHES | - |
| 9 | Land drop: main phase, empty stack, once (plus extras) | 305.2, 117.1a | `landStep0` (only called in main 1 by `playTurn`); `landsAllowed`. Second-main land drops: `postCombat0` / `castPhase` path | MATCHES (structural: no other place plays a land) | - |
| 10 | Beginning of combat triggers resolve before attackers are declared | 507.1-507.2 | `combat0`: `combatStart` then `settle` | MATCHES | - |
| 11 | Declare attackers: tap, attack triggers go on the stack, resolve before blocks | 508.1-508.3 | `combat0`: tap, `fire` attack triggers, `settle` before `resolveCombatVs` | MATCHES for triggers that use `fire`. See #30 for the inline ones | R (see #30) |
| 12 | Declare blockers step: blockers declared, then triggers, then priority | 509 | `resolveCombatVs`: `chooseBlocks`, `afterBlocks`; no priority or trigger settle between blocks and damage in the damage code | DEVIATES: the opponent's single instant window comes after attackers, **before** blocks (`instantWindow(g.opp,ev,'combat')`); there is none after blocks | R (a "block, then trick" line never happens) |
| 13 | First-strike damage step, then regular damage step; double strike in both | 510.4, 702.7, 702.4 | `resolveCombatVs`: `steps = ['first','regular']` only when a first/double striker is present; `strikes()` decides who hits in which | MATCHES | - |
| 14 | State-based actions and triggers between the two damage steps | 510.3, 704.3 | `resolveCombatVs` removes lethally damaged creatures after each step (`leavePerm`, ~14185), but `flushLeaves` (leave/dies triggers), lifelink gain (`ll`/`llD`) and `settle` run once after both steps; the one `sba(g)` is after `resolveCombatVs` returns | DEVIATES: lifegain and "dies" triggers from the first-strike step are not on the stack before the regular step is dealt | R (rare: first strike plus a "when this dies" trigger or a lifelink-then-lethal line) |
| 15 | End of combat step: its own step with triggers; "at end of combat" | 511 | No end-of-combat step: `attacking=false`, `exileEoc`, `convertEoc`, Ragavan exile, Ring sacrifice run inline after damage in `combat0`; no trigger kind for "at end of combat" | DEVIATES / MISSING (a card that says "at end of combat" is handled by a one-off flag per card, not a step) | C-R |
| 16 | Additional combat phases: beginning of combat triggers again, new attackers declared | 500.8, 506.1 | `combat0` loop `phases`/`extraCombats` (max 6); `combatStart` is **not** run again for the extra combats (only attack declaration repeats) | DEVIATES: "at the beginning of combat" triggers (and haste enablers in `combatStart`) fire once per turn, not once per combat phase | R (extra-combat decks) |
| 17 | Extra combats come from a card that adds them after the current phase; main phases between | 500.8-500.9 | `extraCombat` effect increments `g.extraCombats`; no second main phase between combats | DEVIATES (no main phase between the combats of one batch; a "this main phase" additional combat is the same as "after this phase") | C |
| 18 | Postcombat main: triggers resolve first, then sorcery-speed play | 505.4 | `postCombat0`: `eachTrigger('postcombat')` then `settle` | MATCHES | - |
| 19 | End step: triggers then cleanup | 513.1 | `endTurn0`: many inline end-of-turn effects first, then `eachTrigger(g,'end'); settle` | MATCHES for the result; DEVIATES in order (inline effects like `sacEnd`, `exileEnd`, `returnEot`, `dash`, monarch draw run **before** the end-step triggers and are not on the stack) | C |
| 20 | Cleanup: discard to hand size, then damage wears off and "until end of turn" ends at the same time | 514.1, 514.2 | `cleanupDiscard`, then `g.eot` reset, `p.eotP/T` reset, `p.dmg=0`, `sba` | MATCHES for order. | - |
| 21 | Cleanup: if SBAs or triggers happen, players get priority and there is another cleanup step | 514.3a | One `sba` after the wear-off; no repeat; triggers it causes `settle` once in `acting` | DEVIATES (no second cleanup, so a discard that triggers, then a hand over the limit, is not discarded again) | C |
| 22 | Mana empties at the end of each step and phase | 106.4 | T-101: `emptyPool` at each step (`beginTurn`, `combat0`, `endTurn0`); end step: **only `if (g.opp)`** | DEVIATES in a solo goldfish game: pool is not emptied for the end step | C (end-step payoffs only) |
| 23 | Extra turns: each one is a full turn, any number, most recent first | 500.7 | `g.extraTurns` counter; loops `for (k<3 ...)` in `simulate`, `runMatch`, `runPod` (13711, 15220, 15441, 15457) | DEVIATES: **at most 3 extra turns in a row**, then the rest are dropped | R (Time Warp / Temporal Manipulation loops, Nexus of Fate, Final Fortune) |
| 24 | Extra-turn ordering when several are queued (last created is taken first) | 500.7 | One counter, so ordering by source is not possible; irrelevant unless two different players queue turns | MATCHES in practice | - |
| 25 | "Skip your next turn", skipped steps | 614.10 | Only `Stranglehold` (skip extra), Time Stop and Mindslaver flags; no general skip | MISSING (not used by the autopilot's decks today) | C |

## 2. Priority, the stack and who acts when (CR 117, 405, 608)

| # | Rule area | CR | What the engine does | Verdict | Impact |
|---|---|---|---|---|---|
| 26 | Active player gets priority first; both must pass in a row to resolve | 117.3, 117.4 | No priority loop. The opponent gets one decision window per event type (spell cast `stackResponses`; attackers declared; end step) and none elsewhere | MISSING | R (the opponent in a played match can never act in upkeep, draw, main phases, beginning of combat, after blockers, in the damage step, or in response to an activated ability or a trigger) |
| 27 | Sorcery-speed: main phase, stack empty, own turn | 117.1a, 307.1 | Structural: the autopilot only casts sorcery-speed things from `castPhaseInner`/`postCombat0`. `instantSpeedFor` lists flash/instant; `instantWindow` only offers those | MATCHES | - |
| 28 | Instants and flash on the active player's own turn at other times | 117.1a, 702.8 | The autopilot casts instants in main phases only (never in its own beginning of combat, after blockers, or end step). Legal, but not what a CR player can do | MISSING (a person can only act where `decide.js` asks: it has `kind:'instant'` for the two windows above) | R (flash / combat tricks after blocks) |
| 29 | Loyalty abilities: sorcery speed, once per planeswalker per turn | 606.3, 606.4 | `loyaltyAllowed`/`activateLoyalty`; Teferi, Master of Time exception implemented | MATCHES | - |
| 30 | Triggered abilities go on the stack the next time a player would receive priority | 603.3 | `fire()` queues in `trigQ` while any action is running (`acting`), `settle()` puts them on a stack and pops them | MATCHES for abilities written as triggers | - |
| 30b | ...but many triggers are applied inline when the event happens, with no stack | 603.3, 608 | Exalted, annihilator, Smaug, Alibou, Ilharg, Combat Celebrant, the Ravens, Mirror Entity, Sneak-style pumps and similar are `for`-loops in `combat0` (12696-12750) that apply the effect at once | DEVIATES | R only against a responding opponent (cannot be responded to); C in a goldfish |
| 31 | APNAP order for triggers that trigger at the same time | 603.3b | `settle()`: queue split into the active player's and the others'; the active player's are pushed first so they resolve last. Within one player the order is trigger order | MATCHES for the order. | - |
| 32 | The controller chooses the order of their own simultaneous triggers | 603.3b | Fixed (trigger order). No question in `decide.js` | MISSING | C (autopilot), R for a person with two triggers |
| 33 | State-based actions are checked every time a player would get priority, before triggers go on the stack | 704.3, 704.4 | `settle()` runs `sba` before each pop, but only when "dirty" (the table version changed or the item is not `sbaSafe`) | MATCHES (an optimisation of the same rule) | - |
| 34 | SBA list: 0 life, 0 toughness, lethal damage, deathtouch, 0 loyalty, legend rule | 704.5 | `sba()`: toughness, damage, loyalty, legend rule, life. Deathtouch damage via `p.dt`. Poison 10: `addPoison` immediate. Library draw loss: in `draw` | MATCHES; checked at each `settle`, plus inline at several effects | - |
| 35 | Spell on the stack: cast, then opponent may respond, then it resolves | 601.2, 608.2 | `castCard` pushes `spellStack`; `tryCounter` sets `pendingSpell` and `stackResponses` lets counterspells and Redirect/Hullbreaker answer; then `tryCounter0` resolves | MATCHES for spell-on-spell | - |
| 36 | Split second | 702.61 | `splitSecondSpell`: `tryCounter` returns false at once; Samut's grant checked in `canCastNow` (13847) | MATCHES | - |
| 37 | Responding to an activated ability or a trigger | 117.1, 405 | Not modelled: `pendingSpell` is spells only (stated in the code comment at 14956) | MISSING | R (Stifle-type, kill-in-response, etc. in a played match) |
| 38 | Countering and "can't be countered" | 701.5, 101.2 | `tryCounter0` / `statics.noCounter` | MATCHES | - |
| 39 | Mana abilities do not use the stack and cannot be responded to | 605.3a | All mana is produced directly by `pay` / `produce`; there is no stack for it | MATCHES | - |
| 40 | Triggered mana abilities (e.g. Mana Reflection-style, "whenever you tap a land for mana") resolve immediately | 605.4a | Handled where the land is tapped; not through `trigQ` | MATCHES (by reading, partly) | - |
| 41 | Casting a spell: cost payment order, mana abilities during casting | 601.2f-h | `castCard0`: costs computed by `effectiveCost`, paid with `pay` | MATCHES | - |

## 3. Delayed triggers and "until/at" effects

| # | Rule area | CR | What the engine does | Verdict | Impact |
|---|---|---|---|---|---|
| 42 | "At the beginning of the next end step": a delayed trigger created **during** the end step waits for the **next** turn's end step | 603.7, 603.7b | Flags (`sacEnd`, `exileEnd`, `dash`, `warp`, `returnEot`, `endFlicker`, `endReturn`, `flickering`, `liesaBack`) are read in `endTurn0`, **after** the opponent's end-step window at the top of the function, so an instant cast in that window with an end-of-turn clause would act at that same end step. **Not reproduced.** | DEVIATES (suspected) | R, rare (Flickerwisp-style effects in the opponent's end-step window) |
| 43 | Delayed trigger for "at the beginning of the next upkeep" | 603.7 | `transformNext` for Aang; `pactDue`, `echoDue` | MATCHES for the cards that exist | - |
| 44 | "Until end of turn" effects end in the cleanup step, at the same moment as damage | 514.2 | `g.eot`, `p.eotP/eotT/eotKw` reset at the end of `endTurn0` | MATCHES (but the opponent's `eotP` etc. are cleared earlier, before `eachTrigger('end')`, at the `if (g.opp) {...}` line: a trigger that checks "until end of turn" on their creature in your end step will see it already gone) | C |
| 45 | "This turn" effects crossing an extra turn | 500.7 | Reset by `beginTurn0` | MATCHES | - |

## 4. A person's ability to act in each step (what `decide.js` asks)

| Step | Can a person act? | CR | Verdict |
|---|---|---|---|
| Untap | No priority | 502.4 | MATCHES |
| Upkeep | Not at all (no decision window; triggers are answered inside `beginTurn`) | 503.1 | MISSING |
| Draw | Not at all (Sylvan Library choice only) | 504.2 | MISSING |
| Main 1 / Main 2 | Yes (the person plays through `castPhase`, `landStep`, `useAbilities`) | 505 | MATCHES |
| Beginning of combat | Only the autopilot's own hooks; no window for the opponent | 507.1 | MISSING |
| Declare attackers | Opponent: one `instant` window (`step:'combat'`) | 508.2 | MATCHES (window exists) |
| Declare blockers | None (no window after blocks) | 509.4 | MISSING |
| First-strike / regular damage | None | 510 | MISSING |
| End of combat | None | 511 | MISSING |
| End step | Opponent: `instant` window (`step:'end'`); the active person only as far as the phase function allows | 513 | MATCHES (window exists) |
| Cleanup | Discard question (`kind:'discard'`, `cleanup`); no priority | 514 | MATCHES |

## 5. Ranking (what to fix, and in what order)

Ranked by chance of changing a game's result, weighed against how many games change. "Fingerprint risk" is how likely
`tools/autopilot-fingerprint.js` changes; a goldfish fix that only touches extra turns or combats changes the fingerprint
only for decks that use those cards.

| Rank | Deviation (row) | Impact | Fingerprint risk | Notes |
|---|---|---|---|---|
| 1 | Extra turns capped at 3 (#23) | R, wrong results (a Time Warp or Nexus chain is cut off) | Low (affects only extra-turn decks) | One-number fix in 4 places: drop the cap, keep a safety limit tied to `opts.turns`; add a test with a CR 500.7 citation |
| 2 | "At the beginning of combat" runs once per turn, not once per combat phase (#16) | R for extra-combat decks (Aggravated Assault, Port Razer, Hellkite Charger lines) | Low-medium | Call `combatStart` for each phase, with guards for the haste givers that are `once` |
| 3 | No `sba` / `settle` between the first-strike and regular damage steps (#14) | R rare | Medium (touches every combat with first strike) | Insert `sba` + `flushLeaves` + `settle` between steps; Lifelink and "dies" triggers after step one |
| 4 | Delayed "next end step" created in the end-step window fires the same end step (#42) | R rare, matches only | Low | Mark delayed effects created while `g.inEndWindow` as `nextTurn`; needs reproduction first |
| 5 | Opponent's windows only at attackers and end step (#12, #26, #28) | R in matches; none in a goldfish | High | A larger change (after-blockers window is the cheapest); needs MAIN's decision, it is a feature-sized change |
| 6 | No stack model for activated abilities and triggers (#37, #30b) | R for matches only | High | Out of scope for a fix pass; record as known; propose a separate design task |
| 7 | End of combat step with its own trigger kind (#15) | C-R | Low | Add `kinds:['endCombat']` and fire it after damage; move the inline flags to it |
| 8 | Second cleanup step (#21), end-step pool emptying in solo (#22), `eotP` cleared early for the opponent (#44), draw-step settle (#7), order of inline end effects (#19), APNAP ordering choice (#32) | C | Low | Small and independent; do last |

## 6. Proposed fix order (Phase 2, after MAIN's go)

One fix per commit, each with a test in `tests/engine/timing-<name>.test.js` citing its CR rule; after each: the whole engine
suite passes, the every-default sweep reports bad 0, and `tools/autopilot-fingerprint.js` is identical or every changed line is
explained.

1. #23 Extra-turn cap (CR 500.7). No exported name changes.
2. #16 Beginning of combat for each combat phase (CR 506.1, 507.1).
3. #14 SBAs and triggers between first-strike and regular damage (CR 510.4, 704.3).
4. #42 After a reproduction test: the next end step for a delayed trigger created in the end step (CR 603.7).
5. #15, #21, #22, #44, #7 as a "small timing" batch, each its own test.
6. #12 / #26 / #28 / #37 are not fixes. They are a design: a priority loop. I propose a separate task if the user wants it.

Not changing: anything that makes a decision for a person who is not asked; any exported name (`sim.js` exports,
`decide.js` question kinds); `version.js`; the `VERSION` line in `sw.js`.

## 7. Phase 2 results (MAIN's go: items 1-5 of section 6)

Each fix is its own commit with a test in `tests/engine/timing-*.test.js`. After each: full engine suite all ok, every-default sweep
`bad 0`, fingerprint compared with the v217 base (`4bd97b95...`).

| Fix | Row | CR | What changed (`sim.js`) | Test | Fingerprint |
|---|---|---|---|---|---|
| 1 | #23 | 500.7 | The `k < 3` limit on extra turns in `simulate`, `runMatch` and both pod loops is now `EXTRA_TURN_LIMIT` (40), a loop guard. Before, a banked extra turn past the third was put off to a later turn, or lost when the game ended. | timing-extra-turns | identical |
| 2 | #16 | 506.1, 507.1 | `combat0`: from the second combat phase on, `eachTrigger(g,'combat')` and `settle` run at its start. The haste and tap effects in `combatStart` still run once per turn (not changed). | timing-combat-phases | identical |
| 3 | #14 | 510.4, 704.3 | `resolveCombatVs`: when there are two damage steps, after the first one: `flushLeaves`, lifelink gain for both sides and `settle` (so dies triggers resolve before the regular step). | timing-first-strike-step | one game changes: red-rum-raiders vs second-breakfast, seed 285095 (same winner, same turn; final lives 22 / -1 instead of 39 / -18; consistent with a lifelink-gain drain now killing at the end of the first-strike step instead of after the regular one; the card was not identified) |
| 4 | #42 | 603.7, 603.7b | `endTurn0`: the lists `endFlicker` and `endReturn` are taken at the top of the function; what is added during the end step (the window, a sacrifice) waits for the next turn's end step. | timing-next-end-step | identical to fix 3's |
| 5a | #21 | 514.3a | `endTurn0`: after the cleanup `sba`, `settle`, then discard again while the hand is over the limit (at most 5 rounds). | timing-cleanup | identical to fix 4's |

Not changed in the small batch, with the reason:
- #22 (solo goldfish: pool not emptied at the end step): `endTurn0` already empties the pool when the second main phase ends, so a pool
  is empty at the end step unless mana is made during the end step itself. No observable case; left alone.
- #7 (no `settle` between the draw step and main-phase triggers): the queue order already resolves draw triggers first; no observable
  difference found; left alone.
- #44 (the opponent's until-end-of-turn effects cleared before end-step triggers): looks deliberate and no test needs it; left alone.
- #15 (end of combat step with its own trigger kind): a feature (new kind in the parser), not a fix; left for a decision.
- #12, #26, #28, #37: the priority loop. A separate decision for the user (MAIN is asking).
