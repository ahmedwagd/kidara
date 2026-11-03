// Critical path test: render the classroom screen and walk the whole daily
// loop — bulk present, per-child sheet, bulk fields, submit, session metrics,
// draft restore, corrupt payloads, storage failure. Fake seeded children only;
// deterministic report date 2026-11-03; in-memory storage.

import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { mockClassroom, emptyClassroom } from '../data/classroom'
import { createMemoryStorage, createBrokenStorage } from '../persistence/browserStorage'
import type { SimpleStorage } from '../persistence/browserStorage'
import { DRAFT_PREFIX, DRAFT_SUFFIX, loadSessions } from '../persistence/draftStore'
import { createReport, reportReducer, canSubmit, computeExceptions, computeSummary } from '../domain/report'
import type { ReportState } from '../domain/types'

const DATE = '2026-11-03'
const ids20 = mockClassroom.children.map((c) => c.id)
const draftKeyToday = `${DRAFT_PREFIX}${DATE}${DRAFT_SUFFIX}`

function fullReport(date = DATE): ReportState {
  let state = createReport(date, ids20)
  for (const id of ids20) state = reportReducer(state, { type: 'setAttendance', childId: id, value: 'present' })
  return state
}

function readSessions(storage: SimpleStorage): ReturnType<typeof loadSessions> {
  return loadSessions(storage)
}

const childRow = (id: string) => document.querySelector<HTMLLIElement>(`li.child-row[data-child-id="${id}"]`)
const sheet = (id: string) => document.querySelector<HTMLElement>(`[data-testid="sheet-${id}"]`)

async function openChild(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(screen.getByRole('button', { name: new RegExp(`${mockClassroom.children.find((c) => c.id === id)?.fullName}:`) }))
}

function completeAllAttendance(state: ReportState): ReportState {
  let next = state
  for (const id of ids20) next = reportReducer(next, { type: 'setAttendance', childId: id, value: 'present' })
  return next
}

describe('classroom render — roster and initial state', () => {
  it('shows the classroom header and all 20 child rows', () => {
    render(<App reportDate={DATE} storage={createMemoryStorage()} />)
    expect(screen.getByTestId('classroom-header')).toBeInTheDocument()
    expect(screen.getByTestId('classroom-header').textContent).toContain('فصل الفراشات')
    expect(screen.getByTestId('child-list').children).toHaveLength(20)
    expect(screen.getByTestId('attendance-count').textContent).toContain('٢٠')
  })

  it('submit is disabled initially and remaining text shows 20', () => {
    render(<App reportDate={DATE} storage={createMemoryStorage()} />)
    expect(screen.getByTestId('submit-bar-button')).toBeDisabled()
    expect(screen.getByTestId('submit-remaining').textContent).toMatch(/٢٠/)
  })
})

