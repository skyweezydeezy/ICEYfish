# Instructions for Claude

## Git
- Push commits to your own work branch without asking for approval first, unless the user says otherwise in the conversation.

## Sessions: MAIN and TASK (the user's session protocol; full text in `docs/SESSION-PROTOCOL.md`)
- **Say which you are in your first reply.** MAIN is the Visuals session named in the next section: it assigns work, reviews reports, merges, and keeps the project state. Every other session is TASK: one bounded assignment, reported to MAIN.
- **The repository is the record, and `PROJECT_STATE.md` is its map:** the goal and firm requirements, accepted decisions, the latest verified version, tasks and their owners, known issues, next priorities. Only MAIN edits it; a TASK session sends a report and MAIN records it. Each line there is marked verified, reported or assumed. No other session can see your conversation: what is not pushed or sent does not exist for it.
- **TASK, before changing anything:** read your assignment, this file, `PROJECT_STATE.md` and your area's note in `docs/agents/`. Then state the branch and commit you start from, the objective, how you will know it is done, and the files you expect to change. Check the task table and the open pull requests for overlap. Ask only what blocks safe progress; decide the routine things yourself.
- **TASK, while working:** one outcome that can be reviewed on its own. Leave unrelated changes alone. Tell MAIN before you step outside the assignment or change something other sessions build on (a name `sim.js` exports, a `decide.js` question kind, an engine event's wording, the `SHELL` list in `sw.js`, the workflows). Say what you tested and what happened; what was not tested is not verified.
- **Report to MAIN** when the task is complete, blocked, needs a shared decision, has changed materially, or you must hand over. The message to the Visuals session (next section) is the form below. Sending it does not mean it was received or merged.
- **Task states:** Planned → Active → Reported → Accepted → Integrated → Verified. A report makes a task Reported, nothing more. Integrated: merged into MAIN's work branch. Verified: the combined tests passed there and GitHub's checks are green.
- **MAIN, for every assignment:** give a task id, the objective, the starting version, the files the task owns, how it will be judged done, and what it depends on.
- **MAIN, for every report:** read it and the actual changes; compare the commit it started from with the live branch now; settle overlap by what the behaviour should be and the evidence, never by taking the newer file; merge in dependency order; test the combined result; record the task, the version and the test results in `PROJECT_STATE.md`. If the tests fail, record that and send the fix to the owner; the task is not Verified.

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

## Send finished work to the Visuals session
One session gathers everyone's work and merges it: the **Visuals** session (session `session_01K5kL4X71yAbkpEVcRH5Z38`).
This keeps merges in one place, so branches stop colliding on the live branch.

- **Push, don't hold.** When a piece of work is finished and its tests pass, commit it and push it to your own work branch. Work that is only committed in your session's copy cannot be merged.
- **Then tell the Visuals session.** Send it a message (`send_message` to `session_01K5kL4X71yAbkpEVcRH5Z38`) with your branch name, the commit it ends on, and one or two sentences on what it does. Bring your branch up to date with the default branch and re-run the tests first.
- **Don't merge into the default branch yourself**, unless the user asks you to in your own conversation. The Visuals session merges your branch into its work branch, runs the tests, and asks the user before anything goes live (the rules below still hold).
- **The Visuals session** reports each merge back to the session that sent the work, with the new version number, or says what failed and leaves the fix to that session's area (for example, the engine's `goldfish/static/sim.js`).

## Long sessions: hand over to a fresh one (the user: "Once sessions get too long create new sessions for tasks so that we save tokens")
- When a session's context passes about 600k tokens (60% of the window; `get_session` shows `context_usage.used_tokens`), it finishes or pauses at the next natural break and does not start new work.
- It writes a short handoff note in `docs/agents/<its-name>.md`: its role, branch, what is done, what is in progress, open items, and gotchas. It pushes the note and tells the Visuals session.
- The Visuals session starts a fresh session with that note as its brief, on the same branch, tells the other sessions the new session id, and archives the old session.
- The Visuals session does the same for itself: it writes `docs/agents/VISUALS.md`, starts its replacement, and updates the session id at the top of this file.
- A new task that is unrelated to a long session's current work goes to a fresh session from the start.
- **Archive the old session as soon as a new one takes over its work** (the user: "remember to archive a previous session when a new session takes over it"): MAIN archives it with archive_session once the replacement is running and nothing of the old one is unmerged.
- Hand over as well after a verified milestone, when the task's scope changes a lot, or when the session keeps making context mistakes. Before any hand-over: push the work, update the note (MAIN: `PROJECT_STATE.md` too), list what is unfinished, and write the exact next action. Chat memory and the automatic summary are not a hand-over.
- A replacement MAIN reads `PROJECT_STATE.md`, this file and `docs/agents/VISUALS.md`, checks them against the repository (branches, open pull requests, the live version), finds the active tasks and the reports not yet answered, and resumes from the latest verified version. It does not redo finished work, reassign active tasks, or call something merged because an old summary says so.

