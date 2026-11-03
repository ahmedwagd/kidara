// Read-only parent-day reader for the parent day sheet prototype (plan task 2, first half).
// Never writes storage: no loadDraft/setItem/removeItem — the parent view must
// not be able to mutate or delete the teacher's stored report.

import { useEffect, useState } from 'react'
import type { Classroom } from '../domain/types'
import type { SimpleStorage } from '../persistence/browserStorage'
import { draftKey, normalizeDate, validateReport } from '../persistence/draftStore'
import { buildParentDay, isPublished, mockApprovals } from '../data/parentDay'
import type { ParentDay, ParentDayResult } from '../data/parentDay'

export type ParentDayState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'error' }
  | { status: 'empty'; hasStoredReport: boolean }
  | { status: 'ready'; day: ParentDay }

export function useParentDay(opts: {
  reportDate?: string
  classroom: Classroom
  storage: SimpleStorage
  childId: string
  approvals?: Readonly<Record<string, boolean>>
}): ParentDayState {
  const { reportDate, classroom, storage, childId } = opts
  // Per-sheet manager approval is simulated by the seeded fixture for now.
  const approvals = opts.approvals ?? mockApprovals

  // Resolves exactly like the teacher screen.
  const today = reportDate ?? import.meta.env.VITE_REPORT_DATE ?? normalizeDate(new Date())

  // Decided before any storage read: empty or unknown child never touches storage.
  const invalid = childId === '' || !classroom.children.some((c) => c.id === childId)

  const [state, setState] = useState<ParentDayState>(() => (invalid ? { status: 'invalid' } : { status: 'loading' }))

  useEffect(() => {
    if (invalid) return
    const childIds = classroom.children.map((c) => c.id)
    const timer = window.setTimeout(() => {
      let raw: string | null
      try {
        raw = storage.getItem(draftKey(today))
      } catch {
        setState({ status: 'error' })
        return
      }
      if (raw === null) {
        setState({ status: 'empty', hasStoredReport: false })
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        setState({ status: 'error' })
        return
      }
      const report = validateReport(parsed, today, childIds)
      if (report === null) {
        setState({ status: 'error' })
        return
      }
      if (!isPublished(report)) {
        // A draft must never render facts.
        setState({ status: 'empty', hasStoredReport: true })
        return
      }
      const result: ParentDayResult = buildParentDay({ childId, classroom, report, approvals })
      setState(
        result.kind === 'unknown-child'
          ? { status: 'invalid' }
          : result.kind === 'not-published'
            ? { status: 'empty', hasStoredReport: result.hasStoredReport }
            : { status: 'ready', day: result.day },
      )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [invalid, childId, today, classroom, storage, approvals])

  return invalid ? { status: 'invalid' } : state
}
