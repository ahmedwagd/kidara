// Hostile/negative UI tests for the Phase 0 classroom prototype.
// One block per rule that must stay impossible: report-day isolation, invalid
// drafts, storage failures, duplicate submission, facilitator session/reset
// isolation, ambient leaks and markup injection, attendance denominators.
// Fake seeded children only; deterministic report date 2026-11-03; in-memory
// storage; no real data and no network.
//
// Two tests are deliberately RED: they pin real defects found by reading the
// prototype (the review sheet cannot be dismissed without submitting, and a
// facilitator session that failed to persist is still reported as saved).
// They must not be weakened to pass.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { mockClassroom } from '../data/classroom'
import { createMemoryStorage } from '../persistence/browserStorage'
import type { SimpleStorage } from '../persistence/browserStorage'
import { SESSIONS_KEY, draftKey, loadSessions } from '../persistence/draftStore'
import { createReport, reportReducer } from '../domain/report'
import { teacherLabel } from '../domain/metrics'
import type { SessionResult } from '../domain/metrics'
import type { Child, Classroom, ReportState } from '../domain/types'

const DATE = '2026-11-03'
const YESTERDAY = '2026-11-02'
const DAY_BEFORE = '2026-11-01'
const ids20 = mockClassroom.children.map((child) => child.id)
const todayKey = draftKey(DATE)
const yesterdayKey = draftKey(YESTERDAY)

/** A complete report for the given day: every roster child attending. */
function allPresentReport(date: string): ReportState {
  let state = createReport(date, ids20)
  for (const id of ids20) state = reportReducer(state, { type: 'setAttendance', childId: id, value: 'present' })
  return state
}

function submittedReport(date: string): ReportState {
  return reportReducer(allPresentReport(date), { type: 'submit', at: date + 'T09:00:00.000Z', childIds: ids20 })
}

function storedTodayDraft(storage: SimpleStorage): ReportState | null {
  const raw = storage.getItem(todayKey)
  return raw === null ? null : (JSON.parse(raw) as ReportState)
}

/** Fails the write for selected keys only — models a quota error on one entry. */
function createFailingSetStorage(shouldFail: (key: string) => boolean, seed?: Record<string, string>): SimpleStorage {
  const inner = createMemoryStorage(seed)
  return {
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      if (shouldFail(key)) throw new Error('QuotaExceededError')
      inner.setItem(key, value)
    },
    removeItem: (key) => inner.removeItem(key),
  }
}

