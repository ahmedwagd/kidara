# Kidara — Phase 0 Prototype: Classroom Daily Report + Parent Day Sheet

A **throwaway, interactive prototype** for the Phase 0 usability test: one classroom screen that lets a teacher complete the daily report for 20 children, plus the read-only parent day sheet (`?view=parent`) — all Arabic (RTL), with fake seeded data only.

- **Not production code.** It does not touch `apps/web`, does not follow the Phase 4 architecture, and shares nothing with the real app (no `packages/shared`, no API, no backend).
- **Purpose:** measure whether a teacher can finish a 20-child daily report in **under 5 minutes with no repeated explanation** (avg across ≥3 teachers — the Phase 0 exit criterion), and surface UI problems before real screen code is written.
- **Lifecycle:** it informs Phase 0 / Task 4 (revise/retest if needed). Archive or delete once real screens exist (by Phase 4). Do not copy this code into `apps/web`.

## Run it

```bash
npm install           # once, inside prototype/phase-0
npm run dev           # Vite dev server; open the printed URL
```

Facilitator mode (for whoever runs the human test) is enabled by appending `?facilitator=1` to the URL. Once the mode is on, the small «الميسّر» toggle stays visible at reduced opacity, but the **panel starts closed**; the facilitator opens it to start/reset a session and read metrics, and must **close it again before handing the device to the teacher** — the open panel shows the target and the live timer. While the panel is closed, neither the target nor the live timer is visible to the teacher. The script and the observation sheet are in `test-script-ar.md`.

**Test device:** one device for the whole study, portrait, **393–412 px viewport width at 100 % zoom** (checked at 393×852 and 412×915), used one-handed as in the classroom. Measured at both widths: no horizontal overflow on the classroom screen, the child sheet or the review sheet; the fixed submit bar and the child-sheet and review-sheet footers sit at the bottom of the viewport; and the open facilitator panel stays above the submit bar (the gap narrows to about 10 px when the remaining-children hint is showing). The **parent day sheet** is measured on the same widths and the same pass rule: no horizontal overflow in its states (ready, loading, empty, error, invalid), and in the error state the «إعادة المحاولة» retry control is **fully visible inside the initial viewport** at both 393×852 and 412×915 (the state cards are vertically centred for exactly that reason).

Optional env override for deterministic report days: `VITE_REPORT_DATE=YYYY-MM-DD`.

**Parent view (plan task 2, first half — parent day sheet):** open `?view=parent&child=c18` on the same device to see the one-child day sheet a parent would receive. Report **content** appears only after a report for the **same day** is submitted from the classroom screen (`?child=` alone is ignored and still opens the teacher flow); before that, the sheet still shows whose report it is and for which day — the loading, empty and error states show the child's name, classroom and report date with a single heading — and the invalid-link state shows only the message, because the link identifies no child. The view never writes or deletes storage — it only reads. The day-sheet layout: the parent-specific absent line explains that meal/nap/mood are not recorded for an absent child; the behavior-note section shows «لا توجد ملاحظة لهذا اليوم» when there is no approved note. The behavior-note **approval is a simulated fixture** (`mockApprovals` in `src/data/parentDay.ts`, approving the seeded children **`c18` and `c20`** only — so `?view=parent&child=c18` is the demo path for an approved note); the spec's real rule is per-sheet manager approval. The view is seeded, **read-only** (never writes, mutates or deletes storage), and has **no auth and no guardian isolation** — nothing here checks who is opening it, and `?child=` is **not an authorization boundary**; it only selects which seeded child is displayed.

## Scripts

| Script | What it does |
| --- | --- |
| `dev` | Vite dev server with HMR |
| `build` | `tsc -b` then Vite production build |
| `preview` | Serve the production build |
| `typecheck` | TypeScript project check |
| `lint` | ESLint |
| `test` | Vitest, single run |
| `test:watch` | Vitest in watch mode |

## What the teacher can do

