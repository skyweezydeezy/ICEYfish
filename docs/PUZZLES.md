# Puzzle tab (T-115)

The user's brief: *"set up a scenario where you can complete a 2 to 3 turn win, but you have to play the actual cards correctly. You don't know what the other person has... You also have more difficult scenarios where you're at the end of a game and you have to make the right choices to be able to finish the game... Easy to medium to hard... All of these should teach you some basic functions on how the cards work."* It replaces the turn-2 puzzles of T-096 (`docs/TURN2-PUZZLES.md`).

## What a puzzle is

| | Fast win | Endgame |
|---|---|---|
| Start | turn 1 of a real game, a seven-card hand | a late position (turn 9–10), a board on both sides, life totals, graveyards, your hand |
| Win | by the end of your turn 2 or 3 | this turn |
| Difficulty | how hard the sequence is to see | the same |

The hidden opponent is a real engine seat (`G.linkMatch`), its hand never shown (only a count) and scaling with the level:

- **Easy** — it only blocks; its hand is empty.
- **Medium** — one hidden piece of interaction (a counterspell).
- **Hard** — a full hidden hand that plays back: counters on your key spells, removal in response, its own turns played by the autopilot (it casts instants, such as Swords to Plowshares, at the end of your turn).

Its habit is the T-096 one: it counters or answers the first thing it legally can. The engine decides what is legal (targets, free counters, the stack).

A wrong play plays out. The game ends when the deadline turn is over, when you are out of life, or on **Give up**. After a loss: **hints** (three, one at a time, saying what to look at, never the line) and the **lesson** behind an ⓘ (also after a win): the mechanic and a short rules explanation. The page never shows a solution. Progress, the streak, the best streak, solves with no hint and the hints used are kept in `localStorage` key `isf_puzzle2`.

## The twelve

| id | type / level | title | mechanic | cards |
|---|---|---|---|---|
| fast-1 | fast / easy | Rocks before the dragon | mana sequencing, choosing how to pay | Sol Ring, Chrome Mox (imprint the Bolt), Lotus Petal: six mana sources for the five-mana Goldspan Dragon, so the pay sheet asks (opponent at 4) |
| fast-2 | fast / easy | Dorks and colours | summoning sickness, coloured mana | Llanowar Elves, Elvish Mystic, Goldspan Dragon |
| fast-3 | fast / medium | Feed the counterspell | baiting a counterspell, ordering a combo | Demonic Consultation then Thassa's Oracle (library of 5), hidden Force of Will, Ornithopter as the bait |
| fast-4 | fast / medium | Nothing left to draw | winning by drawing from an empty library | Jace, Wielder of Mysteries +1 with 2 cards left, on the draw, hidden Counterspell, Ornithopter as the bait |
| fast-5 | fast / hard | Draw from nothing | replacement effects, order of the pieces | Demonic Consultation, then Laboratory Maniac, then Brainstorm (library of 7), hidden hand with Counterspell and Mana Drain |
| fast-6 | fast / hard | The loop | triggers and their order | Vito + Bloodthirsty Conqueror, then Cauldron Familiar as the spark; Sol Ring and Dark Ritual for the mana |
| end-1 | endgame / easy | Through the deathtouch | trample and deathtouch | Wurmcoil Engine, Kenrith's {R}: trample |
| end-2 | endgame / easy | Dragons in pairs | double strike | Atarka, World Render, hasty Goldspan Dragon |
| end-3 | endgame / medium | Pump the hydra | spell order against a counterspell | Kalonian Hydra, Berserk, hidden Counterspell |
| end-4 | endgame / medium | Clear the way | removing a blocker before combat | Lightning Bolt + Swords vs a hidden Force of Will |
| end-5 | endgame / hard | Count their counters | baiting two counterspells with limited mana | four mana, two cheap baits, Berserk |
| end-6 | endgame / hard | On the stack | responding on the stack | Berserk on the stack, Vines of Vastwood and Blossoming Defense against two removal spells |

