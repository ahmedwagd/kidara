// Pure parent-day projection for the parent day sheet prototype (plan task 2, first half).
// No Arabic here (all user-facing text lives in copy.ts), no storage access,
// no side effects — the hook reads storage and feeds it through buildParentDay.

import type {
  AttendanceStatus,
  Classroom,
  Meal,
  Mood,
  Nap,
  ReportState,
} from '../domain/types'

export type ParentDay = {
  childId: string
  fullName: string
  initials: string
  allergyLabel: string | null
  attendance: AttendanceStatus | null
  meal: Meal
  nap: Nap
  mood: Mood
  /** null unless approved for this child and the trimmed text is non-empty. */
  behaviorNote: string | null
}

export type ParentDayResult =
  | { kind: 'unknown-child' }
  | { kind: 'not-published'; hasStoredReport: boolean }
  | { kind: 'ready'; day: ParentDay }

/**
 * Today: a report is parent-visible only when it is `submitted`.
 * Later: 'amended' extends this rule once the amendment version flow exists.
 */
export function isPublished(report: ReportState | null): boolean {
  return report !== null && report.status === 'submitted'
}

/**
 * Builds one child's parent-facing day from a stored report.
 * Never returns unapproved note text: the note is returned only when
 * `approvals[childId] === true` and the trimmed note is non-empty.
 */
export function buildParentDay(input: {
  childId: string
  classroom: Classroom
  report: ReportState | null
  approvals: Readonly<Record<string, boolean>>
}): ParentDayResult {
  const { childId, classroom, report, approvals } = input
  const child = childId === '' ? null : classroom.children.find((c) => c.id === childId) ?? null
  if (child === null) return { kind: 'unknown-child' }
  if (report === null) return { kind: 'not-published', hasStoredReport: false }
  if (!isPublished(report)) return { kind: 'not-published', hasStoredReport: true }
  // Defensive: storage validation makes a missing published entry unreachable.
  const entry = report.entries[childId]
  if (!entry) return { kind: 'not-published', hasStoredReport: true }

  const trimmedNote = entry.behaviorNote.trim()
  const approvedAndNonEmpty = approvals[childId] === true && trimmedNote !== ''
  return {
    kind: 'ready',
    day: {
      childId: child.id,
      fullName: child.fullName,
      initials: child.initials,
      allergyLabel: child.allergy?.label ?? null,
      attendance: entry.attendance,
      meal: entry.meal,
      nap: entry.nap,
      mood: entry.mood,
      behaviorNote: approvedAndNonEmpty ? trimmedNote : null,
    },
  }
}

/**
 * Mock stand-in for the spec's per-sheet `behavior_status` (manager approval).
 * Simulated at seeding time only — it must never enter SheetEntry/ReportState.
 */
export const mockApprovals: Readonly<Record<string, boolean>> = {
  c18: true,
  c20: true,
}
