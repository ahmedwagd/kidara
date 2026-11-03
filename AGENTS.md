# AGENTS.md — Kidara

Guidance for AI coding agents working in this repository. Read this first, then the source-of-truth docs below.

## What this is

Kidara is a multi-tenant SaaS for nursery (daycare) management, **Arabic-only, RTL**. The first slice is the **Daily Loop**: child identity, enrollment, attendance and pickup, the daily report, notifications to parents. Health, assessment, the child passport and the calendar come **after** the pilot.

## Source of truth

- Design spec: `docs/superpowers/specs/2026-11-02-daily-loop-design.md`
- Implementation plan: `docs/superpowers/plans/2026-11-02-daily-loop-implementation-plan.md`

- Progress and blockers: `docs/PROGRESS.md` (read it first to know where the project stands)
- Ideas outside the plan: `docs/PARKING_LOT.md`

If code and these docs disagree, stop and ask. Do not silently pick one. The docs are written in Arabic; keep their terminology.

## Stack

- API: NestJS 11, TypeScript, Prisma, PostgreSQL (with Row-Level Security), Redis + BullMQ
- Web: React 19 + Vite PWA, Tailwind + shadcn
- Shared: `packages/shared` (Zod schemas, types, constants), used by both apps
- Monorepo: `apps/api`, `apps/web`, `packages/shared`, `docs/`, `docker-compose.yml`

Package manager and exact scripts are set in Phase 1. Once they exist, list the commands here (install, dev, test, lint, typecheck, migrate).

## Phase order (build from the outcome backwards)

0. Interactive prototype + teacher usability test (before screen code)
1. Foundation
2. Identity and isolation
3. Enrollment and onboarding
4. Daily report (with offline support)
5. Notifications
6. Attendance and pickup
7. Pilot readiness and the pilot

After the pilot: full health/incidents, assessment + passport, calendar.

Do not build later-phase features early. Check the plan for the current phase before starting.

## Non-negotiable rules

**Tenancy and access**
- Every tenant-owned table carries `nursery_id`. No query runs without a tenant or guardian context.
- RLS has **two access paths**: nursery path (`nursery_id`) and guardian path (`child_id` through active `guardian_links`). The app DB role must not own the tables or have `BYPASSRLS`; `FORCE ROW LEVEL SECURITY` is on.
- Accessing another tenant's or another guardian's data returns **404, never 403**.
- Teacher scope comes from `classroom_staff` (current rows only), not from the role alone.
- A user can hold several contexts (staff in more than one nursery, or staff and guardian). Resolve the role per request context, not per account.

**Identity and children**
- A child is global and owned by the guardian. A nursery holds an `enrollment`, not the child.
- `verification_status` is global identity verification and gates only the passport and sharing. Daily operations depend on an active, nursery-attested `enrollment`.
- A duplicate national ID returns a **generic** response. Never reveal that the child exists elsewhere.
- Raw national IDs are never logged or returned; store encrypted plus a hash.

**Pickup and QR**
- Child QR, guardian QR and pass tokens are random, high-entropy, stored **hashed**, and rotatable.
- A pickup pass can cover several children. The link and the PIN are shown separately. The reception must confirm the receiver's identity (`receiver_id_checked`) before check-out.
- A guardian picks up with the permanent guardian QR; passes are for other people.
- Attendance is **append-only** (corrections are new events). `idempotency_key` is unique per nursery.

**Daily report**
- `behavior_note` is separate from the factual fields and is published to parents only after manager approval.
- Teachers may amend their own classroom's report until the end of the report day, with a recorded reason. After that only the manager can. Every amendment creates a new version and the diff stays visible to the parent.

**Audit and privacy**
- Sensitive actions call `AuditService.record()`. The audit table is append-only (update/delete revoked at DB level).
- `before`/`after` never hold raw sensitive values (national ID, health details, free-text comments). Store changed field names, hashes or masked values.
- Birth-certificate images are deleted after verification completes (default 30 days).
- Do not add third-party analytics or trackers. Children's data is sensitive; the legal review (Egyptian PDPL 151/2020) is a launch-gate item.

## Conventions

- TypeScript strict. Validate all input at the boundary with Zod schemas from `packages/shared`.
- API modules mirror the domain: `identity`, `tenancy`, `children`, `enrollment`, `attendance`, `daily`, `health`, `assessment`, `calendar`, `notifications`, `audit`. Cross-cutting code lives in `common/` and `infra/`.
- Web features mirror the API modules under `src/features/`.
- All user-facing text is Arabic and RTL-correct. No Lorem Ipsum. Code, identifiers and comments are in English.
- Errors: use the shared error types. Never leak internal details or tenant existence in messages.
- Schema changes go through Prisma migrations. Ask before changing a table the design spec defines.

