// Hostile/negative tests for the read-only parent day screen (Phase 0, task 2).
// Each block attacks one rule that must stay impossible: approval leaks, draft
// leaks, cross-child leaks, storage writes, URL mutation, crash paths, route
// precedence, retry behavior and absent children.
//
// Fake seeded children only. Deterministic report day 2026-11-03. Storage is
// always in memory (the real localStorage is never used). The jsdom URL is
// switched per test with replaceState and restored in afterEach.
//
// A failure here is a real defect in the prototype: keep it red, never weaken it.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../App'
import { mockClassroom } from '../data/classroom'
import { buildParentDay, isPublished } from '../data/parentDay'
import type { ParentDay, ParentDayResult } from '../data/parentDay'
import { createMemoryStorage } from '../persistence/browserStorage'
import type { SimpleStorage } from '../persistence/browserStorage'
import { SESSIONS_KEY, draftKey } from '../persistence/draftStore'
import { createReport } from '../domain/report'
import type { ReportState, SheetEntry } from '../domain/types'
import { copy, facilitatorCopy, formatDateLong, parentCopy } from '../copy'

const DATE = '2026-11-03'
const OTHER_DATE = '2026-11-02'
const todayKey = draftKey(DATE)
const staleKey = draftKey(OTHER_DATE)
const SESSIONS_BYTES = '[{"sessionId":"seeded","teacherLabel":"معلمة ١"}]'
const ids = mockClassroom.children.map((child) => child.id)

function childOf(id: string) {
  const child = mockClassroom.children.find((candidate) => candidate.id === id)
  if (!child) throw new Error('missing fixture child ' + id)
  return child
}

const C18_NAME = childOf('c18').fullName
const C19_NAME = childOf('c19').fullName
const C18_ALLERGY = childOf('c18').allergy?.label ?? ''
const C18_NOTE = 'ملاحظة معتمدة لطفل آخر'
const C20_NOTE = 'ملاحظة معتمدة لطفل ثالث'
const OTHER_NAMES = mockClassroom.children.filter((child) => child.id !== 'c19').map((child) => child.fullName)

/** Complete roster report for the day; everyone present unless a patch says otherwise. */
function completeReport(date: string): ReportState {
  const base = createReport(date, ids)
  const entries: Record<string, SheetEntry> = {}
  for (const id of ids) entries[id] = { ...base.entries[id], attendance: 'present' }
  return { ...base, entries }
}

function withEntry(report: ReportState, childId: string, patch: Partial<Omit<SheetEntry, 'childId'>>): ReportState {
  // A cast is honest here: the spread keeps every other required field intact.
  const entry = { ...report.entries[childId], ...patch, childId } as SheetEntry
  return { ...report, entries: { ...report.entries, [childId]: entry } }
}

function published(report: ReportState): ReportState {
  return { ...report, status: 'submitted', submittedAt: DATE + 'T10:30:00.000Z' }
}

function readyDay(result: ParentDayResult): ParentDay {
  if (result.kind !== 'ready') throw new Error('expected a ready day, got ' + result.kind)
  return result.day
}

type Probe = {
  storage: SimpleStorage
  calls: string[]
  bytes: (key: string) => string | null
}

/** In-memory storage that records every operation and exposes the raw bytes. */
function probeStorage(seed: Record<string, string> = {}): Probe {
  const inner = createMemoryStorage(seed)
  const calls: string[] = []
  return {
    calls,
    bytes: (key) => inner.getItem(key),
    storage: {
      getItem(key) {
        calls.push('read:' + key)
        return inner.getItem(key)
      },
      setItem(key, value) {
        calls.push('write:' + key)
        inner.setItem(key, value)
      },
      removeItem(key) {
        calls.push('remove:' + key)
        inner.removeItem(key)
      },
    },
  }
}

function readsOf(probe: Probe, key: string): number {
  return probe.calls.filter((call) => call === 'read:' + key).length
}

function writesOf(probe: Probe): string[] {
  return probe.calls.filter((call) => !call.startsWith('read:'))
}

function setUrl(search: string): void {
  window.history.replaceState({}, '', '/' + search)
}

function renderApp(search: string, storage: SimpleStorage) {
  setUrl(search)
  return render(<App reportDate={DATE} storage={storage} />)
}

