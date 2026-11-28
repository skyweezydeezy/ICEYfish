# Comprehensive Rules roadmap (after T-127 full priority)

The user (2026-11-28): "Let's continue to revisit this line of thought until we ingest and apply all rules properly as intended."
Standing direction: after each rules area is live and verified, MAIN takes the next one off this list (asking the user only if the order should change), and goes back over the list until every area matches the Comprehensive Rules.

Each area: its own task, behind an option until it passes, then on by default. Gates as for T-127: option off = fingerprint identical; option on = suite, sweep and full UI green; bench within +20%. Each one reports which results moved, and why.

| # | Area | CR | State |
|---|---|---|---|
| 1 | Targets for triggered and activated abilities chosen when they go on the stack, checked again on resolution (spells already do this: T-072, v197) | 602.2b, 603.3d, 608.2b | active (T-132, Priority 2, claude/t132-ability-targets) |
| 2 | The remaining abilities onto the stack: loyalty, equip, cycling/channel, hand/command-zone abilities, sacrifice outlets, autopilot-only routines | 602, 606, 702.6, 702.29 | planned |
| 3 | Layer system for continuous effects, with timestamps and dependency | 613 | planned |
| 4 | Replacement and prevention effects; the affected player chooses the order | 614-616 | planned |
| 5 | Multiplayer APNAP order for triggers and choices (Pod) | 101.4, 603.3b | planned |
| 5b | Honest coverage for triggers and instant/sorcery spells: a line reads ok only when every sentence is built (T-139 measured +320 trigger lines / 312 cards and +257 spell lines; needs a better sentence reader first). Loyalty and activated lines: T-139 | 603, 608 | planned (after T-139) |
| 6 | Review pass: audit each CR section against the engine again (as T-122 did for timing) and add what's missing to this list | all | planned |
