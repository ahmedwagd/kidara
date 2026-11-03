# Kidara progress

Maintained by `docs-keeper`. Read this first to know where the project stands. Last updated: 2026-11-03.

## Current phase

**Phase 0 - interactive prototype and teacher usability test** (in progress: plan task 1 done, task 2 half done - parent day sheet done, reception screen not started; task 3 not run; task 4 not started).

Open in Phase 0:
- Plan task 2 - parent day sheet and reception screen: parent day sheet done (see Done, 2026-11-03); reception screen not started.
- Abort accounting in the prototype: an 8-minute aborted session must count as a failure in the average (user decision). The prototype logs submitted sessions only, so this is prototype work in the next stage, not a documentation gap.
- Plan task 3 - usability test with at least 3 teachers: human gate, not run.
- Plan task 4 - record results, revise, retest.
- Exit criteria unmet: average under 5 minutes without repeated explanation (plan `:92`).

## Phases

- [ ] 0 - Interactive prototype + teacher usability test
- [ ] 1 - Foundation
- [ ] 2 - Identity and isolation
- [ ] 3 - Enrollment and onboarding
- [ ] 4 - Daily report
- [ ] 5 - Notifications
- [ ] 6 - Attendance and pickup
- [ ] 7 - Pilot readiness and the pilot
- [ ] After the pilot: 8 health and incidents, 9 assessment and passport, 10 calendar

## Done

- 2026-11-02: design spec and implementation plan reviewed and revised (see their changelog sections).
- 2026-11-03: AGENTS.md and the OpenCode agent team created.
- 2026-11-03: Phase 0 task 1, classroom prototype (plan `:86`, `prototype/phase-0`): «الكل حاضر», the bulk buttons and their ▾ alternatives, per-child exceptions and submit, all covered by tests (5 test files, 85 tests; typecheck, lint and build clean).
- 2026-11-03: Phase 0 test package (`prototype/phase-0/test-script-ar.md`, `README.md`) corrected after an Arabic/UX review: storage policy (never clear the sessions key between teachers), complete observation sheet, neutral wording, honest CSV description, known limitations, and no claim that Phase 0 passed.
- 2026-11-03: Phase 0 task 2, first half - parent day sheet, read-only guardian view (plan `:87`, `prototype/phase-0`): `?view=parent&child=<id>` adds the parent route; teacher flow and `?facilitator=1` unchanged, `?child=` alone ignored. `src/App.tsx` splits out `TeacherApp` so no teacher hook mounts on the parent path; `src/data/parentDay.ts` is the pure projection (unknown-child / not-published / ready, submitted counts as published); `src/hooks/useParentDay.ts` only reads storage and keeps corrupt bytes; `src/components/parent/ParentDayScreen.tsx` is the Arabic RTL card (facts only when submitted, absent child hides meal/nap/mood, allergy as an informational note). Tests: `parentDay.test.ts` (13), `parent-day.test.tsx` (11), `parent-day-hostile.test.tsx` (46, adversarial tester). Evidence: 155 tests pass, typecheck and lint clean, build 37 modules; no horizontal overflow at 393×852 and 412×915; retry 46 px; teacher and package files untouched.

## Decisions (user)

- 2026-11-03: test device is 393–412 px, portrait, 100 % zoom, one-handed. Measured in a real browser at 393×852 and 412×915: no horizontal overflow on the classroom screen, child sheet or review sheet; submit bar and both sheet footers at the viewport bottom; the open facilitator panel stays above the submit bar. `test-script-ar.md` and `README.md` updated; no 360–390 references remain.
- 2026-11-03: an 8-minute aborted session counts as a failure in the average (see open work in Phase 0).
- 2026-11-03: no undo for destructive bulk/absence actions, and elapsed time on the success screen, are kept as prototype limitations, not defects.
- 2026-11-03: parent day sheet deviations: toilet is recorded by the teacher but not shown on the parent sheet; the approval fixture covers seeded ids `c18` and `c20` for any report day while the real rule is per-sheet manager approval; the allergy label is an informational mock, not a health record. Earlier decisions still stand: 393–412 px device, aborted session counts as a failure (not yet implemented), no undo and elapsed time kept as limitations.

## Open findings

- Phase 0 task 1 review (2026-11-03): none open. Two findings were raised, fixed and re-checked - uncovered ▾ alternatives, and a README device claim that did not match the measured layout.
- Phase 0 task 2 first half (2026-11-03): none open. The spec gate failed once on contract completeness and passed on revision; Arabic/UX high findings were fixed and round 2 raised no new high; 46 hostile tests found no real bugs.
- Repo state (2026-11-03): the whole `prototype/` directory is untracked in git (`?? prototype/`), so none of the Phase 0 work is committed. `.gitignore` has no entry for it and `node_modules/` and `dist/` sit inside it, so a wholesale add would commit them.

## Blockers that need a human (agents cannot do these)

- Phase 0 usability test with at least 3 teachers from the partner nursery.
- Legal review of children's data requirements (Egyptian PDPL 151/2020) before real data is used.
- Confirm model IDs with `opencode models` and the agent settings with `opencode debug agent <name>` (OpenCode v2.1.4). Create root npm scripts `typecheck`, `lint`, `test` in Phase 1 so `.opencode/plugins/verify-on-idle.ts` can run.
- Confirm the partner nursery and the pilot dates.
