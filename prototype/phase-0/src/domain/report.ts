import type {
  AttendanceStatus,
  Meal,
  Mood,
  Nap,
  ReportAction,
  ReportState,
  SheetEntry,
  Toilet,
  ToiletType,
} from './types'

/** Attendance statuses count as "attending" (excluded: absent and null). */
export const ATTENDING_STATUSES: readonly AttendanceStatus[] = ['present', 'late', 'early_leave']

export function isAttending(attendance: AttendanceStatus | null): boolean {
  return attendance === 'present' || attendance === 'late' || attendance === 'early_leave'
}

export function createEntry(childId: string): SheetEntry {
  return {
    childId,
    attendance: null,
    meal: 'unset',
    nap: 'unset',
    mood: 'unset',
    toilet: { count: 0, type: 'unset' },
    behaviorNote: '',
  }
}

export function createReport(date: string, childIds: readonly string[]): ReportState {
  const entries: Record<string, SheetEntry> = {}
  for (const id of childIds) entries[id] = createEntry(id)
  return {
    schemaVersion: 1,
    date,
    entries,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  }
}

/** Absence clears the daily fields AND the behavior note for that child. */
function clearDailyFields(entry: SheetEntry): SheetEntry {
  return { ...entry, meal: 'unset', nap: 'unset', mood: 'unset', toilet: { count: 0, type: 'unset' }, behaviorNote: '' }
}

export function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'markAllPresent': {
      const entries: Record<string, SheetEntry> = {}
      for (const [id, entry] of Object.entries(state.entries)) {
        entries[id] = { ...entry, attendance: 'present' }
      }
      return { ...state, entries, updatedAt: new Date().toISOString() }
    }
    case 'setAttendance': {
      const current = state.entries[action.childId] ?? createEntry(action.childId)
      const next: SheetEntry =
        action.value === 'absent' ? { ...clearDailyFields(current), attendance: 'absent' } : { ...current, attendance: action.value }
      return { ...state, entries: { ...state.entries, [action.childId]: next }, updatedAt: new Date().toISOString() }
    }
    case 'applyBulkMeal':
    case 'applyBulkNap':
    case 'applyBulkMood': {
      const entries: Record<string, SheetEntry> = {}
      for (const [id, entry] of Object.entries(state.entries)) {
        if (!isAttending(entry.attendance)) {
          entries[id] = entry
          continue
        }
        entries[id] =
          action.type === 'applyBulkMeal'
            ? { ...entry, meal: action.value as Meal }
            : action.type === 'applyBulkNap'
              ? { ...entry, nap: action.value as Nap }
              : { ...entry, mood: action.value as Mood }
      }
      return { ...state, entries, updatedAt: new Date().toISOString() }
    }
    case 'updateEntry': {
      const current = state.entries[action.childId] ?? createEntry(action.childId)
      let next: SheetEntry = { ...current, ...action.patch, childId: action.childId }
      // While the (merged) entry is absent, daily fields and the note are not editable:
      // ignore any patch that would set them, and re-clear whatever survives the merge.
      if (next.attendance === 'absent') next = clearDailyFields(next)
      return {
        ...state,
        entries: { ...state.entries, [action.childId]: next },
        updatedAt: new Date().toISOString(),
      }
    }
    case 'submit': {
      // childIds comes from the classroom so a report missing entries cannot be submitted.
      if (!canSubmit(state, action.childIds)) return state
      return { ...state, status: 'submitted', submittedAt: action.at, updatedAt: action.at }
    }
    case 'reset':
      return createReport(action.date, action.childIds)
    default: {
      // Exhaustiveness guard: never silently drops an unhandled action.
      const unreachable: never = action
      return unreachable
    }
  }
}

// ---------------------------------------------------------------------------
// Completeness, summary, exceptions — pure rules (see plan: Completeness rules)
// ---------------------------------------------------------------------------

export type FieldType = 'attendance' | 'meal' | 'nap' | 'mood'
export type FieldCount = { count: number; total: number }
export type CompletenessMap = Record<FieldType, FieldCount>
export type RecordedCompleteness = FieldCount & { percent: number }

export type SummaryCounts = {
  present: number
  absent: number
  late: number
  earlyLeave: number
  attending: number
  unmarked: number
  total: number
}