describe('daily loop', () => {
  it('«الكل حاضر» marks 20/20 and enables submit', async () => {
    const user = userEvent.setup()
    render(<App reportDate={DATE} storage={createMemoryStorage()} />)
    await user.click(screen.getByTestId('bulk-all-present'))
    expect(screen.getByTestId('attendance-count').textContent).toContain('٢٠ / ٢٠')
    expect(screen.getByTestId('submit-bar-button')).toBeEnabled()
  })

  it('per-child sheet: absent clears and disables daily fields', async () => {
    const user = userEvent.setup()
    render(<App reportDate={DATE} storage={createMemoryStorage()} />)
    await user.click(screen.getByTestId('bulk-all-present'))

    await openChild(user, 'c01')
    expect(sheet('c01')).toBeInTheDocument()
    await user.click(within(sheet('c01') as HTMLElement).getByTestId('attendance-absent'))
    await user.click(within(sheet('c01') as HTMLElement).getByRole('button', { name: 'تم' }))
    expect(sheet('c01')).not.toBeInTheDocument()
    expect(childRow('c01')?.textContent).toContain('غائب')

    // Reopen: daily fields are disabled and cleared while absent.
    await openChild(user, 'c01')
    const s = sheet('c01') as HTMLElement
    await waitFor(() => expect(within(s).getByTestId('attendance-absent')).toHaveAttribute('aria-pressed', 'true'))
    for (const button of within(s).getAllByRole('button', { name: /أكل|نام|لا شيء|بول|تبرز|كلاهما/ })) {
      expect(button).toBeDisabled()
    }
  })

  it('bulk meal/nap/mood reach a present child', async () => {
    const user = userEvent.setup()
    render(<App reportDate={DATE} storage={createMemoryStorage()} />)
    await user.click(screen.getByTestId('bulk-all-present'))
    await user.click(screen.getByRole('button', { name: 'أكل الجميع' }))
    await user.click(screen.getByRole('button', { name: 'نام الجميع' }))
    await user.click(screen.getByRole('button', { name: 'مزاج الجميع: هادئ' }))

    await openChild(user, 'c02')
    const s = sheet('c02') as HTMLElement
    expect(within(s).getByRole('button', { name: 'أكل كامل' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(s).getByRole('button', { name: 'نام' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(s).getByRole('button', { name: 'هادئ', description: '' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('meal ▾ alternative «الجميع: رفض الأكل» reaches only the 19 attending children', async () => {
    const user = userEvent.setup()
    render(<App reportDate={DATE} storage={createMemoryStorage()} />)
    await user.click(screen.getByTestId('bulk-all-present'))

    // Mark one child absent through the child sheet, as in the per-child test above.
    await openChild(user, 'c01')
    await user.click(within(sheet('c01') as HTMLElement).getByTestId('attendance-absent'))
    await user.click(within(sheet('c01') as HTMLElement).getByRole('button', { name: 'تم' }))
    expect(sheet('c01')).not.toBeInTheDocument()
    expect(screen.getByTestId('attendance-count').textContent).toContain('١٩ / ٢٠')

    // Open the meal bulk button's ▾ menu and pick the alternative bulk value.
    await user.click(screen.getByRole('button', { name: 'بديل: أكل الجميع' }))
    await user.click(screen.getByRole('button', { name: 'الجميع: رفض الأكل' }))

    // All 19 attending rows carry the «رفض» meal badge; the absent row has no badge.
    const rows = Array.from(document.querySelectorAll<HTMLLIElement>('li.child-row'))
    expect(rows).toHaveLength(20)
    for (const row of rows) {
      const badge = row.querySelector('.child-row__badge')
      if (row.getAttribute('data-child-id') === 'c01') {
        expect(badge).toBeNull()
        expect(row.textContent).toContain('غائب')
      } else {
        expect(badge?.textContent).toBe('رفض')
        expect(row.textContent).toContain('حاضر')
      }
    }

    // Spot-check one sheet: the meal value is «رفض الأكل», not the default «أكل كامل».
    await openChild(user, 'c02')
    const c02 = sheet('c02') as HTMLElement
    expect(within(c02).getByRole('button', { name: 'رفض الأكل' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(c02).getByRole('button', { name: 'أكل كامل' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('submit pipeline — success, read-only, session metrics', () => {
  it('full happy path: confirm shows counts/exceptions, submits, stores exactly one session', async () => {
    const user = userEvent.setup()
    const storage = createMemoryStorage()
    render(<App reportDate={DATE} storage={storage} facilitator />)

    await user.click(screen.getByTestId('bulk-all-present'))
    // c01 becomes late — a status that is both attending and an exception flag
    await openChild(user, 'c01')
    const s = sheet('c01') as HTMLElement
    await user.click(within(s).getByTestId('attendance-late'))
    await user.click(within(s).getByRole('button', { name: 'تم' }))

    await user.click(screen.getByTestId('submit-bar-button'))
    const confirm = screen.getByTestId('confirm-sheet')
    // counts appear in the confirmation (19 late counted separately)
    expect(confirm.textContent).toContain('مراجعة قبل التسليم')
    // exception names include the late child
    expect(within(confirm).getByTestId('exception-names').textContent).toContain('آدم خالد فاروق')

    await user.click(within(confirm).getByRole('button', { name: 'إرسال التقرير' }))
    expect(await screen.findByTestId('success-screen')).toBeInTheDocument()
    // read-only: no edit affordances after submit
    expect(screen.queryByTestId('submit-bar-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bulk-all-present')).not.toBeInTheDocument()
    // elapsed time is visible (the success card has the elapsed row) — it is not null:
    // facilitator session started on the first report interaction.
    // the finalize effect renders the elapsed row one tick after the success
    // screen itself — await it like any other async UI.
    expect(await screen.findByText('زمن الإنجاز')).toBeInTheDocument()
    expect(screen.getByText('وقت التسليم')).toBeInTheDocument()
    expect(screen.getByText('التقرير مسلَّم، ولا تعديل في هذا النموذج.')).toBeInTheDocument()

    // exactly one stored session with the expected facts
    const sessions = readSessions(storage)
    expect(sessions).toHaveLength(1)
    const session = sessions[0]
    expect(session?.attendanceComplete).toBe(true)
    expect(session?.usedAllPresent).toBe(true)
    expect(session?.attendingCount).toBe(20) // late still counts as attending
    expect(session?.exceptionChildren).toBe(1)
    expect(session?.exceptionFlags).toBe(1)
    expect(session?.pass).toBe(true)
    expect(session?.reportDate).toBe(DATE)
  })

  it('double-clicking send does not create a second session', async () => {
    const user = userEvent.setup()
    const storage = createMemoryStorage()
    render(<App reportDate={DATE} storage={storage} facilitator />)

    await user.click(screen.getByTestId('bulk-all-present'))
    await user.click(screen.getByTestId('submit-bar-button'))
    await waitFor(() => expect(screen.getByTestId('confirm-sheet')).toBeInTheDocument())
    const send = within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'إرسال التقرير' })
    // Only the first of two near-simultaneous clicks must go through.
    fireEvent.click(send)
    fireEvent.click(send)
    expect(await screen.findByTestId('success-screen')).toBeInTheDocument()
    await waitFor(() => expect(readSessions(storage)).toHaveLength(1))
  })

  it('error simulation: first send fails once, retry succeeds, still one session', async () => {
    const user = userEvent.setup()
    const storage = createMemoryStorage()
    render(<App reportDate={DATE} storage={storage} facilitator />)

    await user.click(screen.getByTestId('bulk-all-present'))
    // The facilitator panel starts closed — open it to reach the error-sim toggle.
    await user.click(screen.getByRole('button', { name: 'الميسّر' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByTestId('submit-bar-button'))
    expect(await screen.findByTestId('confirm-sheet')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'إرسال التقرير' }))
    expect(await screen.findByTestId('submit-error')).toBeInTheDocument()
    expect(screen.getByTestId('submit-error').textContent).toContain('تعذَّر تسليم التقرير')

    // retry → the submit runs again directly: success, no second confirm sheet
    await user.click(within(screen.getByTestId('submit-error')).getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByTestId('success-screen')).toBeInTheDocument()
    expect(screen.queryByTestId('confirm-sheet')).not.toBeInTheDocument()
    await waitFor(() => expect(readSessions(storage)).toHaveLength(1))
  })
})

describe('empty classroom', () => {
  it('shows the empty state and keeps submit disabled', () => {
    render(<App reportDate={DATE} classroom={emptyClassroom()} storage={createMemoryStorage()} />)
    expect(screen.getByTestId('empty-classroom')).toBeInTheDocument()
    expect(screen.getByTestId('submit-bar-button')).toBeDisabled()
    expect(screen.queryByTestId('child-list')).not.toBeInTheDocument()
  })
})

describe('draft persistence', () => {
  it('pagehide saves the draft; remount restores it with a toast and 20/20', async () => {
    const user = userEvent.setup()
    const storage = createMemoryStorage()
    const { unmount } = render(<App reportDate={DATE} storage={storage} />)
    await user.click(screen.getByTestId('bulk-all-present'))
    fireEvent(window, new Event('pagehide'))
    expect(storage.getItem(draftKeyToday)).not.toBeNull()
    unmount()

    render(<App reportDate={DATE} storage={storage} />)
    expect(await screen.findByTestId('toast-restored')).toBeInTheDocument()
    expect(screen.getByTestId('attendance-count').textContent).toContain('٢٠ / ٢٠')
    expect(screen.getByTestId('submit-bar-button')).toBeEnabled()
  })

  it('a submitted report reloads to the read-only success screen', async () => {
    const user = userEvent.setup()
    const storage = createMemoryStorage()
    const first = render(<App reportDate={DATE} storage={storage} facilitator />)
    await user.click(screen.getByTestId('bulk-all-present'))
    await user.click(screen.getByTestId('submit-bar-button'))
    await user.click(within(screen.getByTestId('confirm-sheet')).getByRole('button', { name: 'إرسال التقرير' }))
    expect(await screen.findByTestId('success-screen')).toBeInTheDocument()
    first.unmount()

    render(<App reportDate={DATE} storage={storage} />)
    expect(screen.getByTestId('success-screen')).toBeInTheDocument()
    // no edit UI on reload
    expect(screen.queryByTestId('bulk-all-present')).not.toBeInTheDocument()
    expect(screen.queryByTestId('submit-bar-button')).not.toBeInTheDocument()
    expect(screen.getByText('التقرير مسلَّم، ولا تعديل في هذا النموذج.')).toBeInTheDocument()
  })

  it('a corrupt draft warns, starts fresh and removes the key', () => {
    const storage = createMemoryStorage({ [draftKeyToday]: '{{{corrupt json' })
    render(<App reportDate={DATE} storage={storage} />)
    expect(screen.getByTestId('toast-warning')).toBeInTheDocument()
    expect(screen.getByTestId('attendance-count').textContent).toContain('٠ / ٢٠')
    expect(storage.getItem(draftKeyToday)).toBeNull()
  })

  it('when storage is unavailable the app warns and still works', async () => {
    const user = userEvent.setup()
    render(<App reportDate={DATE} storage={createBrokenStorage()} />)
    expect(screen.getByTestId('toast-warning').textContent).toContain('الحفظ على هذا الجهاز غير متاح')
    // still renders the roster and still opens a child sheet
    expect(screen.getByTestId('child-list').children).toHaveLength(20)
    await openChild(user, 'c03')
    expect(sheet('c03')).toBeInTheDocument()
  })

  it('yesterday’s key is never read for today', () => {
    const storage = createMemoryStorage({ [`${DRAFT_PREFIX}2026-11-02${DRAFT_SUFFIX}`]: JSON.stringify(fullReport('2026-11-02')) })
    render(<App reportDate={DATE} storage={storage} />)
    expect(screen.queryByTestId('toast-restored')).not.toBeInTheDocument()
    expect(screen.getByTestId('attendance-count').textContent).toContain('٠ / ٢٠')
    expect(storage.getItem(draftKeyToday)).toBeNull()
  })
})

// Contract guards mirrored at the integration level (pure helpers, not DOM):
// absent children are excluded from bulk field denominators on submit.
describe('submit guard rails', () => {
  it('a report with an unmarked roster child cannot pass canSubmit with the roster', () => {
    const state = createReport(DATE, ids20)
    for (const id of ids20.slice(0, 19)) {
      // id typed as string; direct reducer dispatch keeps this pure
      state.entries[id] = { ...state.entries[id], attendance: 'present' }
      // eslint wants immutability above; reconstruct instead
    }
    // rebuild immutably to be safe
    let next = createReport(DATE, ids20)
    for (const id of ids20.slice(0, 19)) next = reportReducer(next, { type: 'setAttendance', childId: id, value: 'present' })
    expect(canSubmit(next, ids20)).toBe(ids20.slice(0, 19).length === 20)
  })

  it('exception facts drive the confirmation names list', () => {
    let state = completeAllAttendance(createReport(DATE, ids20))
    state = reportReducer(state, { type: 'updateEntry', childId: 'c05', patch: { meal: 'refused' } })
    const ex = computeExceptions(state, ids20)
    expect(ex.children).toEqual(['c05'])
    expect(computeSummary(state, ids20).attending).toBe(20)
  })
})
