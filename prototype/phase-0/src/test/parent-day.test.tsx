// Parent day-sheet DOM tests: routing, read-only behavior, state coverage.
// jsdom URL is switched per test with replaceState and restored in afterEach.
// Every render uses an in-memory storage (real localStorage is never touched).
// Deterministic report date 2026-11-03, seeded fake children only.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { mockClassroom } from '../data/classroom'
import { createMemoryStorage } from '../persistence/browserStorage'
import type { SimpleStorage } from '../persistence/browserStorage'
import { SESSIONS_KEY, draftKey } from '../persistence/draftStore'
import { createReport, reportReducer } from '../domain/report'
import type { ReportState } from '../domain/types'
import { parentCopy } from '../copy'

const DATE = '2026-11-03'
const ids = mockClassroom.children.map((c) => c.id)
const todayKey = draftKey(DATE)
const C18_NAME = 'ملك طارق شعبان'
const C18_NOTE = '<b>نص</b> يوم هادئ مع الأصدقاء'
const FACILITATOR_TOGGLE = 'الميسّر'
const OTHER_NAMES = mockClassroom.children.filter((c) => c.id !== 'c19').map((c) => c.fullName)

function seededReport(status: 'draft' | 'submitted', note: string = C18_NOTE): ReportState {
  let state = createReport(DATE, ids)
  for (const id of ids) state = reportReducer(state, { type: 'setAttendance', childId: id, value: 'present' })
  state = reportReducer(state, { type: 'updateEntry', childId: 'c18', patch: { meal: 'full', nap: 'slept', mood: 'happy', behaviorNote: note } })
  state = reportReducer(state, { type: 'updateEntry', childId: 'c19', patch: { attendance: 'absent' } })
  return status === 'submitted' ? { ...state, status: 'submitted', submittedAt: `${DATE}T10:30:00.000Z` } : state
}

function storageWith(...seed: Array<[key: string, value: string]>): SimpleStorage {
  return createMemoryStorage(Object.fromEntries(seed))
}

async function setUrl(search: string): Promise<void> {
  window.history.replaceState({}, '', `/${search}`)
}

afterEach(() => {
  window.history.replaceState({}, '', '/')
  cleanup()
})