export function computeSummary(state: ReportState, childIds: readonly string[]): SummaryCounts {
  const counts: SummaryCounts = { present: 0, absent: 0, late: 0, earlyLeave: 0, attending: 0, unmarked: 0, total: 0 }
  for (const id of childIds) {
    const entry = state.entries[id] ?? createEntry(id)
    counts.total += 1
    switch (entry.attendance) {
      case 'present':
        counts.present += 1
        counts.attending += 1
        break
      case 'absent':
        counts.absent += 1
        break
      case 'late':
        counts.late += 1
        counts.attending += 1
        break
      case 'early_leave':
        counts.earlyLeave += 1
        counts.attending += 1
        break
      default:
        counts.unmarked += 1
    }
  }
  return counts
}

function countField(state: ReportState, childIds: readonly string[], field: 'meal' | 'nap' | 'mood'): FieldCount {
  let count = 0
  let total = 0
  for (const id of childIds) {
    const entry = state.entries[id] ?? createEntry(id)
    if (!isAttending(entry.attendance)) continue // absent and unmarked are excluded
    total += 1
    if (entry[field] !== 'unset') count += 1
  }
  return { count, total }
}

export function computeCompleteness(state: ReportState, childIds: readonly string[]): CompletenessMap {
  let marked = 0
  for (const id of childIds) {
    const entry = state.entries[id] ?? createEntry(id)
    if (entry.attendance !== null) marked += 1
  }
  return {
    attendance: { count: marked, total: childIds.length },
    meal: countField(state, childIds, 'meal'),
    nap: countField(state, childIds, 'nap'),
    mood: countField(state, childIds, 'mood'),
  }
}

export function fieldPercent(c: FieldCount): RecordedCompleteness {
  return { ...c, percent: c.total === 0 ? 100 : Math.round((c.count / c.total) * 100) }
}

export type ExceptionCounts = {
  children: string[]
  childrenCount: number
  flagsCount: number
}

const EXCEPTION_STATUS: ReadonlySet<AttendanceStatus> = new Set<AttendanceStatus>(['absent', 'late', 'early_leave'])
const EXCEPTION_FIELDS = ['meal', 'nap', 'mood'] as const

export function computeExceptions(state: ReportState, childIds: readonly string[]): ExceptionCounts {
  const children: string[] = []
  let flagsCount = 0
  for (const id of childIds) {
    const entry = state.entries[id] ?? createEntry(id)
    let childFlags = 0
    if (entry.attendance !== null && EXCEPTION_STATUS.has(entry.attendance)) childFlags += 1
    for (const field of EXCEPTION_FIELDS) {
      const value = entry[field]
      if (field === 'meal') {
        if (value === 'partial' || value === 'refused') childFlags += 1
      } else if (field === 'nap') {
        if (value === 'did_not_sleep') childFlags += 1
      } else if (value === 'tired' || value === 'upset') childFlags += 1
    }
    if (childFlags > 0) {
      children.push(id)
      flagsCount += childFlags
    }
  }
  return { children, childrenCount: children.length, flagsCount }
}

/** Behavior notes pending manager approval — not exceptions. */
export function computeNotes(state: ReportState, childIds: readonly string[]): string[] {
  return childIds.filter((id) => {
    const entry = state.entries[id] ?? createEntry(id)
    return entry.behaviorNote.trim().length > 0
  })
}

/**
 * Submit requires exactly one attendance status per classroom child; other fields stay optional.
 * childIds (the classroom roster, including children without an entry yet) defaults to the
 * entry keys for compatibility.
 */
export function canSubmit(state: ReportState, childIds?: readonly string[]): boolean {
  const ids = childIds ?? Object.keys(state.entries)
  for (const id of ids) {
    const entry = state.entries[id]
    if (!entry || entry.attendance === null) return false
  }
  return true
}

export function missingAttendanceCount(state: ReportState, childIds?: readonly string[]): number {
  const ids = childIds ?? Object.keys(state.entries)
  let n = 0
  for (const id of ids) {
    const entry = state.entries[id]
    if (!entry || entry.attendance === null) n += 1
  }
  return n
}

/** Completeness warnings for the confirmation sheet — informational only. */
export type CompletenessWarning = { field: 'meal' | 'nap' | 'mood'; missing: number; total: number }

export function completenessWarnings(state: ReportState, childIds: readonly string[]): CompletenessWarning[] {
  const out: CompletenessWarning[] = []
  for (const field of ['meal', 'nap', 'mood'] as const) {
    const { count, total } = countField(state, childIds, field)
    if (count < total) out.push({ field, missing: total - count, total })
  }
  return out
}

export type ToiletPatch = Toilet
export type { ToiletType, Meal, Mood, Nap, AttendanceStatus }