function baseSubmitted(): ReportState {
  return published(withEntry(completeReport(DATE), 'c18', { behaviorNote: C18_NOTE }))
}

function missingSubmittedAt(): string {
  const clone: Record<string, unknown> = { ...baseSubmitted() }
  delete clone.submittedAt
  return JSON.stringify(clone)
}

function invalidMealPayload(): string {
  const raw = JSON.parse(JSON.stringify(baseSubmitted())) as { entries: Record<string, Record<string, unknown>> }
  raw.entries.c05.meal = 'pizza'
  return JSON.stringify(raw)
}

const BROKEN_PAYLOADS: Array<[string, string]> = [
  ['unparseable JSON', '{"schemaVersion":1,'],
  ['JSON null', 'null'],
  ['JSON number', '42'],
  ['JSON string', '"report"'],
  ['JSON array', '[]'],
  ['wrong schemaVersion', JSON.stringify({ ...baseSubmitted(), schemaVersion: 2 })],
  ['wrong report date', JSON.stringify({ ...baseSubmitted(), date: OTHER_DATE })],
  ['missing submittedAt', missingSubmittedAt()],
  ['entries as an array', JSON.stringify({ ...baseSubmitted(), entries: [] })],
  ['entries as a string', JSON.stringify({ ...baseSubmitted(), entries: 'nope' })],
  ['invalid meal enum', invalidMealPayload()],
  ['unknown status', JSON.stringify({ ...baseSubmitted(), status: 'published' })],
  ['numeric submittedAt', JSON.stringify({ ...baseSubmitted(), submittedAt: 42 })],
]

const BAD_CHILD_IDS: Array<[string, string]> = [
  ['empty', ''],
  ['spaces only', '   '],
  ['SQL injection shape', "c18' OR 1=1"],
  ['very long', 'x'.repeat(5000)],
  ['prototype key', '__proto__'],
  ['wrong case', 'C18'],
]

afterEach(() => {
  window.history.replaceState({}, '', '/')
  cleanup()
  vi.restoreAllMocks()
})