**Opponent life (user's "mix both", 2026-11-26):** the easy fast wins keep a low starting life (7 and 4, shown on screen); the medium and hard fast wins start the opponent at 40 and end four different ways (T-117). **There is no Go off button**: the person casts every piece, so the order of the pieces is part of the puzzle, and wrong orders are among the wrong lines the tests prove lose. The small libraries (5, 2, 7 cards, `exactLibrary` in the data) are stated in each premise: the engine names the card for Demonic Consultation itself, so the library has to be small for it to empty it. Endgames are unchanged.

Every card is `full` in the engine's coverage (the test checks it) and almost all come from the built-in decks.

## How it is built and checked

- `goldfish/static/puzzles.json`: the data (hand-built; `tools/puzzle-search.js` helps with design). Each puzzle: `me` and `opp` seat specs (life, turn, lands, battlefield, hand, graveyard, library order), `deadline`, `solution` (a line), `wrong` (tempting lines that must lose), three `hints`, a `lesson`.
- `goldfish/static/puzzle-core.js`: `makeSeat`, `newScenario`, the moves (`land`, `cast`, `ability`, `attack`; a move can carry `picks` for the engine's target questions and `resp` for the instants it casts in response to the opponent's spells) and the turn steps (sync for tests, async for the page). The T-096 functions (`makeOpp`, `newMatch`, `play`) stay for `tools/turn2-vs-interaction.js`.
- `tools/lib/puzzle-search.js` and `tools/puzzle-search.js`: replay a puzzle's solution and wrong lines, and (`--search`) find every winning line within a move limit.
- `tests/engine/puzzles.test.js`: the intended line wins with every move legal, every wrong line does not, a replay is the same game, coverage is full, hints do not give the line away. `tests/ui/puzzles.ui.js`: the tab, a loss with hints and the lesson, a win, a three-turn win, phone and tablet.

## Findings for MAIN

1. **Combat is atomic.** `D.turn.combat` declares attackers and blocks and deals damage in one call, so a person cannot cast a trick after blockers. The puzzles therefore use what happens before combat (removal, protection, evasion, haste, trample). "Pump after blocks" is not a puzzle yet.
2. **Removal in response to a creature spell is wasted by the engine's opponent**: with Swords to Plowshares in hand it casts it in response to the creature spell (no target yet), where a real player would wait. It uses removal properly at the end of your turn (see fast-6) and in response to a spell that targets a creature (end-6).
3. **Mana Tithe (sim.js, not changed):** when the person can pay the {1}, the opponent's Tithe is neither cast nor spent: it stays in its hand and its Plains stays untapped (a one-spell run: Sol Ring with a spare land). So tax counters are not used as the hidden piece.
4. Blightsteel Colossus (twelve mana) fills the libraries, so draws are dead cards and never change a puzzle.
5. Multi-turn endgames are chaotic (the opponent steals a lifelinker with Hellkite Tyrant and so on); the endgames here are one turn.

## Paying and the phone layout (T-119)

- **The pay sheet is never skipped.** The page used to answer every payment question with the engine's default (`'auto'`), so a person could not choose sources or colours. Now any payment with more than one way (the engine only asks then) opens T-099's pay sheet, even if the Display setting "Choose how I pay mana" is off (puzzle.js turns it on for the question only). Rocks before the dragon was changed so that the intended line really asks: Lotus Petal gives six sources for Goldspan's five mana, and the person taps which five.
- **Proof that a person can follow each line** (`tests/engine/puzzles.test.js`): every intended line is replayed with the payment a person gets by pressing Confirm (the sheet's starting payment), and with every other way of paying at each question (one at a time, the rest on the default); the numbers are printed. The UI test pays for Goldspan Dragon by tapping the sheet.
- **Layout** (`tests/ui/puzzles.ui.js`): 320, 360, 375, 390, 414 and 430 px wide in portrait and landscape, and an iPad both ways: no sideways scroll, nothing clipped (text, buttons, hand, hint and lesson boxes), every tab visible. Two fixes outside the Puzzle files, in `styles.css`: up to 430 px the eight tabs are two rows of four (the Puzzle tab was off the screen at 320 and cut off at 390); between 901 and 1100 px (a phone sideways) the tab bar takes its own row. The played tables (Duel, Pod, Practice) keep their one-line bar, which scrolls sideways there, because their one-screen layout has no room for a second row.
