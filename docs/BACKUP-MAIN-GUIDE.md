# Backup MAIN guide: how to run ICEYfish when Claude is offline

This guide is for **ChatGPT (or any other assistant, or a person)** taking over the coordinator job, called **MAIN**, that Claude does for the
ICEYfish project. It is self-contained. Read it once in full. Section 9 is a prompt you can paste into ChatGPT as its instructions.

The repository is the record. `CLAUDE.md` holds the rules, `PROJECT_STATE.md` the current state and `docs/agents/*.md` the notes for each
area. When this guide and those files disagree, **the files win**: they are kept up to date, and this guide is a summary written on 2026-11-24.

---

## 1. What ICEYfish is

- A Magic: The Gathering **Commander goldfish simulator** that runs in the browser: build a deck, mulligan, practice, simulate thousands
  of games, see the odds, play AI opponents (Duel / Pod) or a friend.
- **Live site:** https://skyweezydeezy.github.io/ICEYfish/ (the version number is in `version.js` there and in the app's top bar).
- **Repository:** `skyweezydeezy/ICEYfish` (the old name `skyweezydeezy/Goldfish-` redirects to it).
- **Default (live) branch:** `claude/visual-goldfish-calculator-1ztks5`. Every merge into it deploys the site, and the "Deploy to GitHub Pages"
  workflow adds a commit "Version N" that raises `goldfish/static/version.js` by 1.
- **MAIN's work branch:** `claude/main-coordination`. MAIN merges finished work here, tests it, then opens a pull request to the default branch.

Main files:

| Area | Files |
|---|---|
| Game engine (rules of every card, the autopilot) | `goldfish/static/sim.js` |
| Questions a person is asked in a game | `goldfish/static/decide.js`, `choices.js` |
| The app (tabs, screens) | `goldfish/static/app.js`, `index.html`, `styles.css` |
| Deck tuner, Policy lab | `goldfish/static/tune.js`, `worker.js` |
| Combo odds and Commander Spellbook data | `goldfish/static/combos.js`, `data/combos.json` |
| Play a friend (WebRTC only, no relay) | `goldfish/static/remote.js` |
| Built-in decks | `goldfish/static/decks/*.txt`, `index.json`, `drive-sync.json` |
| Card database by set | `goldfish/static/data/sets/*.json`, `docs/SETS.md` |
| Tests | `tests/engine/*.test.js`, `tests/ui/*.ui.js`, runner `tests/run.js` |
| Tools | `tools/verify-brackets.js`, `tools/import-decks.js`, `tools/fetch-sets.js`, `tools/every-default-sweep.js`, `tools/build-deck-index.js` |

---

## 2. The user's standing rules (summary of CLAUDE.md, which is the authority)

1. **One coordinator (MAIN).** Other workers each do one bounded task and report back. Only MAIN edits `PROJECT_STATE.md` and merges.
2. **Standing yes to merge.** When finished work has passed MAIN's tests and all 4 GitHub checks are green, MAIN merges it into the
   default branch without asking again. MAIN tells the user when a merge **starts**, and again when it is **live with its version number**
   (or when it fails). The user reads these on their watch, so keep them to one short line.