describe('approval leak', () => {
  it('never renders an unapproved note: c18 is approved, c19 is not', async () => {
    const c19Note = 'نور شارك في النشاط بحماس'
    const report = published(withEntry(completeReport(DATE), 'c19', { behaviorNote: c19Note }))
    const { container } = renderApp('?view=parent&child=c19', createMemoryStorage({ [todayKey]: JSON.stringify(report) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByTestId('parent-day-name').textContent).toBe(C19_NAME)
    expect(screen.getByTestId('parent-day-note').textContent).toContain(parentCopy.noBehaviorNote)
    expect(container.textContent).not.toContain(c19Note)
  })

  it('treats a whitespace-only note as no note even for an approved child', async () => {
    const whitespace = '  ' + String.fromCharCode(9, 10, 13) + '   '
    const report = published(withEntry(completeReport(DATE), 'c18', { behaviorNote: whitespace }))
    renderApp('?view=parent&child=c18', createMemoryStorage({ [todayKey]: JSON.stringify(report) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    // Exactly one paragraph, and it is the neutral Arabic message: no blank
    // whitespace paragraph sneaked in through the approval gate.
    const paragraphs = Array.from(screen.getByTestId('parent-day-note').querySelectorAll('p'))
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]?.textContent).toBe(parentCopy.noBehaviorNote)
  })

  it('keeps the approval gate per child id in the projection itself', () => {
    const note = 'لعب بهدوء مع أصدقائه'
    const project = (approvals: Record<string, boolean>, behaviorNote: string = note): ParentDay =>
      readyDay(
        buildParentDay({
          childId: 'c19',
          classroom: mockClassroom,
          report: published(withEntry(completeReport(DATE), 'c19', { behaviorNote })),
          approvals,
        }),
      )

    // another child's approval must not unlock c19
    expect(project({ c18: true }).behaviorNote).toBeNull()
    // an explicit false stays closed
    expect(project({ c19: false }).behaviorNote).toBeNull()
    // missing approval stays closed
    expect(project({}).behaviorNote).toBeNull()
    // an approved but blank note stays closed
    expect(project({ c19: true }, '  ' + String.fromCharCode(9) + '   ').behaviorNote).toBeNull()
    // the approved, non-empty note is returned trimmed
    expect(project({ c19: true }, '  ' + note + '  ').behaviorNote).toBe(note)
  })
})

describe('draft leak', () => {
  it('a draft with an approved note and complete entries renders no facts and no note', async () => {
    const draft = withEntry(completeReport(DATE), 'c18', { behaviorNote: C18_NOTE })
    expect(draft.status).toBe('draft')
    const { container } = renderApp('?view=parent&child=c18', createMemoryStorage({ [todayKey]: JSON.stringify(draft) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('empty'))
    expect(screen.getByTestId('parent-day-empty').textContent).toBe(parentCopy.emptyUnpublished)
    expect(screen.queryByTestId('parent-day-facts')).toBeNull()
    expect(screen.queryByTestId('parent-day-note')).toBeNull()
    expect(screen.queryByTestId('parent-day-name')).toBeNull()
    expect(screen.queryByTestId('parent-day-allergy')).toBeNull()
    // The child name and the report day are intentional context on this state:
    // they say whose report is missing and for which day, never report content.
    expect(screen.getByTestId('parent-day-state-name').textContent).toBe(C18_NAME)
    expect(screen.getByTestId('parent-day-state-date').textContent).toBe(formatDateLong(new Date(2026, 10, 3)))
    // Context notwithstanding, the sheet stays blank: no fact rows, no note text.
    expect(container.querySelectorAll('dl, dt, dd')).toHaveLength(0)
    expect(container.textContent).not.toContain(copy.behaviorNoteTitle)
    expect(container.textContent).not.toContain(parentCopy.noBehaviorNote)
    expect(container.textContent).not.toContain(C18_NOTE)
    expect(screen.queryByText(copy.attendance.present)).toBeNull()
  })

  it('isPublished refuses drafts and the projection returns no day for them', () => {
    const draft = completeReport(DATE)
    expect(isPublished(draft)).toBe(false)
    expect(isPublished(published(draft))).toBe(true)
    expect(isPublished(null)).toBe(false)
    const result = buildParentDay({ childId: 'c18', classroom: mockClassroom, report: draft, approvals: { c18: true } })
    expect(result).toEqual({ kind: 'not-published', hasStoredReport: true })
  })
})

describe('cross-child leak', () => {
  it('?child=c19 shows only c19: never c18 name, allergy, note or recorded values', async () => {
    expect(C18_ALLERGY).not.toBe('')
    let report = completeReport(DATE)
    report = withEntry(report, 'c18', { meal: 'refused', nap: 'did_not_sleep', mood: 'upset', behaviorNote: C18_NOTE })
    report = withEntry(report, 'c19', { meal: 'partial', nap: 'slept', mood: 'happy' })
    report = withEntry(report, 'c20', { behaviorNote: C20_NOTE })
    const { container } = renderApp('?view=parent&child=c19', createMemoryStorage({ [todayKey]: JSON.stringify(published(report)) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))

    expect(screen.getByTestId('parent-day-name').textContent).toBe(C19_NAME)
    expect(screen.getByTestId('parent-day-meal').textContent).toBe(copy.meal.partial)
    expect(screen.getByTestId('parent-day-nap').textContent).toBe(copy.nap.slept)
    expect(screen.getByTestId('parent-day-mood').textContent).toBe(copy.mood.happy)

    // nothing of c18 survives on the page
    expect(container.textContent).not.toContain(C18_NAME)
    expect(container.textContent).not.toContain(C18_NOTE)
    expect(container.textContent).not.toContain(C20_NOTE)
    expect(container.textContent).not.toContain(C18_ALLERGY)
    expect(screen.queryByTestId('parent-day-allergy')).toBeNull()
    expect(screen.queryByText(copy.meal.refused)).toBeNull()
    expect(screen.queryByText(copy.nap.did_not_sleep)).toBeNull()
    expect(screen.queryByText(copy.mood.upset)).toBeNull()
    for (const name of OTHER_NAMES) expect(container.textContent).not.toContain(name)

    // no roster of the other children is rendered at all
    expect(document.querySelectorAll('li.child-row[data-child-id]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-child-id]')).toHaveLength(0)
  })

  it('duplicated child params resolve to the first child and never blend two children', async () => {
    let report = completeReport(DATE)
    report = withEntry(report, 'c18', { behaviorNote: C18_NOTE })
    report = withEntry(report, 'c19', { behaviorNote: 'ملاحظة نور' })
    const seed = { [todayKey]: JSON.stringify(published(report)) }

    const first = renderApp('?view=parent&child=c19&child=c18', createMemoryStorage(seed))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByTestId('parent-day-name').textContent).toBe(C19_NAME)
    expect(first.container.textContent).not.toContain(C18_NAME)
    expect(first.container.textContent).not.toContain(C18_NOTE)
    first.unmount()

    const second = renderApp('?view=parent&child=c18&child=c19', createMemoryStorage(seed))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByTestId('parent-day-name').textContent).toBe(C18_NAME)
    expect(second.container.textContent).not.toContain(C19_NAME)
    second.unmount()
  })
})

describe('storage is read-only', () => {
  it('ready state shows Arabic loading, reads today only and writes nothing', async () => {
    const realLocalGet = vi.spyOn(Storage.prototype, 'getItem')
    const report = published(withEntry(completeReport(DATE), 'c18', { behaviorNote: C18_NOTE }))
    const seed = { [todayKey]: JSON.stringify(report), [staleKey]: '{"stale":true}', [SESSIONS_KEY]: SESSIONS_BYTES }
    const probe = probeStorage(seed)
    renderApp('?view=parent&child=c18', probe.storage)

    expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('loading')
    expect(screen.getByText(parentCopy.loading)).toBeInTheDocument()

    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByTestId('parent-day-name').textContent).toBe(C18_NAME)
    expect(writesOf(probe)).toEqual([])
    expect(probe.calls.length).toBeGreaterThan(0)
    expect(probe.calls.every((call) => call === 'read:' + todayKey)).toBe(true)
    expect(probe.bytes(todayKey)).toBe(seed[todayKey])
    expect(probe.bytes(staleKey)).toBe(seed[staleKey])
    expect(probe.bytes(SESSIONS_KEY)).toBe(SESSIONS_BYTES)
    // a read-only sheet exposes no action and no teacher control
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(document.querySelectorAll('[data-report-control]')).toHaveLength(0)
    // the injected storage is the only one used
    expect(realLocalGet).not.toHaveBeenCalled()
  })

  it('empty state never writes and leaves every seeded key byte-identical', async () => {
    const seed = { [staleKey]: '{not json', [SESSIONS_KEY]: SESSIONS_BYTES }
    const probe = probeStorage(seed)
    renderApp('?view=parent&child=c18', probe.storage)
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('empty'))
    expect(screen.getByTestId('parent-day-empty').textContent).toBe(parentCopy.emptyNone)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(writesOf(probe)).toEqual([])
    expect(readsOf(probe, todayKey)).toBeGreaterThan(0)
    expect(probe.bytes(todayKey)).toBeNull()
    expect(probe.bytes(staleKey)).toBe(seed[staleKey])
    expect(probe.bytes(SESSIONS_KEY)).toBe(SESSIONS_BYTES)
  })

  it('error state keeps the corrupt bytes and repeated retry only re-reads', async () => {
    const corrupt = '{"schemaVersion":1,'
    const seed = { [todayKey]: corrupt, [staleKey]: 'garbage', [SESSIONS_KEY]: SESSIONS_BYTES }
    const probe = probeStorage(seed)
    const user = userEvent.setup()
    renderApp('?view=parent&child=c18', probe.storage)
    expect(await screen.findByTestId('parent-day-error')).toBeInTheDocument()
    expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('error')

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = readsOf(probe, todayKey)
      await user.click(screen.getByTestId('parent-day-retry'))
      await waitFor(() => expect(readsOf(probe, todayKey)).toBeGreaterThan(before))
      await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('error'))
    }

    expect(writesOf(probe)).toEqual([])
    expect(probe.bytes(todayKey)).toBe(corrupt)
    expect(probe.bytes(staleKey)).toBe(seed[staleKey])
    expect(probe.bytes(SESSIONS_KEY)).toBe(SESSIONS_BYTES)
  })

  it('an unknown child is rejected before any storage access', async () => {
    const seed = { [todayKey]: '{"corrupt":true', [SESSIONS_KEY]: SESSIONS_BYTES }
    const probe = probeStorage(seed)
    renderApp('?view=parent&child=c99', probe.storage)
    expect(await screen.findByTestId('parent-day-invalid')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('c99')
    expect(probe.calls).toEqual([])
    expect(probe.bytes(todayKey)).toBe(seed[todayKey])
    expect(probe.bytes(SESSIONS_KEY)).toBe(SESSIONS_BYTES)
  })
})

describe('ambient channels', () => {
  it('keeps the note, the child name and the storage key out of the console', async () => {
    const calls: string[] = []
    const record = (...args: unknown[]): void => {
      calls.push(args.map((arg) => String(arg)).join(' '))
    }
    vi.spyOn(console, 'log').mockImplementation(record)
    vi.spyOn(console, 'info').mockImplementation(record)
    vi.spyOn(console, 'warn').mockImplementation(record)
    vi.spyOn(console, 'error').mockImplementation(record)
    vi.spyOn(console, 'debug').mockImplementation(record)

    const report = published(withEntry(completeReport(DATE), 'c18', { behaviorNote: C18_NOTE }))
    renderApp('?view=parent&child=c18', createMemoryStorage({ [todayKey]: JSON.stringify(report) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    expect(calls.filter((line) => line.includes(C18_NOTE) || line.includes(C18_NAME) || line.includes(todayKey))).toEqual([])
  })
})

describe('URL is never mutated', () => {
  it('no parent state rewrites the URL or grows history', async () => {
    const report = published(completeReport(DATE))
    const scenarios: Array<{ search: string; seed: Record<string, string>; testId: string }> = [
      { search: '?view=parent&child=c18', seed: { [todayKey]: JSON.stringify(report) }, testId: 'parent-day-name' },
      { search: '?view=parent&child=c18', seed: {}, testId: 'parent-day-empty' },
      { search: '?view=parent&child=c18', seed: { [todayKey]: '{oops' }, testId: 'parent-day-error' },
      { search: '?view=parent&child=zzz', seed: {}, testId: 'parent-day-invalid' },
    ]
    for (const scenario of scenarios) {
      setUrl(scenario.search)
      const href = window.location.href
      const historyLength = window.history.length
      const view = render(<App reportDate={DATE} storage={createMemoryStorage(scenario.seed)} />)
      expect(await screen.findByTestId(scenario.testId)).toBeInTheDocument()
      expect(window.location.href).toBe(href)
      expect(window.history.length).toBe(historyLength)
      view.unmount()
    }
  })

  it('retry never rewrites the URL', async () => {
    const user = userEvent.setup()
    const probe = probeStorage({ [todayKey]: '{bad' })
    renderApp('?view=parent&child=c18', probe.storage)
    await screen.findByTestId('parent-day-error')
    const href = window.location.href
    const historyLength = window.history.length
    await user.click(screen.getByTestId('parent-day-retry'))
    await waitFor(() => expect(readsOf(probe, todayKey)).toBeGreaterThan(1))
    await screen.findByTestId('parent-day-error')
    expect(window.location.href).toBe(href)
    expect(window.history.length).toBe(historyLength)
    expect(window.location.search).toBe('?view=parent&child=c18')
  })
})

describe('route precedence', () => {
  it('?view=parent&facilitator=1 stays read-only on the parent view and never mounts the teacher app', async () => {
    const corrupt = '{"schemaVersion":1, broken'
    const seed = { [todayKey]: corrupt, [staleKey]: corrupt, [SESSIONS_KEY]: SESSIONS_BYTES }
    const probe = probeStorage(seed)
    const { container } = renderApp('?view=parent&facilitator=1&child=c18', probe.storage)

    expect(await screen.findByTestId('parent-day-error')).toBeInTheDocument()
    expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('error')

    // no teacher affordance at all
    expect(screen.queryByRole('button', { name: facilitatorCopy.toggle })).toBeNull()
    expect(screen.queryByText(facilitatorCopy.title)).toBeNull()
    expect(document.querySelector('[data-facilitator]')).toBeNull()
    expect(screen.queryByTestId('submit-bar-button')).toBeNull()
    expect(document.querySelectorAll('[data-report-control]')).toHaveLength(0)
    expect(container.querySelector('li.child-row')).toBeNull()

    // the teacher path would have deleted the corrupt draft and read the session log
    expect(writesOf(probe)).toEqual([])
    expect(probe.calls.some((call) => call.includes(SESSIONS_KEY))).toBe(false)
    expect(probe.bytes(todayKey)).toBe(corrupt)
    expect(probe.bytes(staleKey)).toBe(corrupt)
    expect(probe.bytes(SESSIONS_KEY)).toBe(SESSIONS_BYTES)
  })

  it('?child=c18 without ?view=parent keeps the teacher screen', () => {
    renderApp('?child=c18', createMemoryStorage())
    expect(screen.getByTestId('submit-bar-button')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-day')).toBeNull()
    expect(document.querySelectorAll('li.child-row[data-child-id]')).toHaveLength(ids.length)
    expect(window.location.search).toBe('?child=c18')
  })

  it('the default URL still renders the unchanged teacher screen', () => {
    renderApp('', createMemoryStorage())
    expect(screen.getByTestId('submit-bar-button')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-day')).toBeNull()
    expect(document.querySelector('[data-facilitator]')).toBeNull()
    expect(screen.getAllByText(copy.classroomName).length).toBeGreaterThan(0)
  })
})

describe('crash paths', () => {
  it.each(BROKEN_PAYLOADS)('rejects %s with the Arabic error state, never a blank screen', async (_label, payload) => {
    const probe = probeStorage({ [todayKey]: payload, [SESSIONS_KEY]: SESSIONS_BYTES })
    renderApp('?view=parent&child=c18', probe.storage)
    const error = await screen.findByTestId('parent-day-error')
    expect(error.textContent).toContain(parentCopy.error)
    expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('error')
    expect(screen.getByTestId('parent-day-retry')).toHaveTextContent(parentCopy.retry)
    expect(screen.queryByTestId('parent-day-facts')).toBeNull()
    expect(screen.queryByTestId('parent-day-name')).toBeNull()
    // The context header names the child, but the corrupt payload is never
    // echoed back: not the note, not the schema, not the storage key.
    expect(screen.getByTestId('parent-day-state-name').textContent).toBe(C18_NAME)
    expect(document.body.textContent?.trim()).not.toBe('')
    // the error must not echo the payload or the storage key
    expect(document.body.textContent).not.toContain('schemaVersion')
    expect(document.body.textContent).not.toContain(todayKey)
    expect(document.body.textContent).not.toContain(C18_NOTE)
    expect(writesOf(probe)).toEqual([])
    expect(probe.bytes(todayKey)).toBe(payload)
    expect(probe.bytes(SESSIONS_KEY)).toBe(SESSIONS_BYTES)
  })

  it('a throwing getItem shows the Arabic error with retry and never writes', async () => {
    const writes: string[] = []
    const storage: SimpleStorage = {
      getItem() {
        throw new Error('storage unavailable')
      },
      setItem() {
        writes.push('write')
      },
      removeItem() {
        writes.push('remove')
      },
    }
    const user = userEvent.setup()
    renderApp('?view=parent&child=c18', storage)
    const error = await screen.findByTestId('parent-day-error')
    expect(error.textContent).toContain(parentCopy.error)
    expect(screen.queryByTestId('parent-day-facts')).toBeNull()

    await user.click(screen.getByTestId('parent-day-retry'))
    expect(await screen.findByTestId('parent-day-error')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('error'))
    expect(writes).toEqual([])
  })

  it('renders a 10k-character approved note and stays on the ready state', async () => {
    const huge = 'ملاحظة طويلة جدا '.repeat(650)
    const report = published(withEntry(completeReport(DATE), 'c18', { behaviorNote: huge }))
    renderApp('?view=parent&child=c18', createMemoryStorage({ [todayKey]: JSON.stringify(report) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    const noteText = screen.getByTestId('parent-day-note').textContent ?? ''
    expect(noteText.length).toBeGreaterThan(10_000)
    expect(noteText).toContain(huge.trim())
    expect(screen.getByTestId('parent-day-name').textContent).toBe(C18_NAME)
  })

  it('renders script and bold markup from an approved note as inert text', async () => {
    const probeName = '__kidaraParentNoteProbe'
    const markup = '<script>window.' + probeName + ' = true</script><b>عريض</b>'
    const report = published(withEntry(completeReport(DATE), 'c18', { behaviorNote: markup }))
    const scriptsBefore = document.querySelectorAll('script').length
    renderApp('?view=parent&child=c18', createMemoryStorage({ [todayKey]: JSON.stringify(report) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))
    const noteSection = screen.getByTestId('parent-day-note')
    expect(noteSection.textContent).toContain(markup)
    expect(noteSection.querySelector('script')).toBeNull()
    expect(noteSection.querySelector('b')).toBeNull()
    expect(document.querySelectorAll('script')).toHaveLength(scriptsBefore)
    expect((window as unknown as Record<string, unknown>)[probeName]).toBeUndefined()
  })

  it.each(BAD_CHILD_IDS)('rejects a %s child id with the generic Arabic link error', async (_label, childId) => {
    const params = new URLSearchParams()
    params.set('view', 'parent')
    params.set('child', childId)
    const probe = probeStorage({ [todayKey]: JSON.stringify(published(completeReport(DATE))), [SESSIONS_KEY]: SESSIONS_BYTES })
    renderApp('?' + params.toString(), probe.storage)
    expect(await screen.findByTestId('parent-day-invalid')).toBeInTheDocument()
    expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('invalid')
    expect(screen.getByTestId('parent-day-invalid').textContent).toBe(parentCopy.invalidLink)
    expect(screen.queryByTestId('parent-day-name')).toBeNull()
    expect(probe.calls).toEqual([])
  })

  it('decodes the encoded injection child id to an unknown child, not a query', async () => {
    const probe = probeStorage({ [todayKey]: JSON.stringify(published(completeReport(DATE))) })
    renderApp('?view=parent&child=c18%27%20OR%201%3D1', probe.storage)
    expect(await screen.findByTestId('parent-day-invalid')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('OR 1=1')
    expect(probe.calls).toEqual([])
  })

  it.each(['PARENT', 'Parent', 'parent2', 'parent-'])('?view=%s falls back to the teacher screen', (view) => {
    renderApp('?view=' + view + '&child=c18', createMemoryStorage())
    expect(screen.getByTestId('submit-bar-button')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-day')).toBeNull()
  })
})

describe('absent child', () => {
  it('an absent child never renders stored meal, nap or mood values', async () => {
    const report = published(
      withEntry(completeReport(DATE), 'c19', { attendance: 'absent', meal: 'full', nap: 'slept', mood: 'happy' }),
    )
    const { container } = renderApp('?view=parent&child=c19', createMemoryStorage({ [todayKey]: JSON.stringify(report) }))
    await waitFor(() => expect(screen.getByTestId('parent-day').getAttribute('data-state')).toBe('ready'))

    expect(screen.getByTestId('parent-day-attendance').textContent).toBe(copy.attendance.absent)
    expect(screen.queryByTestId('parent-day-meal')).toBeNull()
    expect(screen.queryByTestId('parent-day-nap')).toBeNull()
    expect(screen.queryByTestId('parent-day-mood')).toBeNull()

    const facts = screen.getByTestId('parent-day-facts')
    expect(within(facts).queryByText(copy.mealSectionTitle)).toBeNull()
    expect(within(facts).queryByText(copy.napSectionTitle)).toBeNull()
    expect(within(facts).queryByText(copy.moodSectionTitle)).toBeNull()
    expect(screen.queryByText(copy.meal.full)).toBeNull()
    expect(screen.queryByText(copy.nap.slept)).toBeNull()
    expect(screen.queryByText(copy.mood.happy)).toBeNull()
    expect(container.textContent).not.toContain(copy.meal.full)
    expect(container.textContent).not.toContain(copy.nap.slept)
    expect(container.textContent).not.toContain(copy.mood.happy)
    // Parent wording, not the teacher banner: it explains why the rows are gone.
    const absentHint = screen.getByTestId('parent-day-absent-hint').textContent
    expect(absentHint).toBe(parentCopy.absentLine)
    expect(absentHint).not.toBe(copy.attendanceAbsentHint)
  })
})

describe('projection edges', () => {
  it('unknown child ids and missing entries never produce a day', () => {
    const report = published(completeReport(DATE))
    expect(buildParentDay({ childId: '', classroom: mockClassroom, report, approvals: {} })).toEqual({ kind: 'unknown-child' })
    expect(buildParentDay({ childId: 'c99', classroom: mockClassroom, report, approvals: {} })).toEqual({
      kind: 'unknown-child',
    })
    const missingEntry = { ...report, entries: { ...report.entries } }
    delete missingEntry.entries.c19
    expect(
      buildParentDay({ childId: 'c19', classroom: mockClassroom, report: missingEntry, approvals: { c19: true } }),
    ).toEqual({ kind: 'not-published', hasStoredReport: true })
  })
})
