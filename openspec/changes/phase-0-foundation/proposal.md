# Proposal

## Why

The Daily Loop design is approved, but the repository contains only the engineering contract, agent definitions, and planning documents. There is no runnable skeleton, so every later phase would otherwise invent its own workspace layout, configuration, error shape, and database workflow. Phase 0 establishes the single foundation that `AGENTS.md` mandates and that all later changes build on.

## What Changes

- **Monorepo:** npm workspaces + Turborepo, shared TypeScript bases, ESLint, Prettier, and one-command scripts.
- **Local infrastructure:** Docker Compose for PostgreSQL 16, Redis 7, and MinIO with health checks and named volumes.
- **API bootstrap:** NestJS 11 with Zod-validated config, global validation, the `{ code, message, details?, requestId }` error envelope, structured logging, request correlation, and `/health`.
- **Database baseline:** Prisma schema limited to `Nursery`, `User`, `UserProfile`, and `Staff`; a migration workflow; an idempotent seed with one demo nursery and one user per role.
- **Web bootstrap:** React 19 + Vite, React Router, TanStack Query, Tailwind CSS v4, shadcn/ui, an Arabic RTL shell, and a shared API client that renders loading, success, and error states.
- **Shared contracts:** `packages/shared` with Zod schemas for the error envelope, roles, capabilities, and domain constants, plus a single export entrypoint.
- **Auth skeleton:** 15-minute JWT access tokens, 30-day rotating refresh tokens, argon2 hashing, guards, and `@CurrentUser()`.
- **CI:** lint, typecheck, unit, build, integration with PostgreSQL and Redis services, and a migration-drift check.

**Explicitly out of scope:** any product behavior (OTP delivery, children, enrollment, attendance, pickup, daily sheets, health, assessments, passport, notifications, calendar), any child data in the seed, production deployment, and dependencies outside the locked stack. Monitoring (Sentry or equivalent) remains an open decision and is not part of this change.

## Capabilities

### New Capabilities

None. Phase 0 is pure tooling and scaffolding; it changes no observable product behavior, so there is no spec delta. The change sets `skip_specs: true`.

### Modified Capabilities

None.

## Impact

- **New paths:** `apps/api/`, `apps/web/`, `packages/shared/`, `docker-compose.yml`, `turbo.json`, `.github/workflows/ci.yml`, and root workspace/config files.
- **Existing paths:** `AGENTS.md` and `docs/` are read-only for this change; `openspec/` gains this change only.
- **Database:** four baseline tables; no child, health, or assessment data.
- **Runtime:** Node 22 LTS, npm, PostgreSQL 16, Redis 7, MinIO.
- **Dependencies:** the locked stack only; each addition is justified in its PR per `AGENTS.md` §4.
- **Risk:** tooling over-configuration. Mitigation: no infrastructure beyond the items above.