3. **Merge first, then task.** Finish any pending merge, and wait until it is live, before giving anyone new work.
4. **Teach requests go to the top of the queue.** A GitHub issue titled "Teach: …" (from the app's "Teach these cards" button) is done
   before everything else and merged on its own. It is done only when every line of those cards reads 'ok' or 'neutral' in the app's coverage
   rating. Then comment "Live in Version N" on the issue and close it.
5. **Every new built-in deck is bracket-checked** with `tools/verify-brackets.js` before it is added: 20,000 goldfish games, a round robin
   against every built-in deck, and the official Commander Brackets card rules. The verified bracket is the higher of the card floor and the
   speed bracket. The deck file gets that bracket line plus a "// Checked by ICEYfish" line. The Drive bracket stays in `drive-sync.json` as
   the user's claim. A deck whose cards change is re-checked.
6. **Engine card-rules batches** (branch `claude/engine-rules`) are merged five at a time. Fixes the user asks for merge at once.
7. **Never edit** `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js` by hand.
8. **Design:** "Less is more." Show headers and key numbers and fold the rest. Explanations go behind the ⓘ toggle. Each tab name is one
   word: Build, Mulligan, Practice, Simulate, Odds, Duel, Pod.
9. **Workers run on a mid-size model at medium effort** (for Claude this is Sonnet). Only MAIN uses the strongest model.
10. **Archive an old worker session as soon as a new one takes over its work.**
11. **Long sessions hand over** at about 60% of their context: they write a note in `docs/agents/<name>.md`, push it and stop.
12. **Token budget:** the user prefers effort spent on fixing errors and on Teach requests first.
13. **Privacy:** never put the user's email or personal details into commits, issues or messages to outside services. Never commit secrets.

---

## 3. The daily loop (what MAIN does, in order)

1. **Check for Teach issues** (hourly): open issues whose title starts with "Teach:". If any is new, assign it first (section 5) and record it.
2. **Read reports** from workers (format in section 6). For each one:
   1. **Read the diff yourself.** Compare the commit it started from with the live branch.
   2. **Review it independently** (checklist in section 7). For engine changes, check the real Magic rules.
   3. **Decide.** If there is an important bug (wrong game result, crash, endless loop, wrong player, data loss), **hold** it and send the
      worker the fix, with file:line and a concrete failing scenario. Minor findings go to the worker as follow-ups; they don't block.
3. **Integrate:** merge the worker's branch into `claude/main-coordination` (it should already contain the live version). Resolve conflicts
   by what the behaviour should be, not by taking the newer file. The set data under `data/sets/` conflicts often: keep each side's real
   changes hunk by hunk, then check that `node tests/run.js sets` passes.
4. **Test** (section 4). Add the What's new entry to `goldfish/static/whatsnew.json`, newest first, with
   `"v": <live version + 1>` and one or two plain sentences. Record the task and its tests in `PROJECT_STATE.md` as "Expected Version N".
5. **Open a pull request** from `claude/main-coordination` to `claude/visual-goldfish-calculator-1ztks5`. Tell the user the merge started.
6. **Wait for all 4 checks** (2 × "engine", 2 × "windows"; about 8–12 minutes).
   - **Green:** merge it (use a merge commit).
   - **Red:** read the failing job's log and find the root cause. One re-run is allowed only if the failure is clearly timing or
     infrastructure, and a second identical failure is a real problem to fix. Never skip or weaken a test to get green.
7. **Confirm live:** fetch `https://skyweezydeezy.github.io/ICEYfish/version.js` until it shows N, then tell the user "Version N live: …".
8. **Close the loop:**
   - Tell the worker its task is live.
   - Mark the task `[V] Verified, vN (PR #x)` in `PROJECT_STATE.md` and push.
   - Close superseded draft PRs.
   - Comment on and close the Teach issue, if there was one.

---

## 4. Commands (run from the repository root; Node 22)

```
node tests/run.js                          # the whole engine suite (~210 files, ~6–10 min); GitHub runs this too
node tests/run.js <name> [<name> ...]      # only some engine tests, e.g.  node tests/run.js combo-odds tune
node tests/run.js --ui --jobs 2 <name>     # browser tests (Playwright/Chromium), e.g.  --ui deck-menus combo-play
node tools/every-default-sweep.js          # plays every built-in deck with every question answered by default; must say "bad 0"
python3 -m pytest -q tests/launch          # when start.bat / the updater / server files change
node tools/verify-brackets.js --only=<deck-file-without-.txt>   # bracket-check one deck (20,000 games + round robin)
node tools/verify-brackets.js --apply      # write the verified bracket lines into the deck files
node tools/import-decks.js <folder>        # import ManaBox .txt lists (from the Drive folder); then node tools/build-deck-index.js
NODE_USE_ENV_PROXY=1 node tools/fetch-sets.js --import-builtin  # add missing cards of the built-in decks to the set data (Scryfall)
```

Which tests to run for a change:

- **sim.js / decide.js changed:** the full suite, the sweep (bad 0), and the touched UI tests (`decisions`, `abilities`, `loop`, etc.).
- **App UI only:** the UI tests of that screen, plus engine tests for anything shared.
- **A new deck:** `decks`, `deck-brackets`, `brackets`, `builtin-decks`, `sets` and the `deck-menus` UI test.
- **The fingerprint:** engine work must keep the seeded games identical for decks that don't contain the changed cards. Workers report the
  fingerprint before and after. A change that alters unrelated games is suspicious.

Known slow or timing-sensitive tests:

- **`tune*.test.js`:** split in four (tune, tune-kill, tune-next-bracket, tune-next-limits; T-133), each at most about 90 s of the 300 s per-file limit, so they run side by side.
- **`tune-next.ui.js`:** times out if run beside another heavy UI test, so run it alone.
- **`combo-odds.test.js`:** has an "in under 3 seconds" check.

---

## 5. How to give a task (a brief)

Every task gets a task id (`T-0NN`, the next free number in `PROJECT_STATE.md`) and this brief. The worker sees nothing else, so it has to
be complete:

```
You are a TASK session, "<name>", in the ICEYfish project. MAIN is <how to reach MAIN>. Say in your first reply that you are TASK.
Before changing anything, read CLAUDE.md, PROJECT_STATE.md and docs/agents/<AREA>.md.
TASK T-0NN: <the user's words, quoted>, <what to build or fix, concretely>.
Starting version: live Version N (claude/visual-goldfish-calculator-1ztks5). Branch: claude/<area>.
Files you own: <list>. Stay out of <files another task is changing>. Tell MAIN before changing anything exported from sim.js,
a decide.js question kind, an engine event's wording, the SHELL list in sw.js or the workflows.
Done when: <tests that must pass, including a new test that fails before the change; fingerprint unchanged; sweep bad 0; pushed>.
Report in the form below.
```

**Teach tasks** (cards the engine doesn't fully read):
- List each card and its exact unread lines, with their current rating ('ignored' or 'partial').
- If a card is missing from the set data, the worker adds its first printing with `tools/fetch-sets.js`.
- Done = every line 'ok' or 'neutral', a focused engine test that fails before the change, `builtin-decks` passing, and the fingerprint unchanged.

**Adding decks from the user's Drive:**
- The folders are "Magic Commanders/ManaBox" and "MTG Max Salt Commander Decks/ManaBox", listed in `goldfish/static/decks/drive-sync.json`.
- Compare the Drive files with `drive-sync.json` to find new or changed decks.
- Import, rate with `verify-brackets.js`, and send the unread card lines to a Teach task.
- Merge the deck together with its Teach task, because `builtin-decks` fails until every line is read.

---

## 6. The report form (what workers send back)

```
TASK:
STATUS: Complete / Partial / Blocked
BASE: starting branch and commit
DELIVERY: branch and the commit it ends on
SUMMARY: what changed and why
FILES CHANGED:
INTERFACE OR DEPENDENCY CHANGES:
VERIFICATION: checks run and what they actually showed
KNOWN ISSUES:
REMAINING WORK:
INTEGRATION NOTES:
```

A report makes a task **Reported**, nothing more. The other states are **Integrated** (merged into MAIN's branch) and **Verified** (combined
tests passed and the 4 GitHub checks are green). What was not tested is not verified.

---

## 7. Review checklist (what MAIN looks for)

**Engine (sim.js):**
- The real Magic rule, for example:
  - "without paying its mana cost" still pays commander tax;
  - tokens don't persist;
  - Solemnity allows loyalty counters;
  - copies of spells aren't "cast";
  - "lose life" is not damage.
- The right player, and the right zone (a "dies" trigger should not fire for a tuck into the library).
- Loops that never end need a cap; the engine caps persist and undying returns at 40 a turn.
- `null` or `undefined` when nothing qualifies.
- Effects on unrelated cards: check the fingerprint.

**Person-facing choices:**
- The person is asked **before** anything is paid or spent.
- "Don't do it" really undoes everything: zones restored in place, every player, and the log.

**App:**
- A result computed for one deck must never be applied to another; store the deck with the result and check it.
- Decklist lines may lack a number ("Sol Ring") or use Windows line endings.
- Apply must change the loaded deck, not only the text box, and keep `gf_last` in step.
- State goes stale when the deck, the cut or play/draw changes.
- Progress bars must be hidden on every exit (use `finally`).

**Numbers:**
- Probabilities must be exact or clearly sampled, with a stated margin.
- Bit masks wrap above 31 pieces.
- Typed numbers need validating: huge, negative or NaN.

**Speed:** nothing slow on the page's main thread. Results must be identical before and after a speed-up.

**Holding work:** hold a change only for important findings, which you confirm in the code yourself. Merge the rest and send the minor
findings as follow-ups.

---

## 8. Where things stand (2026-11-24, Version 178)

Always re-read `PROJECT_STATE.md`. As of this guide:

- **Live:** Version 178.
- **Recent work:**
  - Combo play (combos are pursued, played out, ∞ mana, and the person is asked), in v176.
  - New decks Short Circuit (B4) and Dead Ringers (B3), in v177.
  - Play a friend is WebRTC only, in v178.
- **Active tasks:**
  - **T-064 Speed:** much faster simulations with identical results; branch `claude/speed`.
  - **T-065 Tidy:** small follow-up bugs and dead code in the app; branch `claude/tidy`.
- **Paused:** engine card-rules batches 72+.
- **Waiting on the user:**
  - Revoke the old Metered relay login in its dashboard; it stays in git history.
  - Delete the 14 merged branches listed in `PROJECT_STATE.md` (a permission check blocked deleting them).
  - Delete the disabled scheduled task `trig_01Mw6jr3B2ojgqZ1DyQQA5Pv`.
- **Hourly:** Claude's scheduled task "Watch GitHub for Teach requests" checks the issues. Without Claude, check by hand.

---

## 9. The prompt to give ChatGPT

Paste this into ChatGPT, as a Project's instructions or Custom instructions. If ChatGPT can reach GitHub (a GitHub connector or Codex), give
it access to `skyweezydeezy/ICEYfish`. Without access, it guides you step by step and you click and run things yourself.

```
You are the backup coordinator ("MAIN") for ICEYfish, a browser Magic: The Gathering Commander goldfish simulator.
Repository: github.com/skyweezydeezy/ICEYfish. Live branch: claude/visual-goldfish-calculator-1ztks5 (every merge deploys the site
and adds a "Version N" commit). Your work branch: claude/main-coordination. Live site: https://skyweezydeezy.github.io/ICEYfish/.

Before acting, read in the repository: CLAUDE.md (the rules; they win over anything else), PROJECT_STATE.md (current state, tasks,
known issues), docs/BACKUP-MAIN-GUIDE.md (how this job works) and docs/agents/<area>.md for the area you touch.

Rules you always follow:
- Teach requests ("Teach: …" issues) come before everything else and merge on their own. Done means every line of those cards
  reads 'ok' or 'neutral'; then comment "Live in Version N" on the issue and close it.
- Finish a pending merge (live, with its version number) before starting new work.
- Merge to the live branch only when the tests for the change passed and all 4 GitHub checks are green. Never weaken or skip a test
  to get green. One re-run is allowed only for a clear timing or infrastructure failure.
- A new or changed built-in deck is bracket-checked with tools/verify-brackets.js first (20,000 games + round robin + the official
  card rules; the higher of the card floor and speed). The deck file shows the verified bracket; drive-sync.json keeps the Drive claim.
- Engine work must leave unrelated games identical (fingerprint) and the every-default sweep at "bad 0".
- Never edit goldfish/static/version.js or the VERSION line in sw.js. Never commit secrets or the user's personal details.
- Add a What's new entry (goldfish/static/whatsnew.json, v = live + 1, one or two plain sentences) and record every task, its tests
  and its version in PROJECT_STATE.md, marked [V] verified, [R] reported or [A] assumed.
- Tell the user, in one short line, when a merge starts and when it is live with its version number, or if it failed.
- Design: less is more; headers and key numbers shown, details folded; one-word tabs.
- Prefer spending effort on fixing errors and Teach requests.

How you work: read each change yourself and review it against the real Magic rules and the checklist in BACKUP-MAIN-GUIDE.md section 7.
Hold a change only for important bugs (a wrong game result, a crash, an endless loop, the wrong player, data loss) that you confirmed
in the code, and say exactly where (file:line) and how it fails. Say plainly what you tested and what you did not. Use plain words.
When you can't do a step yourself (run tests, push, merge), give the user the exact command or click path, then check the result.
```

---

## 10. Gotchas learned the hard way

- **`git checkout <ref> --` with no path detaches HEAD.** Check `git status -sb` before committing.
- **Two runs writing the same log file look like a crash.** Use a different log name for each run, and stop old runs first.
- **Set-data merges:** don't take one side's whole `data/sets/index.json` or `docs/SETS.md`; resolve hunk by hunk.
- **A new deck can change other tests:** for example, the deck with the most combos becomes the one `combo-odds` times.
- **Branch targets:** a worker's report may name a tip that has since moved on. Merge the commit it names, and check that the branch
  contains the live version.
- **The GitHub Pages deploy takes about 1–2 minutes after the merge.** Don't announce a version number before `version.js` shows it.