## Models: Sonnet for every agent except MAIN (the user: "Except for the main thread, can you change every agent to work on the Sonnet level? Not Opus, not Fable, not Haiku, but on the Sonnet level and at most medium.")
- Every TASK session, subagent and workflow agent runs on Sonnet (`claude-sonnet-5-5`) with effort at most medium. Only MAIN keeps its own model.
- Create every new session with model `claude-sonnet-5-5` and effort `medium`; pass model `sonnet` and effort `medium` to every Agent call and every workflow `agent()` call.
- A running session can't change model in place: MAIN replaces each existing TASK session with a Sonnet/medium one, briefed from its note in `docs/agents/`, at its next natural break (its current task reported, or idle now).

## Tests: keep them quick
- GitHub runs the whole engine suite on every pull request and every push to a work branch (the "Tests" check). Locally, run the tests for what you changed (`node tests/run.js <name>`, `node tests/run.js --ui <name>`), then wait for the green check instead of running everything yourself.
- The Visuals session merges the work that arrived together first and tests the batch once, not once per session.

## Merging into the default branch
The default branch is what the live site and every `start.bat` copy run. Nothing goes onto it without the user's say-so.

- **Standing yes for the Visuals session (given by the user):** when another session reports finished work, or its own work is finished, the Visuals session merges it into its work branch, runs the tests, and merges it into the default branch without asking again once its own tests and GitHub's checks are green. It still confirms each merge with the version number afterwards, and stops and reports if anything fails. It sends the user a push notification (PushNotification; the user reads them on their watch) when a merge starts, and another when it is live with the version number or has failed. The same holds for its own work (the user: "treat everything the same way").
- **Merge first, then task (the user: "Always complete the merge before tasking agents with new work. It reduces agents misfiring.").** The Visuals session finishes any pending merge, live with its version number, before it gives any session new work, so every assignment starts from the live version.
- **Teach requests go to the top of the queue (the user: "That request should always be pushed to the top of the queue").** A "Teach: …" issue (the app's "Teach these cards" button) is assigned before any other task: at once, or as soon as a merge already running is live (merge first still holds), and the card-teaching session puts it before its current work. It merges as soon as it is finished and green, never held for a batch, and the issue gets a "live in Version N" comment and is closed. It is done only when the app no longer lists those cards as not fully understood (every line 'ok' or 'neutral').
- **Every new built-in deck is bracket-checked before it is added (the user: "Make that an official rule for all new decks added to the default setting, that they all go through a bracket rating system").** A deck joins goldfish/static/decks only after `node tools/verify-brackets.js` has rated it by ICEYfish's standard (T-035): 20,000 goldfish games and the official Commander Brackets card rules, with the higher of the card floor and the speed bracket. No round robin (the user, 2026-11-26: all deck ranking is off until it is overhauled; decks sort by the official bracket, then name). Its bracket line is the verified bracket, with the "// Checked by ICEYfish" line; the Drive bracket stays in drive-sync.json as the user's claim. A deck whose cards change is re-checked before the change merges. MAIN does not merge a new or changed built-in deck without the check.
- **Card rules: every 5 batches (the user: "Every 5 batches from card engine rules deserve a merge").** The engine session's rules batches (claude/engine-rules) are held until five have arrived, then merged together in one go. Other sessions' work, and engine fixes the user asks for directly, still merge as they come.
- **Ask first.** Before merging a pull request, or putting commits on the default branch in any other way (a direct push, a merge, a rebase), ask the user and wait for a yes in the conversation. Say what will be merged in one or two sentences. An earlier yes covers only the merge it was given for.
- **Confirm after, with the version number.** When the merge is done, wait for the "Deploy to GitHub Pages" run to finish, then tell the user the merge is complete and give the new version number (the "Version N" commit the run adds; also in `goldfish/static/version.js` on the default branch). The confirmation is not finished without the number. If the run fails, say so and give no number.
- **This applies to every session**, the card rules engine included: its changes touch the files that conflict most (`goldfish/static/sim.js`, the set data under `goldfish/static/data/sets/`, `docs/SETS.md`, `tests/README.md`).
- **Bring your branch up to date before asking.** Merge the default branch into your work branch and re-run the tests first, so the merge you ask for is the one that happens.

## Version number
- Every merge into the default branch gets a new version number automatically: the deploy workflow adds 1 to `goldfish/static/version.js` and commits it ("Version N"). The app shows it in the top bar ("v56"), and the offline cache is named after it.
- Never edit `goldfish/static/version.js` or the `VERSION` line in `goldfish/static/sw.js` by hand, and never bump a version in a work branch. That line used to be bumped in every change, which made every pair of branches conflict.

## Design philosophy: "Less is more, until the user says more is best."
- Show headers and the key numbers; fold everything else. The user opens what they want to dig into.
- Explanations of a section go behind the ⓘ toggle next to its header (`tidy()` in goldfish/static/app.js does this for a
  `.hint` under an `h2`/`h3` or in a `.box-head`, and for a how-to line marked `data-fold`).
- Report lists (`.sg` groups: suggestions, strengths, matchup findings) fold to their headings; call `tidy(el)` after rendering one.
- Tabs are one word each, saying what the tab does for the user: Build, Mulligan, Practice, Simulate, Odds, Duel, Pod.
