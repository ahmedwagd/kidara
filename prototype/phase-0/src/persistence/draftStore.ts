// Date-scoped draft persistence + append-only facilitator sessions, both in localStorage.
// Every load validates shape/version/date; invalid data is removed, never rendered.

import type { ReportState, SheetEntry } from '../domain/types'
import type { SessionResult } from '../domain/metrics'
import { sessionsToCsv } from '../domain/metrics'

export const SCHEMA_VERSION = 1
export const SESSIONS_KEY = 'kidara.prototype.phase0.sessions.v1'
export const DRAFT_PREFIX = 'kidara.prototype.phase0.report.'
export const DRAFT_SUFFIX = '.v1'

export function draftKey(date: string): string {
  return `${DRAFT_PREFIX}${date}${DRAFT_SUFFIX}`
}

/** Local YYYY-MM-DD for a Date object. */
export function normalizeDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type Storage = Pick<StorageLike, 'getItem' | 'setItem' | 'removeItem'>
interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const ATTENDANCE_VALUES = ['present', 'absent', 'late', 'early_leave']
const MEAL_VALUES = ['full', 'partial', 'refused', 'unset']
const NAP_VALUES = ['slept', 'did_not_sleep', 'unset']
const MOOD_VALUES = ['happy', 'calm', 'tired', 'upset', 'unset']
const TOILET_TYPES = ['urine', 'stool', 'both', 'unset']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isSheetEntryShape(v: unknown): v is SheetEntry {
  if (!isRecord(v)) return false
  const e = v as Record<string, unknown>
  if (typeof e.childId !== 'string') return false
  if (typeof e.behaviorNote !== 'string') return false
  if (!(e.attendance === null || (typeof e.attendance === 'string' && ATTENDANCE_VALUES.includes(e.attendance)))) return false
  if (!(typeof e.meal === 'string' && MEAL_VALUES.includes(e.meal))) return false
  if (!(typeof e.nap === 'string' && NAP_VALUES.includes(e.nap))) return false
  if (!(typeof e.mood === 'string' && MOOD_VALUES.includes(e.mood))) return false
  if (!isRecord(e.toilet)) return false
  const t = e.toilet as Record<string, unknown>
  if (!(typeof t.count === 'number' && Number.isInteger(t.count) && t.count >= 0)) return false
  return typeof t.type === 'string' && TOILET_TYPES.includes(t.type)
}

const STATUS_VALUES = ['draft', 'submitted']

/**
 * Validates schemaVersion, report date, status, every entry, and — when
 * `expectedChildIds` is given — that the classroom is complete and exact.
 * Returns null on any mismatch.
 */
export function validateReport(raw: unknown, today: string, expectedChildIds?: readonly string[]): ReportState | null {
  if (!isRecord(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.schemaVersion !== SCHEMA_VERSION) return null
  if (r.date !== today) return null
  if (typeof r.updatedAt !== 'string') return null
  if (!(typeof r.status === 'string' && STATUS_VALUES.includes(r.status))) return null
  if (r.status === 'submitted' && typeof r.submittedAt !== 'string') return null
  if (!isRecord(r.entries)) return null
  const entries = r.entries as Record<string, unknown>
  for (const [key, value] of Object.entries(entries)) {
    if (!isSheetEntryShape(value)) return null
    if (typeof expectedChildIds !== 'undefined' && value.childId !== key) return null
  }
  if (typeof expectedChildIds !== 'undefined') {
    const keys = Object.keys(entries)
    if (keys.length !== expectedChildIds.length) return null
    for (const id of expectedChildIds) {
      if (!(id in entries)) return null
    }
  }
  return raw as ReportState
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'unavailable' }
  | { kind: 'restored'; state: ReportState }
  | { kind: 'submitted'; state: ReportState }
  | { kind: 'invalid' }

/**
 * Reads today's draft key only.
 * - `getItem` failure → `unavailable` (never mistaken for "no draft").
 * - Invalid/corrupt/outdated payloads are removed from storage here, so a later
 *   load of the same key never sees them again.
 * - `expectedChildIds` (the classroom roster) makes validation whole-classroom:
 *   every expected id exactly once, no unknown ids, and `entry.childId === key`.
 */
export function loadDraft(storage: Storage, today: string, expectedChildIds?: readonly string[]): LoadResult {
  let raw: string | null
  try {
    raw = storage.getItem(draftKey(today))
  } catch {
    return { kind: 'unavailable' }
  }
  if (raw === null) return { kind: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    removeDraft(storage, today)
    return { kind: 'invalid' }
  }
  const state = validateReport(parsed, today, expectedChildIds)
  if (state === null) {
    removeDraft(storage, today)
    return { kind: 'invalid' }
  }
  return state.status === 'submitted' ? { kind: 'submitted', state } : { kind: 'restored', state }
}

export function removeDraft(storage: Storage, today: string): void {
  try {
    storage.removeItem(draftKey(today))
  } catch {
    // ignore — removal failure is harmless
  }
}

export function saveDraft(storage: Storage, state: ReportState): 'saved' | 'error' {
  try {
    storage.setItem(draftKey(state.date), JSON.stringify(state))
    return 'saved'
  } catch {
    return 'error'
  }
}

// ---------------------------------------------------------------------------
// Facilitator sessions — append-only, separate key, survive refresh
// ---------------------------------------------------------------------------

function isSessionShape(v: unknown): v is SessionResult {
  if (!isRecord(v)) return false
  const s = v as Record<string, unknown>
  return typeof s.sessionId === 'string' && typeof s.teacherLabel === 'string' && typeof s.reportDate === 'string' && typeof s.startedAt === 'string' && typeof s.submittedAt === 'string' && typeof s.elapsedMs === 'number' && typeof s.taps === 'number' && typeof s.pass === 'boolean' && typeof s.attendanceComplete === 'boolean' && typeof s.attendingCount === 'number' && typeof s.mealCount === 'number' && typeof s.napCount === 'number' && typeof s.moodCount === 'number' && typeof s.exceptionChildren === 'number' && typeof s.exceptionFlags === 'number' && typeof s.notes === 'number' && typeof s.usedAllPresent === 'boolean' && typeof s.facilitatorNotes === 'string'
}

export function loadSessions(storage: Storage): SessionResult[] {
  let raw: string | null
  try {
    raw = storage.getItem(SESSIONS_KEY)
  } catch {
    return []
  }
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isSessionShape)
}

export function appendSessions(storage: Storage, sessions: readonly SessionResult[]): 'saved' | 'error' {
  try {
    storage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
    return 'saved'
  } catch {
    return 'error'
  }
}

export { sessionsToCsv }