## Definition of Done

A task is done only when:
1. Business logic has unit tests.
2. The critical path has an integration test.
3. Permissions are tested both ways (allowed and denied).
4. The UI has loading, empty and error states.
5. Sensitive actions emit an audit event.
6. `typecheck` and `lint` are clean.
7. Arabic copy is reviewed.

## Testing priorities

Isolation tests come first, built on the shared RLS test fixture (the first task of Phase 2; every new tenant-owned table is registered in it): cross-nursery reads return 404, a guardian reads one child across two nurseries, the app DB role cannot bypass RLS, a substitute teacher sees only her classroom during her `classroom_staff` window. Then pickup (single use, multi-child, expired, wrong PIN, lockout), daily report (draft recovery, offline submit and sync, amendment window), and enrollment (import visibility, claim/merge).

## Team and workflow (OpenCode)

Agents live in `.opencode/agent/`. The primary agent is `orchestrator`; it takes one plan task at a time and delegates:

- Builders: `api-builder` (backend), `web-builder` (frontend, from Phase 4).
- Gate and reviewers: `spec-guardian`, `isolation-reviewer`, `arabic-ux-reviewer`.
- Hostile testers: `adversarial-tester` (backend), `adversarial-tester-web` (frontend).
- Documentation: `docs-keeper`.

Rules of the team:
- Whoever writes code never reviews it. A reviewer runs on a different model family from the builder it reviews.
- `isolation-reviewer` is mandatory for any change touching schema, RLS, guards, auth, audit, enrollment visibility, attendance, pickup passes or QR tokens, or any query on tenant-owned data.
- A task is closed only after clean reviews, the Definition of Done, and a `docs-keeper` progress update.
- `.opencode/plugin/verify-on-idle.ts` runs typecheck, lint and tests when a session ends with uncommitted changes. Its result outranks any agent's claim that something passes.

## Progress tracking and the parking lot

- `docs/PROGRESS.md` is the single place that says what is done. Only `docs-keeper` edits it.
- An idea that is not in the plan goes to `docs/PARKING_LOT.md`, never into the plan, the spec or the code. Nothing from the parking lot is built before the pilot results.
- A spec, plan or `AGENTS.md` change needs an explicit decision from the user.

## Suggesting the next step

Every agent or session that finishes a task, or is asked "what next?", ends its report with a **Suggested next step**. Work it out like this:

1. **Know where you are.** Read `docs/PROGRESS.md` and the plan: current phase, what is done, open findings, blockers.
2. **Blockers first**, in this order:
   a. Open critical or high review findings.
   b. Failing typecheck, lint or tests.
   c. Human gates agents cannot do: the Phase 0 teacher usability test, the legal review, the pilot partner and dates, provider and model setup. Name them and ask the user; never pretend to do them.
3. **Otherwise** pick the next unblocked task in plan order within the current phase, respecting dependencies. For example: the shared RLS test fixture before any new tenant-owned table; the API contract before a web task; the Phase 0 usability test before screen code; Phase 1 before Phase 2.
4. **A better step instead of plan order** is allowed only when it clearly reduces risk or rework: it unblocks several tasks, closes a test gap a reviewer found, or settles a decision that would otherwise cause rework. Say in one sentence why it beats plan order.
5. **If every exit criterion of the phase is met**, propose the phase gate (check the exit criteria with the user and, for Phase 0 and Phase 7, the human steps) instead of starting the next phase.
6. **Never suggest** later-phase work, parking-lot items, or anything outside the plan. If a good idea appears, hand it to `docs-keeper` for the parking lot.
7. **Propose, do not start.** Wait for the user's go-ahead before beginning the suggested step.

Use this format, in the user's language (identifiers stay English), at most one alternative:

```
Suggested next step
- Next: <plan task and title> (Phase N)
- Why: <one sentence tied to the plan or PROGRESS.md>
- Needs from you: <a decision or a human action, or "nothing">
- Alternative (optional): <one other step, and when to prefer it>
```

## Out of scope for now

Photos and video, billing and payments, WhatsApp notifications, multi-language UI, native mobile apps, and anything the plan places after the pilot. If a task seems to need one of these, ask first.

## Working agreements

- Keep changes small and tied to one plan task. State which task and phase you are working on.
- Do not commit secrets, real child data, or real national IDs. Use seeded fake data.
- When the spec is ambiguous or a rule above would be violated by the simplest solution, stop and ask instead of guessing.