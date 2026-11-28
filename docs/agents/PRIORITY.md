# T-127 priority loop: handoff note (stage 3 done, stages 4-6 left)

- **Role:** TASK (engine). MAIN is `session_01K5kL4WCRt94PhekjADso9A`. Previous owner: the T-122 session (`session_01K5kL4Xj9s2zPfWBcUnFCcS`), which also did the timing audit (`docs/TIMING-AUDIT.md`, accepted at 6c9f14a).
- **Read first:** `CLAUDE.md`, `PROJECT_STATE.md`, `docs/PRIORITY-DESIGN.md` (sections 1-10 the design, 11 stages 0+1, 12 stage 2, 13 stage 3), this note.
- **Branches (each built on the one before; MAIN merges in order):** `claude/t127-stack-0-1` @ 3e475e4 (accepted), `claude/t127-stack-2` @ ffc6726 (accepted), `claude/t127-stack-3` (stage 3, see the report to MAIN for the commit).

## What exists now

- One stack per table: `tableStack(g)` (`g.match.stack`, or `g.stack` in a goldfish game). `castCard` pushes `{kind:'spell'}`; `settle` pushes `{kind:'triggered'}` objects above its own `base`. `trigQ` is the list of triggers waiting to go on. `stackView` reads the stack.
- `priorityRound(g, step, ev, over)`: off unless `opts.priority`; skipped at once when nobody is seated (`ps.some(p => p.ask)`); only a seated person acts (question kind `priority`, default Pass). `over = {controller, text, card}` lets it run with an object on the stack (step `'stack'`, called from `settle` before each trigger resolves). `wantsPriority` implements `opts.autoPass` ('smart' default, 'stops', 'never', 'always').
- Hooks (inert unless `opts.priority`): end of upkeep, draw, main phases (once a turn), beginning of combat, after blockers, after damage, end of combat, before each trigger resolves. The declare-attackers and end-step windows are `instantWindow`, which asks the `priority` question when the rule is on.
- `autoRespond(g, d, inst, ev, ps, by)`: the autopilot's responders to a spell (caster's veil, `stackResponses`, `tryCounter0`), called from `tryCounter`. `queueRun` queues hand-played triggers (Boromir, Archaic) that `settle` runs (`it.run`).
- `opts.priority` is ON by default since stage 6 (`priority: false` or `ISF_PRIORITY=0` turns it off). `ISF_PRIORITY=1` turns it on for every game that does not set `priority` itself (so the whole suite runs with the rule on: `ISF_PRIORITY=1 node tests/run.js`). `PRIORITY=1 node tools/every-default-sweep.js` is the sweep with the rule on and a question at every step.

## Gate for every stage (all must hold)

1. Rule OFF: `node tests/run.js` all ok; `node tools/every-default-sweep.js` bad 0; `node tools/autopilot-fingerprint.js $PWD out.txt` hash **b8ce7c978cde92903e43f579873e1ffe** (identical); `node tools/bench.js` total within +20% of **92.19 s** (goldfish 89.07, match 2.25, pod 0.87), hash 4af5e7cc64596611d9db4df7703ec5e0.
2. Rule ON: `ISF_PRIORITY=1 node tests/run.js` all ok; `PRIORITY=1 node tools/every-default-sweep.js` bad 0; `ISF_PRIORITY=1 node tools/bench.js` within +20%.
3. A CR-cited test per behaviour in `tests/engine/priority-stageN.test.js`; a README row.
4. Run the benches alone (the machine's other jobs distort them). Do not edit `sim.js` while a suite runs.

## Left to do (design section 8)

- **Stage 4, activated abilities on the stack.** `useAbility` runs `it.run(ev)` (pay + effect in one closure). Split the declarative ones (`a.activated`: cost, tap, fx) into pay-at-activation and resolve-on-pop, then the hand-coded closures only where a seam exists; keep a count of what is still legacy. `queueRun` + `it.run` in `settle` is the mechanism to resolve a pushed object. Respond to an ability = `priorityRound(g, 'stack', ev, {controller, text, card})` between push and pop.
- **Stage 5, autopilot responses at the blockers and damage hooks** (today only a seated person acts there); an `endCombat` trigger kind (audit row 15); first-strike step hook (T-122 fix 3 already ends the step).
- **Stage 6, on by default** (`opts.priority` default true), then MAIN re-brackets the built-in decks (`tools/verify-brackets.js`).
- UI session (separate): a sheet for kind `priority` in `choices.js`; `versus.js` lines ~301/310 test `q.kind === 'instant' && q.step === 'end'` (the end-step flag) and must also accept `'priority'`.

## Gotchas learned

- A seated person's `ask` is replayed on copies by `decide.js` (`clonePod` deep-copies everything, including the stack). Never keep per-game state on the game object that only a played copy would set (the sweep compares dumps): use a WeakMap (`PRIO_MAIN`).
- `fire()` runs a trigger immediately when no action is open (`actingHost(g)` is null); tests that need a queued trigger must act inside `castPhase`/`castOne`, not a bare `castCard`.
- Puzzle code answers `priority` with pass, and the hidden opponent only in the old windows (`puzzle-core.js` `defaultAnswer`/`answerFor`, `puzzle.js` `answer`).
- `tune-pool-failure.test.js` sets `priority: false` because its worker runs in a vm context that cannot see `ISF_PRIORITY`.
- The design's claim that cast triggers changed deck results was overstated: Young Pyromancer's token already came before Bolt's damage with the rule off.