- **Attendance:** per-child attendance (حاضر / غائب / متأخر / انصراف مبكر) plus a bulk «الكل حاضر» button; submit is enabled once attendance is set for everyone.
- **Bulk actions** («أكل الجميع», «نام الجميع», «مزاج الجميع: هادئ») apply to **attending children only**, with per-child overrides for meal (أكل كامل / أكل جزئياً / رفض الأكل), nap (نام / لم ينم), and mood. The meal and nap bulk buttons also offer alternative bulk values through the ▾ menu.
- **Per-child sheet** (bottom sheet): attendance, meal/nap/mood, optional toilet record, free-text **behavior note** (labeled: shown to the guardian only after manager approval), and the allergy chip if the (fake) child has one.
- **Submit flow:** a review sheet with counts, attention-worthy exceptions, behavior notes awaiting manager approval, and non-blocking completeness warnings (meal/nap/mood missing for some attendees), then a success screen.
- **Draft autosave:** autosave every 10 seconds while the draft is dirty, plus a save on `pagehide`/`visibilitychange` and on submit; reloading restores an unsaved draft with a toast. Saved/failed-save states are visible near the header.

## Facilitator mode (`?facilitator=1`)

The small «الميسّر» toggle (visible at reduced opacity once the mode is on) opens a panel fixed at the **bottom** of the screen, below dialogs in stacking order. The panel exposes:

- **Per-teacher sessions:** teacher labels auto-increment from the stored session count («معلمة ١», «معلمة ٢», …). «بدء جلسة جديدة» clears **today's draft and the current session** only; previous teachers' sessions are kept and the next label advances.
- **Timer / taps / completeness:** the timer starts at the first interaction with a report control (not scrolling, not the facilitator panel); tap count counts clicks on report controls only; live completeness (attendance/meal/nap/mood) and exception counts, visible while the panel is open.
- **Pass indicator:** elapsed < 5:00 is «ضمن الهدف», otherwise «فوق الهدف». The **aggregate across sessions** (count, avg/min/max, pass rate) is the Phase 0 evidence — one run is not.
- **Export:** «تصدير CSV» downloads `kidara-phase0-sessions.csv` (UTF-8 BOM, CRLF): an English header row, one row per session, then a blank line and a technical aggregate row of English `key=value` keys with raw milliseconds (`aggregate,sessions=…,averageMs=…,minMs=…,maxMs=…,passes=…,passRate=…`). The BOM only keeps Arabic **values** readable in Excel; the readable summary (avg/min/max as clock time and pass rate) is in the panel. «نسخ النتيجة» copies JSON to the clipboard. The aggregate sits at the bottom of the scrollable panel.
- **Unsaved session:** if a session-log write fails, the panel warns that the session is unsaved and a reload loses it — export or copy the result first.
- **Facilitator notes field** for repeated explanations and difficulties. The notes are attached to the session only at submit; later edits are not written to the log, and «بدء جلسة جديدة» clears the field.
- **Error simulation:** a toggle that makes the first submit attempt fail once, so the retry path is exercised.

Session data key and report draft key are listed below.

## Storage and reset

All persistence is `localStorage`:

- Draft: `kidara.prototype.phase0.report.<YYYY-MM-DD>.v1` — one key per report day, validated on load (schema version, date, full exact roster). On invalid/corrupt/outdated payloads the two halves behave differently: the **teacher screen deletes them** (and starts a fresh draft, with a toast); the **read-only parent view validates without deleting** — it shows its Arabic error state, leaves the stored bytes untouched, and never writes a single byte. A submitted draft reloads read-only on the teacher side.
- Sessions: `kidara.prototype.phase0.sessions.v1` — append-only facilitator log.

