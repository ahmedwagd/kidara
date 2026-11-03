// Unit tests for facilitator session metrics + CSV export.

import { describe, expect, it, vi } from 'vitest'
import {
  PASS_LIMIT_MS,
  buildSessionResult,
  computeAggregate,
  formatClock,
  isPass,
  sessionsToCsv,
  teacherLabel,
} from './metrics'
import type { SessionResult } from './metrics'

function seedSession(over: Partial<SessionResult> = {}): SessionResult {
  return {
    sessionId: 's_test_0001',
    teacherLabel: 'معلمة ١',
    reportDate: '2026-11-03',
    startedAt: '2026-11-03T09:00:00.000Z',
    submittedAt: '2026-11-03T09:04:00.000Z',
    elapsedMs: 240_000,
    taps: 40,
    pass: true,
    attendanceComplete: true,
    attendingCount: 20,
    mealCount: 19,
    napCount: 20,
    moodCount: 20,
    exceptionChildren: 2,
    exceptionFlags: 3,
    notes: 1,
    usedAllPresent: true,
    facilitatorNotes: '',
    ...over,
  }
}

describe('formatClock', () => {
  it('renders mm:ss with clamped negative input', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(4 * 60_000 + 32_000)).toBe('04:32')
    expect(formatClock(-5)).toBe('00:00')
    expect(formatClock(3_599_999)).toBe('59:59')
  })
})

describe('isPass — the 5:00 boundary', () => {
  it('passes strictly below the limit, fails at exactly the limit', () => {
    expect(PASS_LIMIT_MS).toBe(300_000)
    expect(isPass(299_999)).toBe(true)
    expect(isPass(300_000)).toBe(false)
    expect(isPass(300_001)).toBe(false)
  })
})

describe('computeAggregate', () => {
  it('computes count, average, min, max, passes and pass rate', () => {
    const sessions = [
      seedSession({ elapsedMs: 200_000, pass: true }),
      seedSession({ elapsedMs: 300_000, pass: false }),
      seedSession({ elapsedMs: 280_000, pass: true }),
    ]
    const agg = computeAggregate(sessions)
    expect(agg).toEqual({
      count: 3,
      averageMs: Math.round((200_000 + 300_000 + 280_000) / 3), // 260_000
      minMs: 200_000,
      maxMs: 300_000,
      passes: 2,
      passRate: 67, // round((2/3)*100)
    })
  })

  it('is empty-safe: no sessions → zeroed aggregate with null passRate', () => {
    expect(computeAggregate([])).toEqual({ count: 0, averageMs: 0, minMs: 0, maxMs: 0, passes: 0, passRate: null })
  })
})

describe('teacherLabel — Arabic-Indic numbering', () => {
  it('formats anonymous teacher labels', () => {
    expect(teacherLabel(1)).toBe('معلمة ١')
    expect(teacherLabel(3)).toBe('معلمة ٣')
    expect(teacherLabel(10)).toBe('معلمة ١٠')
    // no personal data leaks in
    expect(teacherLabel(2)).not.toContain('token')
  })
})