describe('parent day states', () => {
  it('shows loading before the read resolves, then the ready c18 day', async () => {
    await setUrl('?view=parent&child=c18')
    render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(seededReport('submitted'))])} />)
    // The loading frame is observable because the read is scheduled on a timeout.
    expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('loading')
    expect(screen.getByText(parentCopy.loading)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByTestId('parent-day-name').textContent).toBe(C18_NAME)
    expect(screen.getByTestId('parent-day-allergy').textContent).toContain('تنبيه حساسية')
    expect(screen.getByTestId('parent-day-allergy').textContent).toContain('حساسية الحليب (بروتين أبقار)')
    expect(screen.getByTestId('parent-day-attendance').textContent).toBe('حاضر')
    expect(screen.getByTestId('parent-day-meal').textContent).toBe('أكل كامل')
    expect(screen.getByTestId('parent-day-nap').textContent).toBe('نام')
    expect(screen.getByTestId('parent-day-mood').textContent).toBe('سعيد')
    expect(screen.getByTestId('parent-day-note').textContent).toContain(C18_NOTE)
    // the teacher's submission time is not part of the parent contract
    expect(screen.queryByTestId('parent-day-published-at')).toBeNull()
    expect(screen.getByTestId('parent-day').textContent).not.toContain('وقت التسليم')
    // the ready state card header is also the page's single h1
    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })

  it('empty: no stored key → emptyNone; stored draft → emptyUnpublished with no facts', async () => {
    await setUrl('?view=parent&child=c18')
    const { unmount } = render(<App reportDate={DATE} storage={storageWith()} />)
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('empty'))
    expect(screen.getByTestId('parent-day-empty').textContent).toBe(parentCopy.emptyNone)
    // context + fallback wrap the mandated message (and never inside its testid)
    expect(screen.getByTestId('parent-day-state-name').textContent).toBe(C18_NAME)
    expect(screen.getByText(parentCopy.emptyFallback)).toBeInTheDocument()
    expect(screen.queryByTestId('parent-day-facts')).toBeNull()
    // one h1 for the card: the state meaning, not the child name
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    expect(document.querySelector('h1')?.textContent).toBe(parentCopy.emptyNone)
    unmount()

    const draft = seededReport('draft')
    render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(draft)])} />)
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('empty'))
    expect(screen.getByTestId('parent-day-empty').textContent).toBe(parentCopy.emptyUnpublished)
    expect(screen.queryByTestId('parent-day-facts')).toBeNull()
    expect(screen.queryByTestId('parent-day-note')).toBeNull()
  })

  it('error: corrupt JSON stays byte-identical, retry never writes storage', async () => {
    await setUrl('?view=parent&child=c18')
    const CORRUPT = '{{{corrupt json'
    const inner = storageWith([todayKey, CORRUPT])
    const calls: string[] = []
    const storage: SimpleStorage = {
      getItem(key) {
        calls.push(`get:${key}`)
        return inner.getItem(key)
      },
      setItem(key, value) {
        calls.push(`set:${key}`)
        inner.setItem(key, value)
      },
      removeItem(key) {
        calls.push(`del:${key}`)
        inner.removeItem(key)
      },
    }
    const user = userEvent.setup()
    render(<App reportDate={DATE} storage={storage} />)
    expect(await screen.findByTestId('parent-day-error')).toBeInTheDocument()

    // the sessions key was not touched
    expect(inner.getItem(SESSIONS_KEY)).toBeNull()
    expect(calls.some((c) => c.includes(SESSIONS_KEY))).toBe(false)

    await user.click(screen.getByTestId('parent-day-retry'))
    // retry re-runs the read and fails again the same way
    expect(await screen.findByTestId('parent-day-error')).toBeInTheDocument()
    // the corrupt value is byte-identical afterwards
    expect(inner.getItem(todayKey)).toBe(CORRUPT)
    // only reads happened — no setItem/removeItem was ever called
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((call) => call.startsWith('get:'))).toBe(true)
    // the error card keeps its fallback line and a single h1 (the state meaning)
    expect(screen.getByText(parentCopy.errorFallback)).toBeInTheDocument()
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    expect(document.querySelector('h1')?.textContent).toBe(parentCopy.error)
  })

  it('unknown child and missing child → generic invalid message, no crash', async () => {
    await setUrl('?view=parent&child=zzz')
    const { unmount } = render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(seededReport('submitted'))])} />)
    expect(await screen.findByTestId('parent-day-invalid')).toBeInTheDocument()
    expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('invalid')
    expect(screen.getByTestId('parent-day-invalid').textContent).toBe(parentCopy.invalidLink)
    // no child data leaks into the invalid card
    expect(screen.queryByTestId('parent-day-state-name')).toBeNull()
    expect(screen.queryByTestId('parent-day-state-date')).toBeNull()
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    unmount()

    await setUrl('?view=parent')
    render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(seededReport('submitted'))])} />)
    expect(await screen.findByTestId('parent-day-invalid')).toBeInTheDocument()
    expect(screen.getByTestId('parent-day-invalid').textContent).toBe(parentCopy.invalidLink)
  })

  it('the approved note renders as text only', async () => {
    await setUrl('?view=parent&child=c18')
    const { container } = render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(seededReport('submitted'))])} />)
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByTestId('parent-day-note').textContent).toContain(C18_NOTE)
    // escaped, never injected as markup
    expect(container.querySelector('b')).toBeNull()
  })

  it('child scoping: c19 never sees c18 facts, name or note', async () => {
    await setUrl('?view=parent&child=c19')
    const { container } = render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(seededReport('submitted'))])} />)
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByTestId('parent-day-name').textContent).toBe('نور وليد البنا')
    // absent child: attendance row only; meal/nap/mood rows are hidden
    expect(screen.getByTestId('parent-day-attendance').textContent).toBe('غائب')
    expect(screen.queryByTestId('parent-day-meal')).toBeNull()
    expect(screen.queryByTestId('parent-day-nap')).toBeNull()
    expect(screen.queryByTestId('parent-day-mood')).toBeNull()
    expect(container.textContent).not.toContain(C18_NAME)
    expect(container.textContent).not.toContain(C18_NOTE)
    for (const name of OTHER_NAMES) {
      expect(container.textContent).not.toContain(name)
    }
    // the absent hint IS shown with the attendance fact — parent wording, not the teacher's
    expect(container.textContent).toContain('غائب')
    expect(screen.getByTestId('parent-day-absent-hint').textContent).toBe(parentCopy.absentLine)
  })

  it('a draft with an approved note still shows nothing', async () => {
    await setUrl('?view=parent&child=c18')
    render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(seededReport('draft'))])} />)
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('empty'))
    expect(screen.getByTestId('parent-day-empty').textContent).toBe(parentCopy.emptyUnpublished)
    expect(screen.queryByTestId('parent-day-facts')).toBeNull()
    expect(screen.queryByTestId('parent-day-note')).toBeNull()
    expect(screen.queryByText(C18_NOTE)).toBeNull()
  })
})

describe('routing around the parent view', () => {
  it('the default URL still renders the teacher screen and never mutates the URL', async () => {
    await setUrl('')
    render(<App reportDate={DATE} storage={storageWith()} />)
    expect(screen.getByTestId('submit-bar-button')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-day')).toBeNull()
    expect(window.location.pathname + window.location.search).toBe('/')
  })

  it('?facilitator=1 alone keeps the facilitator toggle on the teacher screen', async () => {
    await setUrl('?facilitator=1')
    render(<App reportDate={DATE} storage={storageWith()} />)
    expect(screen.getByRole('button', { name: FACILITATOR_TOGGLE })).toBeInTheDocument()
    expect(screen.queryByTestId('parent-day')).toBeNull()
  })

  it('?view=parent&facilitator=1 shows the parent view without the facilitator toggle', async () => {
    await setUrl('?view=parent&facilitator=1&child=c18')
    render(<App reportDate={DATE} storage={storageWith([todayKey, JSON.stringify(seededReport('submitted'))])} />)
    expect(await screen.findByTestId('parent-day-name')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: FACILITATOR_TOGGLE })).toBeNull()
    expect(screen.queryByTestId('submit-bar-button')).toBeNull()
    expect(window.location.pathname + window.location.search).toBe('/?view=parent&facilitator=1&child=c18')
  })

  it('?child=c18 alone renders the teacher screen (the param is ignored)', async () => {
    await setUrl('?child=c18')
    render(<App reportDate={DATE} storage={storageWith()} />)
    expect(screen.getByTestId('submit-bar-button')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-day')).toBeNull()
    expect(window.location.pathname + window.location.search).toBe('/?child=c18')
  })
})
