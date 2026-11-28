# MAIN (Visuals) handoff: MAIN 3 -> MAIN 4 (2026-11-28 ~17:15 UTC)

MAIN 3 = session_01K5kL4WCRt94PhekjADso9A (context passed 600k; hand over per CLAUDE.md). Read this, CLAUDE.md and PROJECT_STATE.md (both on claude/main-coordination), then check them against the repository.

## State at handover
- **Live: Version 234** (PR #208, e352dbf, Pages green). No merge running, no PR open from MAIN. Default branch: claude/visual-goldfish-calculator-1ztks5.
- Today's releases: v222-v234 (priority loop stages, full priority on in v229, Sorin, Blood Bank, Master of Dark Rites, tabs, swipe, top of library, Ajani, Chandra (Teach #205 closed), T-139 batch 1). Details in PROJECT_STATE section 3.
- Fingerprint (autopilot-fingerprint.js) on live: e8fb0aebb0bba4bcef5b91b9d8971c20.

## First actions for MAIN 4
1. **Update the MAIN session id at the top of CLAUDE.md** (the "Visuals session" id, two places) to MAIN 4's id, in MAIN 4's first release. CLAUDE.md lives on the default branch, so it ships with the next merge. MAIN 3 already messaged every active session with MAIN 4's id.
2. The hourly Teach watch (trig_01LCRJ6VtDu526QoprLEiQK7, at :11) was re-pointed to MAIN 4 by MAIN 3. Check with get_trigger.
3. **Archive MAIN 3** (session_01K5kL4WCRt94PhekjADso9A) once you're running. Nothing of it is unmerged.

## Active sessions (all Sonnet/medium except the Haiku watcher)
| Session | Id | Task | Branch | Waiting on |
|---|---|---|---|---|
| Priority 2 | session_01K5kL4X9kBh8mMDZ2MUAbap | T-132 targets for triggered/activated abilities on the stack (CR 602.2b/603.3d/608.2b) + duel-floating seed fix | claude/t132-ability-targets | its report |
| Card teaching 13 | session_01K5kL4YTDSHuWHUJbt2CUeA | Teach requests (top of queue); idle | claude/card-teaching | next Teach |
| Card teaching 14 | session_01K5kL4XWcYXzPf9SUAPRE4v | T-139 part 2: remaining planeswalkers (alphabetical, ~10/batch) then other activated partial lines (74 lines/69 cards partial after v234) | claude/t139-honest-coverage | batch reports |
| T-134 | session_01K5kL4ZFCuNEbw5TYo8Ls98 | step 2: tap -> viewer with actions on Practice/Duel/Pod (replaces T-102 select sheet), question-sheet cards (stack, targets, options) open the viewer (user screenshot docs/briefs/t134-stack-card-not-selectable.jpg); then step 3 Mulligan/Build/Simulate | claude/t134-tap-expand | step 2 report (rewriting old UI tests) |
| T-137 | session_01K5kL4X2fXkUeJBKhNxqX1n | fastest-win replay: standard opponent Second Draw (B3), two-stage search, rarity, Find button, SHELL entry, no-kill-line guard. PR #203 draft. | claude/t137-fastest-kill-replay | **re-run tools/fastest-kill.js after T-140 is live** (tell it the version) |
| T-140 | session_01K5kL4Xbi8kZvreAsvKoZxg | combo/mana legality audit: Mox Amber all colours, infiniteMana() startup cost, Underworld Breach no-payoff win, comboLines T2 wins | claude/t140-combo-legality | report; may report items 1-2 first |
| Deck Brackets 3 | session_01K5kL4YcBh9ANfXmUy98ymh | new/changed Drive decks (deck files only, bracket check) | claude/decks-* | next Drive change |
| Drive watcher | session_01K5kL4XUL7zSv8xpcZtpdkL | hourly Drive check, both ManaBox folders (1CwIo9I4bXXajMJ5F3Koj1zjb5VOwzn7Y, 1kMuwQfee162UNJc9MW1NIZkkMCVbF2yJ) | - | - |
| T-133/T-138 | session_01K5kL4WQAKjGVM4hR6jeABs | done (live v231/v233); can archive | - | - |
| T-131 | session_01K5kL4VXstP7B9p1WJaVHvU | done (live v227); can archive | - | - |

## Open items
- T-120 ticket endpoint: waits for the user's Apps Script /exec URL (docs/briefs/ticket-endpoint-setup.md). Then set `endpoint` in goldfish/static/ticket-config.js, release, send a test ticket.
- Rules roadmap docs/briefs/rules-roadmap.md (standing direction: work through it until all rules are applied): 1 T-132 active; 2 remaining abilities onto the stack; 3 layers (613); 4 replacement effects (614-616); 5 APNAP (101.4); 5b honest coverage for triggers/spells (after T-139); 6 review pass.
- UI tests still unseeded (T-138 list): abilities, atraxa-end, combat-readout, compact, crisp-strip, decisions, duel-loop-phone, duel-steady, hand-overflow, imprint*, layout, loop, matfit, printings-everywhere, proliferate-choice, rift, sound, step-strip, sylvan-library, turn-timer, versus*, versus-fit. Pin (`require('../ui-seed').pin(page)`) the ones that flake.
- Ranking (T-126) withdrawn by the user; tooling stays on claude/deck-brackets.

## Owner decisions today (all in PROJECT_STATE section 2)
Primary goal: "make me/users better Magic players. I need to know every interaction thoroughly accurately." Full priority on (v229). Ranking cosmetic, off. Copyright: SWD Marketing, all rights reserved. Fuzzy guess setting (off by default). Tap a card anywhere -> viewer with actions + prices/printings kept; swipe through neighbours. Top of library playable. Tabs two rows of four everywhere. Fastest-win replay vs a real deck: standard B3 opponent, two-stage, interactive wins preferred, rarity shown. Teach requests to the top; the user tested the pipeline with #205 (done).

## How MAIN 3 released (keep doing this)
Build a local branch from live, merge the task branches, add a whatsnew.json entry (v = live + 1), run `node tests/run.js` (full), `node tools/every-default-sweep.js` (bad 0), `node tools/autopilot-fingerprint.js <root> <out>`, the UI files the change touches (`--jobs 1`), push claude/merge-vNNN, draft PR then ready, push-notify, wait ~14 min, check 4 runs green, merge (merge method "merge", expectedHeadSha), unsubscribe, poll raw version.js, check the Pages run, push-notify live, record in PROJECT_STATE. If set data changes in a merge, run `node tools/build-fuzzy-index.js` (and `node tools/fetch-sets.js --report` when engine coverage changed). Don't trust a UI failure seen once in a long batch: re-run the file alone and on live before blaming a task.

## Gotchas
- phone-card-tap/ipad-card-tap totals: 123/68 are the full counts (seed 10 reaches them).
- watch-replay (T-137) times out in parallel; run with --jobs 1.
- Two "ManaBox" folders in Drive.
- When a teach changes set data, conflicts in data/sets/*.json and index.json are generated files: take one side, then regenerate with fetch-sets --report and build-fuzzy-index.
