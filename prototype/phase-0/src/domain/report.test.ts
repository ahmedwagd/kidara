// Unit tests for the pure report reducer + completeness/exception rules.
// Seeded fake children only; deterministic report date 2026-11-03.

import { describe, expect, it } from 'vitest'
import {
  canSubmit,
  computeCompleteness,
  computeExceptions,
  computeNotes,
  computeSummary,
  completenessWarnings,
  createReport,
  fieldPercent,
  missingAttendanceCount,
  reportReducer,
} from './report'
import type { AttendanceStatus } from './types'

const DATE = '2026-11-03'
const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${String(i + 1).padStart(2, '0')}`)
const ids20 = ids(20)

/** A half-marked report: first 10 present, next 5 absent, last 5 unmarked. */
function partialReport() {
  let state = createReport(DATE, ids20)
  const ids20List = ids20
  for (let i = 0; i < 10; i++) state = reportReducer(state, { type: 'setAttendance', childId: ids20List[i], value: 'present' })
  for (let i = 10; i < 15; i++) state = reportReducer(state, { type: 'setAttendance', childId: ids20List[i], value: 'absent' })
  return state
}

describe('createReport / createEntry', () => {
  it('creates one entry per child with null attendance and unset daily fields', () => {
    const state = createReport(DATE, ids20)
    expect(Object.keys(state.entries)).toHaveLength(20)
    expect(state.date).toBe(DATE)
    expect(state.status).toBe('draft')
    for (const id of ids20) {
      expect(state.entries[id]).toEqual({
        childId: id,
        attendance: null,
        meal: 'unset',
        nap: 'unset',
        mood: 'unset',
        toilet: { count: 0, type: 'unset' },
        behaviorNote: '',
      })
    }
  })

  it('does not create shared entry objects', () => {
    const state = createReport(DATE, ids20)
    expect(state.entries['c01']).not.toBe(state.entries['c02'])
  })
})

describe('reportReducer — markAllPresent', () => {
  it('sets all 20 to present and preserves other fields', () => {
    let state = createReport(DATE, ids20)
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'partial', behaviorNote: 'ملاحظة' } })
    state = reportReducer(state, { type: 'setAttendance', childId: 'c02', value: 'absent' })
    state = reportReducer(state, { type: 'markAllPresent' })

    for (const id of ids20) {
      expect(state.entries[id].attendance).toBe('present')
    }
    expect(state.entries['c01'].meal).toBe('partial')
    expect(state.entries['c01'].behaviorNote).toBe('ملاحظة')
    // All-present also flips an absent child to present.
    expect(state.entries['c02'].attendance).toBe('present')
  })
})

describe('reportReducer — bulk actions apply to attending children only', () => {
  it('bulk meal/nap/mood touch present, late, early_leave; skip absent and null', () => {
    let state = createReport(DATE, ids(5))
    state = reportReducer(state, { type: 'setAttendance', childId: 'c01', value: 'present' })
    state = reportReducer(state, { type: 'setAttendance', childId: 'c02', value: 'late' })
    state = reportReducer(state, { type: 'setAttendance', childId: 'c03', value: 'early_leave' })
    state = reportReducer(state, { type: 'setAttendance', childId: 'c04', value: 'absent' })
    // c05 stays null

    state = reportReducer(state, { type: 'applyBulkMeal', value: 'full' })
    state = reportReducer(state, { type: 'applyBulkNap', value: 'slept' })
    state = reportReducer(state, { type: 'applyBulkMood', value: 'calm' })

    for (const id of ['c01', 'c02', 'c03']) {
      const e = state.entries[id]
      expect(e.meal).toBe('full')
      expect(e.nap).toBe('slept')
      expect(e.mood).toBe('calm')
    }
    // late/early_leave keep any previously set values, bulk overwrites them
    const absent = state.entries['c04']
    expect(absent.meal).toBe('unset')
    expect(absent.nap).toBe('unset')
    expect(absent.mood).toBe('unset')
    const unmarked = state.entries['c05']
    expect(unmarked.meal).toBe('unset')
    expect(unmarked.nap).toBe('unset')
    expect(unmarked.mood).toBe('unset')
  })

  it('bulk partial does not count as settled', () => {
    let state = partialReport()
    state = reportReducer(state, { type: 'applyBulkMeal', value: 'partial' })
    expect(state.entries['c01'].meal).toBe('partial')
  })
})

describe('reportReducer — attendance vs daily fields', () => {
  it("setAttendance('absent') clears meal/nap/mood/toilet and behaviorNote", () => {
    let state = createReport(DATE, ids(2))
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'full', nap: 'slept', mood: 'happy', toilet: { count: 2, type: 'urine' }, behaviorNote: 'اعتدى على زميل' } })
    state = reportReducer(state, { type: 'setAttendance', childId: 'c01', value: 'absent' })

    const e = state.entries['c01']
    expect(e.attendance).toBe('absent')
    expect(e.meal).toBe('unset')
    expect(e.nap).toBe('unset')
    expect(e.mood).toBe('unset')
    expect(e.toilet).toEqual({ count: 0, type: 'unset' })
    expect(e.behaviorNote).toBe('')
  })

  it("setAttendance('late'/'early_leave') keeps daily fields", () => {
    let state = createReport(DATE, ids(2))
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'full', behaviorNote: 'ملاحظة' } })
    state = reportReducer(state, { type: 'setAttendance', childId: 'c01', value: 'late' })
    expect(state.entries['c01'].meal).toBe('full')
    expect(state.entries['c01'].behaviorNote).toBe('ملاحظة')

    state = reportReducer(state, { type: 'setAttendance', childId: 'c01', value: 'early_leave' })
    expect(state.entries['c01'].meal).toBe('full')
  })
})

describe('reportReducer — updateEntry clamps absent children', () => {
  it("updateEntry with {attendance:'absent'} clears the same fields", () => {
    let state = createReport(DATE, ids(2))
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'full', nap: 'slept', mood: 'happy', toilet: { count: 1, type: 'both' }, behaviorNote: 'ملاحظة' } })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { attendance: 'absent' } })

    const e = state.entries['c01']
    expect(e.attendance).toBe('absent')
    expect(e.meal).toBe('unset')
    expect(e.nap).toBe('unset')
    expect(e.mood).toBe('unset')
    expect(e.toilet).toEqual({ count: 0, type: 'unset' })
    expect(e.behaviorNote).toBe('')
  })

  it('while absent, patches to daily fields are ignored', () => {
    let state = createReport(DATE, ids(2))
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { attendance: 'absent' } })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'full', nap: 'slept', mood: 'tired', toilet: { count: 3, type: 'urine' }, behaviorNote: 'لن تُحفظ' } })

    const e = state.entries['c01']
    expect(e.meal).toBe('unset')
    expect(e.nap).toBe('unset')
    expect(e.mood).toBe('unset')
    expect(e.toilet).toEqual({ count: 0, type: 'unset' })
    expect(e.behaviorNote).toBe('')
  })

  it('changing attendance back to present allows daily fields again', () => {
    let state = createReport(DATE, ids(2))
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { attendance: 'absent' } })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { attendance: 'present', meal: 'full' } })
    expect(state.entries['c01'].attendance).toBe('present')
    expect(state.entries['c01'].meal).toBe('full')
  })
})

describe('reportReducer — submit', () => {
  const at = '2026-11-03T10:00:00.000Z'

  it('is blocked while any roster child has no attendance', () => {
    const state = partialReport() // last 5 unmarked
    const next = reportReducer(state, { type: 'submit', at, childIds: ids20 })
    expect(next.status).toBe('draft')
    expect(next.submittedAt).toBeUndefined()
  })

  it('with childIds, blocks a report missing an entry entirely', () => {
    let state = createReport(DATE, ids(10))
    for (const id of ids(10)) state = reportReducer(state, { type: 'setAttendance', childId: id, value: 'present' })
    // Roster has an extra child that has no entry yet.
    const next = reportReducer(state, { type: 'submit', at, childIds: [...ids(10), 'c99'] })
    expect(next.status).toBe('draft')
  })

  it('succeeds and records submittedAt when all attendance is set', () => {
    const state = partialReport()
    let full = state
    for (let i = 15; i < 20; i++) full = reportReducer(full, { type: 'setAttendance', childId: ids20[i], value: 'present' })
    const next = reportReducer(full, { type: 'submit', at, childIds: ids20 })
    expect(next.status).toBe('submitted')
    expect(next.submittedAt).toBe(at)
    expect(next.updatedAt).toBe(at)
  })
})

describe('reportReducer — reset', () => {
  it('produces a fresh report for the date', () => {
    let state = partialReport()
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'refused' } })
    const fresh = reportReducer(state, { type: 'reset', date: DATE, childIds: ids20 })
    expect(fresh.status).toBe('draft')
    expect(computeSummary(fresh, ids20)).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      attending: 0,
      unmarked: 20,
      total: 20,
    })
  })
})

describe('computeSummary', () => {
  it('counts every status plus attending/unmarked/total', () => {
    let state = createReport(DATE, ids(6))
    const set = (id: string, value: AttendanceStatus) => {
      state = reportReducer(state, { type: 'setAttendance', childId: id, value })
    }
    set('c01', 'present')
    set('c02', 'present')
    set('c03', 'absent')
    set('c04', 'late')
    set('c05', 'early_leave')
    // c06 unmarked
    expect(computeSummary(state, ids(6))).toEqual({
      present: 2,
      absent: 1,
      late: 1,
      earlyLeave: 1,
      attending: 4,
      unmarked: 1,
      total: 6,
    })
  })
})

describe('computeCompleteness', () => {
  it('attendance counts all set statuses; field denominators exclude absent and unmarked', () => {
    let state = partialReport() // 10 present, 5 absent, 5 unmarked
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'full' } })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c02', patch: { nap: 'did_not_sleep' } })

    const c = computeCompleteness(state, ids20)
    expect(c.attendance).toEqual({ count: 15, total: 20 })
    // meal denominators exclude the 5 absent and 5 unmarked → total 10
    expect(c.meal).toEqual({ count: 1, total: 10 })
    expect(c.nap).toEqual({ count: 1, total: 10 })
    expect(c.mood).toEqual({ count: 0, total: 10 })
  })

  it("does not record 'unset' as completed", () => {
    const state = createReport(DATE, ids20)
    let marked = state
    for (const id of ids20) marked = reportReducer(marked, { type: 'setAttendance', childId: id, value: 'present' })
    const c = computeCompleteness(marked, ids20)
    expect(c.attendance).toEqual({ count: 20, total: 20 })
    expect(c.meal.count).toBe(0)
    expect(c.meal.total).toBe(20)
  })
})

describe('fieldPercent', () => {
  it('rounds and handles total 0 (treated as complete)', () => {
    expect(fieldPercent({ count: 1, total: 3 }).percent).toBe(33)
    expect(fieldPercent({ count: 2, total: 3 }).percent).toBe(67)
    expect(fieldPercent({ count: 10, total: 10 }).percent).toBe(100)
    expect(fieldPercent({ count: 0, total: 0 }).percent).toBe(100)
  })
})

describe('computeExceptions', () => {
  it('collects unique affected children vs individual flags', () => {
    let state = createReport(DATE, ids(5))
    // c01: absent — daily-field flags would be cleared by the reducer, so it
    // contributes exactly one exception flag (its status).
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { attendance: 'absent' } })
    // c02: one flag
    state = reportReducer(state, { type: 'updateEntry', childId: 'c02', patch: { attendance: 'late' } })
    // c03: three flags
    state = reportReducer(state, { type: 'updateEntry', childId: 'c03', patch: { attendance: 'present', meal: 'partial', mood: 'tired', nap: 'did_not_sleep' } })
    // c04: toilet count/type and behavior note only — not exceptions
    state = reportReducer(state, { type: 'updateEntry', childId: 'c04', patch: { attendance: 'present', toilet: { count: 2, type: 'urine' }, behaviorNote: 'ملاحظة سلوك' } })

    const ex = computeExceptions(state, ids(5))
    expect(ex.children).toEqual(['c01', 'c02', 'c03'])
    expect(ex.childrenCount).toBe(3)
    expect(ex.flagsCount).toBe(1 + 1 + 3)
  })

  it('early_leave is an exception', () => {
    const state = reportReducer(createReport(DATE, ids(1)), { type: 'setAttendance', childId: 'c01', value: 'early_leave' })
    expect(computeExceptions(state, ids(1)).flagsCount).toBe(1)
  })
})

describe('computeNotes — separate from exceptions, trimmed', () => {
  it('lists children whose behavior note has non-whitespace', () => {
    let state = createReport(DATE, ids(4))
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { behaviorNote: '  ملاحظة ' } })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c02', patch: { behaviorNote: '   ' } })
    // c03 empty
    expect(computeNotes(state, ids(4))).toEqual(['c01'])
    // a note is not an exception
    expect(computeExceptions(state, ids(4)).childrenCount).toBe(0)
  })
})

describe('canSubmit / missingAttendanceCount', () => {
  it('without childIds, defaults to the entry keys', () => {
    let state = createReport(DATE, ids(3))
    expect(canSubmit(state)).toBe(false)
    expect(missingAttendanceCount(state)).toBe(3)
    state = reportReducer(state, { type: 'setAttendance', childId: 'c01', value: 'present' })
    expect(missingAttendanceCount(state)).toBe(2)
    state = reportReducer(state, { type: 'setAttendance', childId: 'c02', value: 'absent' })
    state = reportReducer(state, { type: 'setAttendance', childId: 'c03', value: 'late' })
    expect(canSubmit(state)).toBe(true)
    expect(missingAttendanceCount(state)).toBe(0)
  })

  it('with childIds, a missing entry counts', () => {
    let state = createReport(DATE, ids(3))
    for (const id of ids(3)) state = reportReducer(state, { type: 'setAttendance', childId: id, value: 'present' })
    expect(canSubmit(state, [...ids(3), 'c99'])).toBe(false)
    expect(missingAttendanceCount(state, [...ids(3), 'c99'])).toBe(1)
    // absent still counts as set
    expect(canSubmit(state, ids(3))).toBe(true)
  })
})

describe('completenessWarnings', () => {
  it('lists only fields below the full-attendance denominator', () => {
    let state = partialReport()
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'full' } })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c02', patch: { nap: 'slept' } })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c03', patch: { mood: 'calm' } })

    const warnings = completenessWarnings(state, ids20)
    expect(warnings.map((w) => w.field)).toEqual(['meal', 'nap', 'mood'])
    expect(warnings[0]).toEqual({ field: 'meal', missing: 9, total: 10 })
    expect(warnings[0]?.total).toBe(10) // absent/unmarked excluded, not 20
  })

  it('is empty when everything is recorded', () => {
    let state = reportReducer(createReport(DATE, ids(1)), { type: 'setAttendance', childId: 'c01', value: 'present' })
    state = reportReducer(state, { type: 'updateEntry', childId: 'c01', patch: { meal: 'full', nap: 'slept', mood: 'happy' } })
    expect(completenessWarnings(state, ids(1))).toEqual([])
  })
})
