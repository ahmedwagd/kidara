// Pure projection tests for the parent-day builder. No DOM, no storage.

import { describe, expect, it } from 'vitest'
import { buildParentDay, isPublished, mockApprovals } from './parentDay'
import { mockClassroom } from './classroom'
import { createReport, reportReducer } from '../domain/report'
import type { ReportState, SheetEntry } from '../domain/types'

const DATE = '2026-11-03'
const ids = mockClassroom.children.map((c) => c.id)

function seededReport(status: 'draft' | 'submitted'): ReportState {
  let state = createReport(DATE, ids)
  for (const id of ids) state = reportReducer(state, { type: 'setAttendance', childId: id, value: 'present' })
  state = reportReducer(state, {
    type: 'updateEntry',
    childId: 'c18',
    patch: { meal: 'full', nap: 'slept', mood: 'happy', behaviorNote: 'يوم هادئ مع الأصدقاء' } as Partial<Omit<SheetEntry, 'childId'>>,
  })
  state = reportReducer(state, { type: 'updateEntry', childId: 'c19', patch: { attendance: 'absent' } })
  return status === 'submitted' ? { ...state, status: 'submitted', submittedAt: `${DATE}T10:30:00.000Z` } : state
}

function build(childId: string, report: ReportState | null, approvals: Readonly<Record<string, boolean>> = mockApprovals) {
  return buildParentDay({ childId, classroom: mockClassroom, report, approvals })
}

describe('isPublished', () => {
  it('a submitted report counts as published', () => {
    expect(isPublished(seededReport('submitted'))).toBe(true)
  })

  it('a draft (or null) counts as not published', () => {
    expect(isPublished(seededReport('draft'))).toBe(false)
    expect(isPublished(null)).toBe(false)
  })
})

describe('buildParentDay', () => {
  it('published + approved: returns facts and the approved note', () => {
    const result = build('c18', seededReport('submitted'))
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.day.fullName).toBe('ملك طارق شعبان')
    expect(result.day.attendance).toBe('present')
    expect(result.day.meal).toBe('full')
    expect(result.day.nap).toBe('slept')
    expect(result.day.mood).toBe('happy')
    expect(result.day.allergyLabel).toBe('حساسية الحليب (بروتين أبقار)')
    expect(result.day.behaviorNote).toBe('يوم هادئ مع الأصدقاء')
  })

  it('an unapproved note is hidden', () => {
    // c01 has note text in every entry (empty at seed) — give c01 a note, c01 is not approved.
    const report = seededReport('draft')
    const submitted = { ...buildDraftWithNote(report, 'c01'), status: 'submitted' as const, submittedAt: `${DATE}T09:00:00.000Z` }
    const result = build('c01', submitted)
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.day.behaviorNote).toBeNull()
  })

  it('a missing approval key hides the note (missing approval = false)', () => {
    const submitted = seededReport('submitted')
    const approvals: Readonly<Record<string, boolean>> = {} // c18 not present at all
    const result = build('c18', submitted, approvals)
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.day.behaviorNote).toBeNull()
  })

  it('an approved but whitespace-only note is null', () => {
    const submitted = seededReport('submitted')
    const entries = { ...submitted.entries }
    entries['c18'] = { ...entries['c18']!, behaviorNote: '   ' }
    const patched = { ...submitted, entries }
    const result = build('c18', patched)
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.day.behaviorNote).toBeNull()
  })

  it('a draft report → not-published with hasStoredReport true', () => {
    const result = build('c18', seededReport('draft'))
    expect(result).toEqual({ kind: 'not-published', hasStoredReport: true })
  })

  it('a null report → not-published with hasStoredReport false', () => {
    expect(build('c18', null)).toEqual({ kind: 'not-published', hasStoredReport: false })
  })

  it('an unknown child id → unknown-child', () => {
    expect(build('zzz', seededReport('submitted'))).toEqual({ kind: 'unknown-child' })
  })

  it('an empty childId → unknown-child', () => {
    expect(build('', seededReport('submitted'))).toEqual({ kind: 'unknown-child' })
  })

  it('unset meal/nap/mood pass through as unset values', () => {
    // c02 kept at seed defaults: present with unset fields; entry note is '' (trimmed non-empty fails) so no note.
    const result = build('c02', seededReport('submitted'))
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.day.meal).toBe('unset')
    expect(result.day.nap).toBe('unset')
    expect(result.day.mood).toBe('unset')
    expect(result.day.behaviorNote).toBeNull()
  })

  it('an absent child still returns its attendance', () => {
    const result = build('c19', seededReport('submitted'))
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.day.attendance).toBe('absent')
  })

  it('published but missing entry → not-published defensively (validation makes this unreachable)', () => {
    const submitted = seededReport('submitted')
    const entries = { ...submitted.entries }
    delete entries['c05']
    const result = build('c05', { ...submitted, entries })
    expect(result.kind).toBe('not-published')
    if (result.kind === 'not-published') expect(result.hasStoredReport).toBe(true)
  })
})

/** Puts a note on the given child in a draft (the reducer writes it straight). */
function buildDraftWithNote(state: ReportState, childId: string): ReportState {
  return {
    ...state,
    entries: {
      ...state.entries,
      [childId]: { ...state.entries[childId]!, behaviorNote: 'ملاحظة غير معتمدة' },
    },
  }
}
