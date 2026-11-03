// Unit tests for the draft/session persistence layer (validation, key scoping,
// corrupt-payload handling, storage failures). No real storage: in-memory shims.

import { describe, expect, it } from 'vitest'
import { createBrokenStorage, createMemoryStorage } from './browserStorage'
import { DRAFT_PREFIX, DRAFT_SUFFIX, SESSIONS_KEY, appendSessions, draftKey, loadDraft, loadSessions, normalizeDate, removeDraft, saveDraft, validateReport } from './draftStore'
import { createReport, reportReducer } from '../domain/report'
import type { ReportState } from '../domain/types'
import type { SessionResult } from '../domain/metrics'

const DATE = '2026-11-03'
const YESTERDAY = '2026-11-02'
const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${String(i + 1).padStart(2, '0')}`)

function fullDraft(date = DATE, n = 3): ReportState {
  let state = createReport(date, ids(n))
  for (const id of ids(n)) state = reportReducer(state, { type: 'setAttendance', childId: id, value: 'present' })
  return state
}

function kinds(result: { kind: string }): string {
  return result.kind
}

describe('draftKey / normalizeDate', () => {
  it('builds the date-scoped key', () => {
    expect(draftKey(DATE)).toBe(`${DRAFT_PREFIX}${DATE}${DRAFT_SUFFIX}`) // kidara.prototype.phase0.report.2026-11-03.v1
    expect(draftKey(DATE)).toBe('kidara.prototype.phase0.report.2026-11-03.v1')
  })

  it('normalizeDate uses the LOCAL calendar (no UTC shift)', () => {
    // 2026-01-01 00:30 local: UTC would roll back a day when it is negative offset.
    const d = new Date(2026, 0, 1, 0, 30, 0)
    expect(normalizeDate(d)).toBe('2026-01-01')
    const lastDay = new Date(2026, 10, 30, 23, 59)
    expect(normalizeDate(lastDay)).toBe('2026-11-30')
  })
})

describe('saveDraft / loadDraft round-trip', () => {
  it('restores a saved draft', () => {
    const storage = createMemoryStorage()
    const state = fullDraft()
    expect(saveDraft(storage, state)).toBe('saved')
    const result = loadDraft(storage, DATE, ids(3))
    expect(kinds(result)).toBe('restored')
    if (result.kind === 'restored') expect(result.state.status).toBe('draft')
  })

  it('submitting a saved report reloads as submitted', () => {
    const storage = createMemoryStorage()
    const state = reportReducer(fullDraft(), { type: 'submit', at: '2026-11-03T09:00:00.000Z', childIds: ids(3) })
    saveDraft(storage, state)
    const result = loadDraft(storage, DATE, ids(3))
    expect(kinds(result)).toBe('submitted')
  })

  it('missing draft → empty', () => {
    expect(loadDraft(createMemoryStorage(), DATE, ids(3)).kind).toBe('empty')
  })
})

describe('loadDraft rejects invalid payloads', () => {
  it('corrupt JSON → invalid and the key is removed', () => {
    const storage = createMemoryStorage({ [draftKey(DATE)]: '{not json' })
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('invalid')
    expect(storage.getItem(draftKey(DATE))).toBeNull()
  })

  it('unsupported schemaVersion → invalid and removed', () => {
    const storage = createMemoryStorage()
    saveDraft(storage, fullDraft())
    const raw = JSON.parse(storage.getItem(draftKey(DATE)) as string)
    raw.schemaVersion = 999
    storage.setItem(draftKey(DATE), JSON.stringify(raw))
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('invalid')
    expect(storage.getItem(draftKey(DATE))).toBeNull()
  })

  it('wrong date payload → invalid and removed (no cross-day leak)', () => {
    const storage = createMemoryStorage({ [draftKey(DATE)]: JSON.stringify(fullDraft(YESTERDAY)) })
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('invalid')
    expect(storage.getItem(draftKey(DATE))).toBeNull()
  })

  it('invalid entry shape → invalid and removed', () => {
    const storage = createMemoryStorage()
    saveDraft(storage, fullDraft())
    const raw = JSON.parse(storage.getItem(draftKey(DATE)) as string)
    raw.entries['c01'].attendance = 'at_home' // not an allowed status
    storage.setItem(draftKey(DATE), JSON.stringify(raw))
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('invalid')
    expect(storage.getItem(draftKey(DATE))).toBeNull()
  })
})

describe('loadDraft with expectedChildIds (whole-classroom validation)', () => {
  it('missing expected child → invalid and removed', () => {
    const storage = createMemoryStorage()
    saveDraft(storage, fullDraft(DATE, 3))
    const raw = JSON.parse(storage.getItem(draftKey(DATE)) as string)
    delete raw.entries['c02']
    storage.setItem(draftKey(DATE), JSON.stringify(raw))
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('invalid')
    expect(storage.getItem(draftKey(DATE))).toBeNull()
  })

  it('extra unknown child → invalid and removed', () => {
    const storage = createMemoryStorage()
    saveDraft(storage, fullDraft(DATE, 3))
    const raw = JSON.parse(storage.getItem(draftKey(DATE)) as string)
    raw.entries['cX9'] = { ...raw.entries['c01'], childId: 'cX9' }
    storage.setItem(draftKey(DATE), JSON.stringify(raw))
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('invalid')
    expect(storage.getItem(draftKey(DATE))).toBeNull()
  })

  it('entry.childId not matching its key → invalid and removed', () => {
    const storage = createMemoryStorage()
    saveDraft(storage, fullDraft(DATE, 3))
    const raw = JSON.parse(storage.getItem(draftKey(DATE)) as string)
    raw.entries['c01'].childId = 'c03'
    storage.setItem(draftKey(DATE), JSON.stringify(raw))
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('invalid')
    expect(storage.getItem(draftKey(DATE))).toBeNull()
  })

  it('a report missing entries passes without expectedChildIds (compat) but these tests always pass the roster', () => {
    // compat contract check on the pure validator
    const state = createReport(DATE, ids(1))
    expect(validateReport(state, DATE)).not.toBeNull()
    expect(validateReport(state, DATE, ids(2))).toBeNull()
  })
})

describe('loadDraft — key scoping', () => {
  it('previous-day key is never read when loading today', () => {
    const storage = createMemoryStorage({ [draftKey(YESTERDAY)]: JSON.stringify(fullDraft(YESTERDAY)) })
    expect(loadDraft(storage, DATE, ids(3)).kind).toBe('empty')
    // and yesterday's payload stays untouched
    expect(storage.getItem(draftKey(YESTERDAY))).not.toBeNull()
  })
})

describe('loadDraft — storage failures', () => {
  it('getItem throwing → unavailable, never "empty"', () => {
    expect(loadDraft(createBrokenStorage(), DATE, ids(3)).kind).toBe('unavailable')
  })

  it('setItem throwing (quota/off) → error from saveDraft', () => {
    expect(saveDraft(createBrokenStorage(), fullDraft())).toBe('error')
  })

  it('removeItem throwing does not crash', () => {
    expect(() => removeDraft(createBrokenStorage(), DATE)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Facilitator sessions — append-only, order preserved, corrupt → []
// ---------------------------------------------------------------------------

function seedSession(id: string): SessionResult {
  return {
    sessionId: id,
    teacherLabel: 'معلمة ١',
    reportDate: DATE,
    startedAt: '2026-11-03T09:00:00.000Z',
    submittedAt: '2026-11-03T09:04:00.000Z',
    elapsedMs: 240_000,
    taps: 41,
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

describe('sessions', () => {
  it('append/load preserves order', () => {
    const storage = createMemoryStorage()
    expect(appendSessions(storage, [seedSession('s1')])).toBe('saved')
    expect(appendSessions(storage, [seedSession('s1'), seedSession('s2')])).toBe('saved')
    const loaded = loadSessions(storage)
    expect(loaded.map((s) => s.sessionId)).toEqual(['s1', 's2'])
  })

  it('corrupt sessions JSON → empty list', () => {
    const storage = createMemoryStorage({ [SESSIONS_KEY]: 'not an array' })
    expect(loadSessions(storage)).toEqual([])
  })

  it('non-array sessions JSON → empty list', () => {
    const storage = createMemoryStorage({ [SESSIONS_KEY]: JSON.stringify({ a: 1 }) })
    expect(loadSessions(storage)).toEqual([])
  })

  it('invalid session objects are filtered, valid ones stay', () => {
    const storage = createMemoryStorage()
    const good = seedSession('s1')
    const bad = { ...good, elapsedMs: 'forty' } as unknown as Record<string, unknown>
    storage.setItem(SESSIONS_KEY, JSON.stringify([good, bad, null]))
    expect(loadSessions(storage).map((s) => s.sessionId)).toEqual(['s1'])
  })

  it('append-only semantics: existing sessions remain after a re-append', () => {
    const storage = createMemoryStorage({ [SESSIONS_KEY]: JSON.stringify([seedSession('s1')]) })
    loadSessions(storage) // prime
    const existing = loadSessions(storage)
    expect(appendSessions(storage, [...existing, seedSession('s2')])).toBe('saved')
    expect(loadSessions(storage).map((s) => s.sessionId)).toEqual(['s1', 's2'])
  })
})