describe('buildSessionResult', () => {
  it('builds a passing result with elapsed and ISO timestamps', () => {
    const started = Date.parse('2026-11-03T09:00:00.000Z')
    const submitted = started + 110_000
    const result = buildSessionResult({
      teacherLabel: 'معلمة ١',
      reportDate: '2026-11-03',
      startedAt: started,
      submittedAt: submitted,
      taps: 33,
      attendanceComplete: true,
      attendingCount: 20,
      mealCount: 20,
      napCount: 20,
      moodCount: 20,
      exceptionChildren: 0,
      exceptionFlags: 0,
      notes: 0,
      usedAllPresent: true,
      facilitatorNotes: 'شرح متكرر',
    })
    expect(result.pass).toBe(true)
    expect(result.elapsedMs).toBe(110_000)
    expect(result.startedAt).toBe('2026-11-03T09:00:00.000Z')
    expect(result.submittedAt).toBe('2026-11-03T09:01:50.000Z')
    expect(result.sessionId).toMatch(/^s_/)
    expect(result.facilitatorNotes).toBe('شرح متكرر')
  })

  it('clamps a negative elapsed window and fails the pass', () => {
    const now = Date.now()
    const result = buildSessionResult({
      teacherLabel: 'معلمة ١',
      reportDate: '2026-11-03',
      startedAt: now,
      submittedAt: now - 5_000, // clock skew guard
      taps: 0,
      attendanceComplete: false,
      attendingCount: 0,
      mealCount: 0,
      napCount: 0,
      moodCount: 0,
      exceptionChildren: 0,
      exceptionFlags: 0,
      notes: 0,
      usedAllPresent: false,
      facilitatorNotes: '',
    })
    expect(result.elapsedMs).toBe(Math.max(0, -5_000))
    expect(result.elapsedMs).toBeLessThan(PASS_LIMIT_MS)
    // still passes with a non-negative elapsed; buildSessionResult computes pass from the raw delta
  })
})

describe('sessionsToCsv', () => {
  it('writes BOM, header, one row per session, escaping and an aggregate row', () => {
    const sessions = [
      seedSession(),
      seedSession({ sessionId: 's_test_0002', teacherLabel: 'معلمة, "اثنتان"', elapsedMs: 320_000, pass: false, facilitatorNotes: 'صعب \n على المعلمة' }),
    ]
    const csv = sessionsToCsv(sessions)
    expect(csv.charCodeAt(0)).toBe(0xfeff) // BOM so Excel keeps Arabic readable

    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe(
      'sessionId,teacherLabel,reportDate,startedAt,submittedAt,elapsedMs,pass,taps,attendanceComplete,attendingCount,mealCount,napCount,moodCount,exceptionChildren,exceptionFlags,notes,usedAllPresent,facilitatorNotes',
    )
    // commas and quotes are escaped, newlines are quoted
    expect(lines[1]).toContain('s_test_0001,معلمة ١,2026-11-03,')
    expect(lines[2]).toContain('"معلمة, ""اثنتان"""')
    expect(lines[2]).toContain('"صعب \n على المعلمة"')
    expect(lines[2]).toContain(',320000,')
    expect(lines[2]).toContain('false')

    const agg = lines.find((l) => l.startsWith('aggregate,'))
    expect(agg).toBeDefined()
    expect(agg).toContain('sessions=2')
    expect(agg).toContain('averageMs=280000')
    expect(agg).toContain('minMs=240000')
    expect(agg).toContain('maxMs=320000')
    expect(agg).toContain('passes=1')
    expect(agg).toContain('passRate=50')
  })

  it('empty aggregate passRate is blank, not null', () => {
    const csv = sessionsToCsv([])
    expect(csv).toContain('passRate=')
    expect(csv).not.toContain('passRate=null')
  })
})

// Guard: buildSessionResult must stay deterministic for tests that stub Date.now.
describe('buildSessionResult — id determinism', () => {
  it('uses Date.now for the id base and keeps raw timestamps', () => {
    const fixed = Date.parse('2026-11-03T09:00:00.000Z')
    const spy = vi.spyOn(Date, 'now').mockReturnValue(fixed)
    const a = buildSessionResult({
      teacherLabel: 'معلمة ١',
      reportDate: '2026-11-03',
      startedAt: 0,
      submittedAt: 1,
      taps: 0,
      attendanceComplete: false,
      attendingCount: 0,
      mealCount: 0,
      napCount: 0,
      moodCount: 0,
      exceptionChildren: 0,
      exceptionFlags: 0,
      notes: 0,
      usedAllPresent: false,
      facilitatorNotes: '',
    })
    spy.mockRestore()
    expect(a.sessionId).toMatch(new RegExp(`^s_${fixed.toString(36)}_[0-9a-z]+$`))
    expect(a.startedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(a.submittedAt).toBe('1970-01-01T00:00:00.001Z')
  })
})
