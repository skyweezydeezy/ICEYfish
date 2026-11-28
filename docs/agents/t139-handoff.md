# Handoff: T-139 honest coverage (card-teaching session, branch claude/t139-honest-coverage)

**Role:** TASK (card teaching), Sonnet/medium. Reports go to MAIN (session id in CLAUDE.md; MAIN 4 `session_01K5kL4X71yAbkpEVcRH5Z38` at the time of writing).

## What exists
- `parseEffectsWhole()` in sim.js: the generic loyalty fallback and the generic `{cost}: effects` activated fallback read `ok` only when every sentence is read (a sentence counts when adding it changes the parsed effects, or it gives its own effect; "then ..." joins the one before; known absorbed sentences are excused in `absorbs`). Else `partial`. Effects are identical to `parseEffects`, so play only changes through cards taught on top.
- "Activate only ..." conditions (`parseActOnly` / `actOnlyWhy`, field `only`), "costs {N} less for each <type>" (`lessPer`, `abCost0`), real -X loyalty (`pwXAuto`/`pwXPick`, only for burnCreature/sweepDamage X), restricted mana fx (`restrictMana`, kinds noncreature/planeswalker), many one-card fx (see tests t139-*).
- Live: batch 1 (v234), batch 2 (v235). Batch 3 (PR #210, v236?), batches 4 and 5 on the branch (caaa233 at hand-over).

## How to see what is left
`node tools/engine/t139-snapshot.js out.json` snapshots every card's line statuses (git-stash or use the v231 snapshot in a worktree to compare: `git worktree add --detach <dir> 0d8cb76`, run the snapshot there into base.json), `node tools/engine/t139-snapshot-diff.js <dir with base.json and new.json>` lists ok/neutral -> partial lines, `node tools/engine/t139-lines.js "Card name" ...` prints a card's non-ok lines. About 34 lines on 33 cards remain (v231 ok -> partial).

## Left (see the reports to MAIN)
- Planeswalkers: Aetherspark +1, Estrid -7, Jaya -8, Will Kenrith (+2, -2, -8), Tamiyo Field Researcher +1, Tamiyo Inquisitive Student's third-draw transform, Tevesh Szat -10, Tezzeret Cruel Captain -7, The Eternal Wanderer +1.
- Activated: Den of the Bugbear, Oviya, Stitcher Geralf, Loreseeker's Stone, Xantcha, Pendant of Prosperity, Capricopian, Alaundo, Yes Man, Luck Bobblehead, Humble Defector, Eden, Jeweled Amulet, General's Enforcer, Tyrite Sanctum, Lion Sash, Goro-Goro, Ashling, Druidic Satchel, Deepwood Denizen, Kami of Jealous Thirst, Izzet Generatorium, Hithlain Rope, Minas Morgul, Dalkovan Encampment, Nylea Keen-Eyed, Agatha's Soul Cauldron, Throne of Eldraine.
- Triggers and spells: not touched (MAIN: separate task with a better sentence reader).

## Gotchas
1. A `//` comment in the middle of a one-line rule swallows the rest of the line: put comments at the end.
2. Specific rules go in the loyalty chain before `parseEffectsWhole(pwt)` (the last `:` alternative) or in the `ACT(...)` block (activated). A generic rule earlier in the chain can swallow a line: check `coverage` after each rule.
3. Planeswalker double-faced cards: the loyalty abilities are on `card.a.backCard`.
4. Every-default sweep: a person's default must be the autopilot's pick (use `askUse` with the autopilot's choice as the default). Run `node tools/every-default-sweep.js`, the fingerprint (`tools/autopilot-fingerprint.js <root> <out>`) against live, then the full suite as a background job; do not edit sim.js while it runs. Never `rm` with an unquoted shell variable (the safety check blocks it).
5. `fetch-sets.js --report` and `build-fuzzy-index.js` after each batch; commit only the changed set files plus index.json and docs/SETS.md.
6. Never edit version.js or the VERSION line in sw.js. Report to MAIN in the CLAUDE.md TASK form, merge live first.

## Infrastructure each hard planeswalker line needs
- Aetherspark +1: attach a planeswalker to a creature (`attachedTo`, as an Equipment), "can't be attacked while attached", and a combat-damage watcher on the equipped creature that adds that many loyalty counters during your turn.
- Estrid -7 (and -1 Mask token): Aura tokens with enchant permanent + umbra armor; -7 returns non-Aura enchantments, then Auras (each Aura needs a legal attach target, chosen by you).
- Jaya -8: an emblem letting you cast instants and sorceries from the graveyard, exiled instead of going to the graveyard afterwards (look at flashback / `wrennEmblem` for the cast-from-yard path).
- Will Kenrith +2 (base 0/3, lose all abilities until your next turn: needs a timed base-P/T and ability-loss flag), -2 (draw two + target player's instants/sorceries/planeswalkers cost {2} less until your next turn: timed cost reduction), -8 (emblem: copy each instant/sorcery you cast; the stormCopy path in `copyHook` is the model).
- Tamiyo, Field Researcher +1: until your next turn, a draw whenever either chosen creature deals combat damage (a timed combat-damage watcher on two creatures).
- Tamiyo, Inquisitive Student: "when you draw your third card in a turn, exile her and return her transformed" (a draw counter per turn plus the transform path used by `a.transformAbility`; the -7 and the back face are done).
- Tevesh Szat -10: gain control of all commanders (yours and other players') and put them from the command zone onto the battlefield (steal path `stealPerm`, command zone entry).
- Tezzeret, Cruel Captain -7: an emblem with a beginning-of-combat trigger (three +1/+1 counters on a target artifact; a non-creature becomes a 0/0 Robot creature): the engine has no emblem triggers yet, only static emblems in `g.emblems`.
- The Eternal Wanderer +1: exile an artifact or creature, return it at the beginning of THAT player's next end step (an opponent's permanent returns on their turn: per-owner delayed return, not `g.endReturn`).
