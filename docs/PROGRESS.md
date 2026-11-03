# Kidara progress

Maintained by `docs-keeper`. Read this first to know where the project stands. Last updated: 2026-11-03.

## Current phase

**Phase 0 - interactive prototype and teacher usability test** (not started).

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

## Open findings

None.

## Blockers that need a human (agents cannot do these)

- Phase 0 usability test with at least 3 teachers from the partner nursery.
- Legal review of children's data requirements (Egyptian PDPL 151/2020) before real data is used.
- Confirm model IDs with `opencode models` and the agent settings with `opencode debug agent <name>` (OpenCode v2.1.4). Create root npm scripts `typecheck`, `lint`, `test` in Phase 1 so `.opencode/plugins/verify-on-idle.ts` can run.
- Confirm the partner nursery and the pilot dates.