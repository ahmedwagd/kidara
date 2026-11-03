// Read-only parent day sheet — plan task 2, first half (parent day sheet).
// No submit bar, no editing, no teacher affordances: everything here is a view
// over one child's published daily report. Approvals are the seeded fixture.
// The teacher's submission time stays on the teacher screen: parents get the
// day, not the logistics.

import { useState } from 'react'
import { copy, formatDateLong, parentCopy } from '../../copy'
import { createBrowserStorage } from '../../persistence/browserStorage'
import type { SimpleStorage } from '../../persistence/browserStorage'
import type { Child, Classroom } from '../../domain/types'
import { normalizeDate } from '../../persistence/draftStore'
import { mockApprovals } from '../../data/parentDay'
import { useParentDay } from '../../hooks/useParentDay'

type Props = {
  childId: string
  reportDate?: string
  classroom: Classroom
  storage?: SimpleStorage
}

export function ParentDayScreen(props: Props) {
  // Retry remounts the reader so the whole read path re-runs from scratch.
  const [attempt, setAttempt] = useState(0)
  return <ParentDayReader key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />
}

function ParentDayReader(props: Props & { onRetry: () => void }) {
  const { childId, reportDate, classroom, onRetry } = props
  // Same precedence as the teacher screen / hook.
  const today = reportDate ?? import.meta.env.VITE_REPORT_DATE ?? normalizeDate(new Date())
  const day = reportDayToDate(today)
  const [storage] = useState<SimpleStorage>(() => props.storage ?? createBrowserStorage())
  const state = useParentDay({ reportDate, classroom, storage, childId, approvals: mockApprovals })

  // Context header for the non-ready states (same as the ready header), plus a
  // single h1 per card: the child name when ready, the state meaning otherwise.
  // The invalid state shows no child data at all (unknown link).
  const knownChild = childId === '' ? null : classroom.children.find((c) => c.id === childId) ?? null

  if (state.status === 'loading') {
    return (
      <main className="parent-day parent-day--short" data-testid="parent-day" data-state="loading">
        <div className="parent-day__card parent-day__status" role="status">
          {knownChild && <StateHeader child={knownChild} classroom={classroom} date={day} />}
          <h1 className="parent-day__status-text">{parentCopy.loading}</h1>
        </div>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="parent-day parent-day--short" data-testid="parent-day" data-state="error">
        <div className="parent-day__card parent-day__status" data-testid="parent-day-error">
          {knownChild && <StateHeader child={knownChild} classroom={classroom} date={day} />}
          {/* The live region announces only the state message and the fallback;
              the header above and the retry button below stay outside it. */}
          <div role="alert">
            <h1 className="parent-day__status-text">{parentCopy.error}</h1>
            <p className="parent-day__status-fallback">{parentCopy.errorFallback}</p>
          </div>
          <button type="button" className="btn btn--primary" data-testid="parent-day-retry" onClick={onRetry}>
            {parentCopy.retry}
          </button>
        </div>
      </main>
    )
  }

  if (state.status === 'invalid') {
    return (
      <main className="parent-day parent-day--short" data-testid="parent-day" data-state="invalid">
        <div className="parent-day__card parent-day__status" role="status" data-testid="parent-day-invalid">
          <h1 className="parent-day__status-text">{parentCopy.invalidLink}</h1>
        </div>
      </main>
    )
  }

  if (state.status === 'empty') {
    return (
      <main className="parent-day parent-day--short" data-testid="parent-day" data-state="empty">
        <div className="parent-day__card parent-day__status" role="status">
          {knownChild && <StateHeader child={knownChild} classroom={classroom} date={day} />}
          {/* One short message per cause; no facts, no note, no child of the day leaks. */}
          <h1 className="parent-day__status-text" data-testid="parent-day-empty">
            {state.hasStoredReport ? parentCopy.emptyUnpublished : parentCopy.emptyNone}
          </h1>
          <p className="parent-day__status-fallback">{parentCopy.emptyFallback}</p>
        </div>
      </main>
    )
  }

  const facts = state.day
  const absent = facts.attendance === 'absent'
  const attendanceLabel = facts.attendance === null ? parentCopy.unset : copy.attendance[facts.attendance]
  const mealLabel = facts.meal === 'unset' ? parentCopy.unset : copy.meal[facts.meal]
  const napLabel = facts.nap === 'unset' ? parentCopy.unset : copy.nap[facts.nap]
  const moodLabel = facts.mood === 'unset' ? parentCopy.unset : copy.mood[facts.mood]

  return (
    <main className="parent-day" data-testid="parent-day" data-state="ready">
      <div className="parent-day__card">
        <header className="parent-day__header">
          <div className="child-avatar child-avatar--sheet" aria-hidden="true">
            {facts.initials}
          </div>
          <div>
            <p className="parent-day__kicker">{parentCopy.kicker}</p>
            <h1 className="parent-day__name" data-testid="parent-day-name">
              {facts.fullName}
            </h1>
            <p className="parent-day__meta">{classroom.name}</p>
            <p className="parent-day__meta" data-testid="parent-day-date">
              {formatDateLong(day)}
            </p>
          </div>
        </header>

        {facts.allergyLabel !== null && (
          <aside className="parent-day__allergy" role="note" data-testid="parent-day-allergy">
            <span className="parent-day__allergy-caption">{copy.allergyTitle}</span>
            <strong className="allergy-banner__title">{facts.allergyLabel}</strong>
            <p className="parent-day__allergy-note">{parentCopy.allergyNote}</p>
          </aside>
        )}

        {/* Absent children keep only the attendance fact; the rest is hidden. */}
        <dl className="parent-day__facts" data-testid="parent-day-facts">
          <div>
            <dt>{copy.attendanceTitle}</dt>
            <dd data-testid="parent-day-attendance">{attendanceLabel}</dd>
          </div>
          {!absent && (
            <>
              <div>
                <dt>{copy.mealSectionTitle}</dt>
                <dd data-testid="parent-day-meal">{mealLabel}</dd>
              </div>
              <div>
                <dt>{copy.napSectionTitle}</dt>
                <dd data-testid="parent-day-nap">{napLabel}</dd>
              </div>
              <div>
                <dt>{copy.moodSectionTitle}</dt>
                <dd data-testid="parent-day-mood">{moodLabel}</dd>
              </div>
            </>
          )}
        </dl>
        {absent && (
          <p className="parent-day__absent-hint" data-testid="parent-day-absent-hint">
            {parentCopy.absentLine}
          </p>
        )}

        <section className="parent-day__section" data-testid="parent-day-note">
          <h2 className="sheet__section-title">{copy.behaviorNoteTitle}</h2>
          <p className="parent-day__note-text">{facts.behaviorNote ?? parentCopy.noBehaviorNote}</p>
        </section>
      </div>
    </main>
  )
}

/** Context header for the non-ready states: who and which day, then the state. */
function StateHeader({ child, classroom, date }: { child: Child; classroom: Classroom; date: Date }) {
  return (
    <header className="parent-day__header">
      <div className="child-avatar child-avatar--sheet" aria-hidden="true">
        {child.initials}
      </div>
      <div>
        <p className="parent-day__kicker">{parentCopy.kicker}</p>
        <p className="parent-day__name" data-testid="parent-day-state-name">
          {child.fullName}
        </p>
        <p className="parent-day__meta">{classroom.name}</p>
        <p className="parent-day__meta" data-testid="parent-day-state-date">
          {formatDateLong(date)}
        </p>
      </div>
    </header>
  )
}

/** Local-midnight Date for a YYYY-MM-DD report day. */
function reportDayToDate(date: string): Date {
  const [y, m, d] = date.split('-').map((part) => Number(part))
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}