function seedSession(sessionId: string, label: string, reportDate: string): SessionResult {
  return {
    sessionId,
    teacherLabel: label,
    reportDate,
    startedAt: reportDate + 'T08:00:00.000Z',
    submittedAt: reportDate + 'T08:04:00.000Z',
    elapsedMs: 240_000,
    taps: 42,
    pass: true,
    attendanceComplete: true,
    attendingCount: 20,
    mealCount: 20,
    napCount: 20,
    moodCount: 20,
    exceptionChildren: 0,
    exceptionFlags: 0,
    notes: 0,
    usedAllPresent: true,
    facilitatorNotes: '',
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 1. Report-day isolation
// ---------------------------------------------------------------------------
describe('report day isolation', () => {
  it("never reads another day's draft or submitted report, and mounting writes nothing", () => {
    const storage = createMemoryStorage({
      [yesterdayKey]: JSON.stringify(allPresentReport(YESTERDAY)),
      [draftKey(DAY_BEFORE)]: JSON.stringify(submittedReport(DAY_BEFORE)),
    })

    render(<App reportDate={DATE} storage={storage} />)

    expect(screen.queryByTestId('success-screen')).not.toBeInTheDocument()
    expect(screen.queryByTestId('toast-restored')).not.toBeInTheDocument()
    expect(screen.getByTestId('attendance-count').textContent).toContain('٠ / ٢٠')
    expect(screen.getByTestId('submit-bar-button')).toBeDisabled()
    // no invented draft for today…
    expect(storage.getItem(todayKey)).toBeNull()
    // …and no earlier day is destroyed by loading today
    expect(storage.getItem(yesterdayKey)).not.toBeNull()
    expect(storage.getItem(draftKey(DAY_BEFORE))).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Invalid drafts are discarded, never rendered as data
// ---------------------------------------------------------------------------
type InvalidCase = { name: string; mutate: (raw: Record<string, unknown>) => void }

const invalidCases: InvalidCase[] = [
  {
    name: 'unsupported schemaVersion',
    mutate: (raw) => {
      raw['schemaVersion'] = 99
    },
  },
  {
    name: "another day stamped on today's key",
    mutate: (raw) => {
      raw['date'] = YESTERDAY
    },
  },
  {
    name: "a foreign child's entry",
    mutate: (raw) => {
      const entries = raw['entries'] as Record<string, Record<string, unknown>>
      entries['cx-foreign'] = { ...entries['c01'], childId: 'cx-foreign' }
    },
  },
]

describe('invalid drafts', () => {
  it.each(invalidCases)('$name is discarded with the Arabic warning and starts clean', (testCase) => {
    const raw = JSON.parse(JSON.stringify(allPresentReport(DATE))) as Record<string, unknown>
    testCase.mutate(raw)
    const storage = createMemoryStorage({ [todayKey]: JSON.stringify(raw) })

    render(<App reportDate={DATE} storage={storage} />)

    expect(screen.getByTestId('toast-warning').textContent).toContain('تعذّر استرجاع المسودة؛ بدأنا تقريرًا جديدًا')
    expect(screen.getByTestId('attendance-count').textContent).toContain('٠ / ٢٠')
    expect(screen.getByTestId('submit-remaining').textContent).toContain('٢٠')
    expect(screen.getByTestId('submit-bar-button')).toBeDisabled()
    expect(storage.getItem(todayKey)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Storage failures: warn, keep working, never pretend
// ---------------------------------------------------------------------------
describe('storage failures', () => {
  it('a quota failure on save warns, keeps the report editable in memory, and never claims it was saved', async () => {
    const user = userEvent.setup()
    const storage = createFailingSetStorage(() => true)
    render(<App reportDate={DATE} storage={storage} />)

    await user.click(screen.getByTestId('bulk-all-present'))
    expect(screen.getByTestId('attendance-count').textContent).toContain('٢٠ / ٢٠')

    // The synchronous page-exit save is the first write attempt.
    fireEvent(window, new Event('pagehide'))

    expect(screen.getByTestId('toast-save-error').textContent).toContain('تعذّر حفظ المسودة على هذا الجهاز')
    expect(screen.getByTestId('save-indicator').textContent).toContain('تعذّر حفظ المسودة')
    expect(screen.queryByText(/تم الحفظ/)).not.toBeInTheDocument()
    expect(storage.getItem(todayKey)).toBeNull()

    // The screen keeps working from memory.
    expect(screen.getByTestId('child-list').children).toHaveLength(20)
    await user.click(screen.getByTestId('submit-bar-button'))
    expect(screen.getByTestId('confirm-sheet')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. Facilitator sessions: append-only across reset, labels never collide
// ---------------------------------------------------------------------------
describe('facilitator reset', () => {
  it("clears only today and keeps the earlier teachers' sessions and labels apart", async () => {
    const user = userEvent.setup()
    const earlier = [seedSession('s1', teacherLabel(1), YESTERDAY), seedSession('s2', teacherLabel(2), YESTERDAY)]
    const storage = createMemoryStorage({
      [SESSIONS_KEY]: JSON.stringify(earlier),
      [yesterdayKey]: JSON.stringify(submittedReport(YESTERDAY)),
    })
    render(<App reportDate={DATE} storage={storage} facilitator />)

    // The panel starts closed so the teacher never sees the timer or the target;
    // open it with the real toggle before reading any panel content.
    const facilitatorToggle = screen.getByRole('button', { name: 'الميسّر' })
    expect(facilitatorToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('facilitator-timer')).not.toBeInTheDocument()
    await user.click(facilitatorToggle)
    expect(facilitatorToggle).toHaveAttribute('aria-expanded', 'true')

    // The next teacher is told which label is free.
    expect(screen.getByText(teacherLabel(3))).toBeInTheDocument()

    await user.click(screen.getByTestId('bulk-all-present'))
    await user.click(screen.getByTestId('submit-bar-button'))
    await user.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'إرسال التقرير' }))
    expect(await screen.findByTestId('success-screen')).toBeInTheDocument()

    await waitFor(() => expect(loadSessions(storage)).toHaveLength(3))
    const logged = loadSessions(storage)
    expect(logged[2].teacherLabel).toBe(teacherLabel(3))
    expect(logged[2].reportDate).toBe(DATE)

    await user.click(screen.getByRole('button', { name: 'بدء جلسة جديدة' }))
    await user.click(screen.getByRole('button', { name: 'نعم، ابدأ' }))

    expect(screen.getByTestId('attendance-count').textContent).toContain('٠ / ٢٠')
    expect(screen.getByTestId('submit-bar-button')).toBeDisabled()
    expect(storage.getItem(todayKey)).toBeNull()
    expect(storage.getItem(yesterdayKey)).not.toBeNull()
    expect(loadSessions(storage).map((session) => session.sessionId)).toEqual(['s1', 's2', logged[2].sessionId])
    expect(screen.getByText(teacherLabel(4))).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 5. A session that could not be written must not be reported as saved
// ---------------------------------------------------------------------------
describe('facilitator session persistence', () => {
  it('never reports a session as saved when the session log write failed', async () => {
    const user = userEvent.setup()
    const storage = createFailingSetStorage((key) => key === SESSIONS_KEY)
    render(<App reportDate={DATE} storage={storage} facilitator />)

    // The panel starts closed; open it with the real toggle before reading
    // any panel content (last result, session log, labels).
    await user.click(screen.getByRole('button', { name: 'الميسّر' }))

    await user.click(screen.getByTestId('bulk-all-present'))
    await user.click(screen.getByTestId('submit-bar-button'))
    await user.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'إرسال التقرير' }))
    expect(await screen.findByTestId('success-screen')).toBeInTheDocument()

    const lastResultRow = await screen.findByTestId('facilitator-last-result')
    // nothing reached the log…
    expect(loadSessions(storage)).toHaveLength(0)
    expect(screen.getByText('لا توجد جلسات مسجَّلة بعد')).toBeInTheDocument()
    // …so the panel must not claim it did, and must say it was not saved
    expect(lastResultRow.textContent).not.toContain('حُفظت النتيجة في السجل')
    expect(lastResultRow.textContent).toContain('تعذّر حفظ النتيجة في السجل')
  })
})

// ---------------------------------------------------------------------------
// 6. Untrusted content: inert text, no ambient leaks
// ---------------------------------------------------------------------------
describe('untrusted report content', () => {
  it('renders markup as text, executes nothing, and keeps report content out of the URL, history and console', async () => {
    const user = userEvent.setup()
    const marker = 'kidara-marker-7f3a'
    const probe = '__kidaraPwned'
    const imagesBefore = document.querySelectorAll('img').length
    const scriptsBefore = document.querySelectorAll('script').length
    const urlBefore = window.location.href
    const historyBefore = window.history.length
    const consoleCalls: string[] = []
    const recordConsole = (...args: unknown[]): void => {
      consoleCalls.push(args.map((arg) => String(arg)).join(' '))
    }
    vi.spyOn(console, 'log').mockImplementation(recordConsole)
    vi.spyOn(console, 'info').mockImplementation(recordConsole)
    vi.spyOn(console, 'warn').mockImplementation(recordConsole)
    vi.spyOn(console, 'error').mockImplementation(recordConsole)
    vi.spyOn(console, 'debug').mockImplementation(recordConsole)

    const imageTag = '<img src=x onerror="window.' + probe + '=1">'
    const hostileChild: Child = {
      id: 'cx1',
      fullName: imageTag + ' سلمى ' + marker,
      initials: 'س',
    }
    const classroom: Classroom = { name: 'فصل الفراشات', template: 'preschool', children: [hostileChild] }

    render(<App reportDate={DATE} storage={createMemoryStorage()} classroom={classroom} />)

    const row = document.querySelector<HTMLLIElement>('li.child-row[data-child-id="cx1"]')
    expect(row?.textContent).toContain(imageTag)

    await user.click(screen.getByRole('button', { name: /سلمى/ }))
    const sheet = screen.getByTestId('sheet-cx1')
    const scriptTag = '<script>window.' + probe + '=1</script>'
    const note = scriptTag + ' ' + marker
    await user.type(within(sheet).getByRole('textbox', { name: 'ملاحظة سلوك' }), note)
    await user.click(within(sheet).getByRole('button', { name: 'تم' }))

    // Rendered literally, not parsed.
    expect(row?.textContent).toContain(scriptTag)
    expect(document.querySelectorAll('img')).toHaveLength(imagesBefore)
    expect(document.querySelectorAll('script')).toHaveLength(scriptsBefore)
    expect((window as unknown as Record<string, unknown>)[probe]).toBeUndefined()

    // No ambient channel received the report content.
    expect(window.location.href).toBe(urlBefore)
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')
    expect(window.history.length).toBe(historyBefore)
    const leakingAttributes = Array.from(document.querySelectorAll('[href], [src], [action], [formaction]')).filter((el) =>
      ['href', 'src', 'action', 'formaction'].some((attr) => (el.getAttribute(attr) ?? '').includes(marker)),
    )
    expect(leakingAttributes).toEqual([])
    expect(consoleCalls.filter((line) => line.includes(marker) || line.includes(probe))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7. Attendance gate and denominators
// ---------------------------------------------------------------------------
describe('attendance gate', () => {
  it('blocks submit while a child is unmarked and drops absent children from bulk counts and denominators', async () => {
    const user = userEvent.setup()
    // 19 present, c20 unmarked — the teacher stopped before the last child.
    let partial = createReport(DATE, ids20)
    for (const id of ids20.slice(0, 19)) partial = reportReducer(partial, { type: 'setAttendance', childId: id, value: 'present' })
    const storage = createMemoryStorage({ [todayKey]: JSON.stringify(partial) })
    render(<App reportDate={DATE} storage={storage} facilitator />)

    expect(screen.getByTestId('toast-restored')).toBeInTheDocument()
    expect(screen.getByTestId('submit-bar-button')).toBeDisabled()
    expect(screen.getByTestId('submit-remaining').textContent).toContain('طفل واحد')
    fireEvent.click(screen.getByTestId('submit-bar-button'))
    expect(screen.queryByTestId('confirm-sheet')).not.toBeInTheDocument()

    // Finish the roster.
    await user.click(screen.getByRole('button', { name: /يوسف أحمد شاهين:/ }))
    const lastSheet = screen.getByTestId('sheet-c20')
    await user.click(within(lastSheet).getByTestId('attendance-present'))
    await user.click(within(lastSheet).getByRole('button', { name: 'تم' }))
    expect(screen.getByTestId('submit-bar-button')).toBeEnabled()

    // One child is absent; bulk fields must skip them everywhere.
    await user.click(screen.getByRole('button', { name: /آدم خالد فاروق:/ }))
    const absentSheet = screen.getByTestId('sheet-c01')
    await user.click(within(absentSheet).getByTestId('attendance-absent'))
    await user.click(within(absentSheet).getByRole('button', { name: 'تم' }))
    await user.click(screen.getByRole('button', { name: 'أكل الجميع' }))

    expect(screen.getByTestId('attendance-count').textContent).toContain('حاضر ١٩ / ٢٠')

    await user.click(screen.getByTestId('submit-bar-button'))
    const confirm = screen.getByTestId('confirm-sheet')
    // Every attending child got a meal, so there is no meal line; nap/mood denominators are 19.
    expect(within(confirm).queryByText(/^وجبة:/)).toBeNull()
    expect(confirm.textContent).toContain('من أصل ١٩ من الحاضرين')
    expect(confirm.textContent).not.toContain('من أصل ٢٠')

    await user.click(within(confirm).getByRole('button', { name: 'إرسال التقرير' }))
    expect(await screen.findByTestId('success-screen')).toBeInTheDocument()
    await waitFor(() => expect(loadSessions(storage)).toHaveLength(1))
    const session = loadSessions(storage)[0]
    expect(session.attendingCount).toBe(19)
    expect(session.mealCount).toBe(19)
    expect(session.napCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 8. Single-shot submit
// ---------------------------------------------------------------------------
describe('submit pipeline', () => {
  it('double send and Escape during the in-flight submit still log one session, and a reload stays read-only', async () => {
    const user = userEvent.setup()
    const storage = createMemoryStorage()
    const view = render(<App reportDate={DATE} storage={storage} facilitator />)

    await user.click(screen.getByTestId('bulk-all-present'))
    await user.click(screen.getByTestId('submit-bar-button'))

    const send = within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'إرسال التقرير' })
    fireEvent.click(send)
    expect(send).toBeDisabled()
    // A second click and Escape while the 400 ms write is in flight.
    fireEvent.click(send)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('success-screen')).not.toBeInTheDocument()

    expect(await screen.findByTestId('success-screen', {}, { timeout: 3000 })).toBeInTheDocument()
    await waitFor(() => expect(loadSessions(storage)).toHaveLength(1))
    expect(storedTodayDraft(storage)?.status).toBe('submitted')

    view.unmount()
    render(<App reportDate={DATE} storage={storage} facilitator />)
    expect(screen.getByTestId('success-screen')).toBeInTheDocument()
    // Reloading never re-runs the submit: no second session, no editable form.
    expect(loadSessions(storage)).toHaveLength(1)
    expect(screen.queryByTestId('submit-bar-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bulk-all-present')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 9. The review sheet is dismissible without submitting
// ---------------------------------------------------------------------------
describe('review sheet', () => {
  it('«رجوع» returns to the roster without submitting the report', async () => {
    const user = userEvent.setup()
    const storage = createMemoryStorage()
    render(<App reportDate={DATE} storage={storage} />)

    await user.click(screen.getByTestId('bulk-all-present'))
    await user.click(screen.getByTestId('submit-bar-button'))
    expect(screen.getByTestId('confirm-sheet')).toBeInTheDocument()

    await user.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'رجوع' }))

    expect(screen.queryByTestId('confirm-sheet')).not.toBeInTheDocument()
    expect(screen.getByTestId('submit-bar-button')).toBeEnabled()
    expect(screen.queryByTestId('success-screen')).not.toBeInTheDocument()
  })
})
