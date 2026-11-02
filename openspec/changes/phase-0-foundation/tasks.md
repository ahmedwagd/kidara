# Tasks

## 1. Workspace foundation

- [ ] 1.1 Create the root `package.json` with a `workspaces` field, plus `turbo.json`, covering `apps/*` and `packages/*`; verify `npm install` succeeds and `npx turbo run build --dry=json` lists every workspace.
- [ ] 1.2 Add shared TypeScript bases (`tsconfig.base.json`, Node, React) plus ESLint and Prettier config; verify `npm run typecheck` and `npm run lint` exit 0 on the empty workspaces.
- [ ] 1.3 Add root scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:int`, `test:e2e`, and `format:check`; verify each appears in `npm run` and `npm run format:check` passes.
- [ ] 1.4 Add `.gitignore`, `.editorconfig`, `.nvmrc` (Node 22), and `README.md` with prerequisites, ports, and commands; verify a clean checkout has no build artifacts and every documented command matches a real script.

## 2. Local infrastructure

- [ ] 2.1 Add Docker Compose with PostgreSQL 16, Redis 7, MinIO, health checks, named volumes, and fixed development ports; verify `docker compose up -d` reports every service healthy.
- [ ] 2.2 Add `.env.example` with every required variable; verify the API config schema rejects a missing or malformed value with a clear message.
- [ ] 2.3 Verify host connectivity to PostgreSQL and Redis and document it in `README.md`; verify the documented commands work from a clean shell.

## 3. Shared contracts

- [ ] 3.1 Create `packages/shared` with Zod schemas for the error envelope, roles, capabilities, and domain constants; verify unit tests cover valid and invalid payloads.
- [ ] 3.2 Add one export entrypoint and build output consumed by `apps/api` and `apps/web`; verify both typecheck against it and that a deliberate contract break fails `npm run typecheck`.

## 4. Database and Prisma

- [ ] 4.1 Add a Prisma schema with only `Nursery`, `User`, `UserProfile`, and `Staff`; verify `npm run prisma:validate -w apps/api` and `npm run prisma:generate -w apps/api` succeed.
- [ ] 4.2 Add the migration workflow (`migrate dev`, `migrate deploy`) and the first migration; verify it applies to a fresh database and a second run is a no-op.
- [ ] 4.3 Add an idempotent seed with one demo nursery and one user per role (super admin, owner, manager, teacher, guardian) using synthetic data only; verify re-running the seed leaves row counts unchanged and the data contains no real PII.

## 5. NestJS API bootstrap

- [ ] 5.1 Scaffold the NestJS 11 app with a Zod-validated config module; verify boot fails fast on an invalid environment and starts on the documented `.env`.
- [ ] 5.2 Add the global validation pipe and error filter that emits `{ code, message, details?, requestId }`; verify integration tests cover 400, 404, and 500 shapes.
- [ ] 5.3 Add request-id middleware and structured logging with correlation; verify logs carry the request id and never contain names, phones, national IDs, health data, or tokens.
- [ ] 5.4 Add `/health` checking PostgreSQL and Redis; verify 200 when both are up and 503 with component status when either is down.
- [ ] 5.5 Add the auth skeleton (15-minute access JWT, 30-day refresh rotation, argon2, guards, `@CurrentUser()`); verify tests cover valid, expired, rotated, and revoked tokens. Full OTP and identity remain Phase 1.

## 6. React web bootstrap

- [ ] 6.1 Scaffold React 19 + Vite + TypeScript strict with React Router and TanStack Query; verify the dev server renders a smoke route and `npm run build` succeeds.
- [ ] 6.2 Add Tailwind CSS v4, shadcn/ui, `dir="rtl"`, `lang="ar"`, and an Arabic font; verify the smoke page is RTL and uses logical CSS properties only.
- [ ] 6.3 Add the API client using `packages/shared` contracts and a health query; verify the page shows loading, success, and error states against a stopped and a running API.
- [ ] 6.4 Add a login screen wired to the auth skeleton; verify each seeded role can sign in and reaches a role-appropriate placeholder.

## 7. CI

- [ ] 7.1 Add a GitHub Actions workflow with npm cache, Node 22, install, lint, typecheck, unit tests, and build; verify it passes on the first PR.
- [ ] 7.2 Add an integration job with PostgreSQL 16 and Redis 7 services, `prisma migrate deploy`, and `npm run test:int`; verify it passes on fresh service containers.
- [ ] 7.3 Add a migration-drift check (`prisma migrate diff --exit-code`); verify it fails when the schema is edited without a new migration.

## 8. Exit verification

- [ ] 8.1 Verify `npm run dev` starts API, web, and dependencies, the smoke page loads, and `/health` returns 200.
- [ ] 8.2 Verify one login per seeded role returns the expected role claims and that the web placeholder matches.
- [ ] 8.3 Verify `packages/shared` blocks a mismatched API contract by introducing a temporary type break, confirming `npm run typecheck` fails, then reverting it.
- [ ] 8.4 Verify a clean-machine walkthrough of `README.md`: prerequisites, `npm install`, `docker compose up -d`, migrations, seed, `npm run dev`, and tests.

## Workflow follow-up

- Archive this change after all exit criteria pass and the first PR is approved.