To reset between teachers, use **«بدء جلسة جديدة» in the panel only** (clears today's draft + the current session; previous sessions are kept). Never clear the sessions key between two consecutive teachers on the same device: clearing it destroys the aggregate and restarts labels at «معلمة ١». Manual clearing of both keys (DevTools → Application → Local Storage) happens only at the end of the study or on a device/test-group change, and the CSV is exported first. Drafts and sessions **persist on the device** across refreshes and browser restarts until deleted.

## Privacy

The classroom is **seeded fake data**. Never enter real child names, national IDs, allergies, behavior notes, or anything from a real nursery record — not even "as a joke": the device or profile may later be shared. Recommended:

- Use a **dedicated browser profile** for the whole study (not incognito browser mode). Clear the two keys above only at the end of the study or on a device/test-group change, with the CSV exported first.
- Facilitator CSV/JSON export contains no personal data beyond anonymous labels and notes typed into the panel; keep typed notes free of personal details.

## Known limitations (intentional — Phase 0 scope only)

- Meal/nap are simplified: no quantities, no nap times or quality; no `health_note`.
- No amendment flow, notifications, offline sync, auth, tenancy, or backend. Submit is a local state change with a small animated delay; the error path exists via error simulation. **Manager approval of behavior notes is not implemented as a workflow** — for the parent view it is **simulated** by a seeded fixture (`mockApprovals`); the classroom flow only previews "awaiting manager approval" counts.
- The allergy banner is **static and informational** — it proves the visual slot exists, not the real API; it is not a health record.
- Bulk actions overwrite existing values, and there is no undo in this prototype.
- The success screen shows elapsed time — intentional for the Phase 0 task, not a production pattern.
- The report day/time uses the device timezone; the prototype has no nursery timezone.
- The classroom name, child names, and allergy texts are invented.
- Passing here (even on aggregate) is a **smoke signal, not usability proof**; the human facilitator test (Task 3) decides, and Task 4 decides any revision. Said plainly: this prototype is an **input** to the teacher usability test and does not by itself prove the under-5-minute target — no human test has run yet, and Phase 0 is not complete.
- No production architecture implication is drawn from this code.
- After «إعادة المحاولة» the reader remounts, so keyboard focus returns to the top; this prototype does not restore focus to the retried card.
- Toilet is recorded on the teacher sheet but is not shown on the parent day sheet.
- The simulated approvals fixture covers the seeded ids `c18` and `c20` for any report day; the real rule is a per-sheet manager approval.

## Structure

```
src/
  copy.ts                   # all Arabic UI strings + ar-EG formatting helpers
  App.tsx                   # screen composition, submit pipeline, facilitator wiring
  styles.css                # RTL-first styles (logical properties), touch targets
  data/classroom.ts         # seeded fake 20-child classroom
  domain/                   # report state reducer + rules, session metrics (pure, unit-tested)
    types.ts / report.ts / report.test.ts / metrics.ts / metrics.test.ts
  persistence/              # localStorage draft + sessions, validated, error-aware
    browserStorage.ts / draftStore.ts / draftStore.test.ts
  hooks/
    useDraft.ts             # draft state, autosave, restore toasts
    useParentDay.ts         # read-only parent day state (never writes storage)
    useSessionMetrics.ts    # timer/taps capture + facilitator finalize/reset
    useFocusTrap.ts         # modal focus containment
  data/parentDay.ts         # pure parent-day projection + seeded mockApprovals (c18, c20)
  data/parentDay.test.ts    # projection unit tests: approval gate, publishes, edges
  components/               # ClassroomScreen, ChildRow, ChildSheet, BulkActions,
    ...                     # SubmitSheet (+ success/error), AllergyBanner, SaveIndicator,
                            # FacilitatorPanel
  components/parent/
    ParentDayScreen.tsx     # read-only one-child day sheet for the parent view
  test/
    classroom-flow.test.tsx # end-to-end happy + restore + submit flows (jsdom)
    classroom-hostile.test.tsx # hostile/negative flows (double submit, stale draft, panel state)
    parent-day.test.tsx     # parent day states, routing, read-only behavior (jsdom)
    parent-day-hostile.test.tsx # hostile/negative parent flows: leaks, writes, crash paths
```
