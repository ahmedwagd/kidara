import { useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { copy, num, formatIsoTime, formatClockAr, childrenCountPhrase, flagsCountPhrase } from '../copy'
import type { ReportState } from '../domain/types'
import { computeSummary, completenessWarnings, computeExceptions, computeNotes } from '../domain/report'
import type { Classroom } from '../domain/types'

function exceptionsText(exceptions: { childrenCount: number; flagsCount: number }): string {
  return `${childrenCountPhrase(exceptions.childrenCount)} · ${flagsCountPhrase(exceptions.flagsCount)}`
}

function exceptionNames(classroom: Classroom, ids: readonly string[]): string[] {
  return classroom.children.filter((c) => ids.includes(c.id)).map((c) => c.fullName)
}

function NamesLine({ names }: { names: readonly string[] }) {
  if (names.length === 0) return null
  return <p className="confirm-names" data-testid="exception-names">{names.join('، ')}</p>
}

export function SubmitSheet({
  state,
  classroom,
  submitting,
  onConfirm,
  onBack,
}: {
  state: ReportState
  classroom: Classroom
  submitting: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // Escape during an in-flight submit must not close the review.
  useFocusTrap({ dialogRef, initialFocus: '[data-primary]', onClose: () => { if (!submitting) onBack() } })

  const childIds = classroom.children.map((c) => c.id)
  const summary = computeSummary(state, childIds)
  const warnings = completenessWarnings(state, childIds)
  const exceptions = computeExceptions(state, childIds)
  const notes = computeNotes(state, childIds)
  const names = exceptionNames(classroom, exceptions.children)

  return (
    <div className="sheet-overlay" data-testid="confirm-sheet">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={copy.submitConfirmTitle} ref={dialogRef}>
        <header className="sheet__header">
          <h2 className="sheet__title">{copy.submitConfirmTitle}</h2>
        </header>

        <section className="sheet__section" aria-label={copy.confirmCountsTitle}>
          <h3 className="sheet__section-title">{copy.confirmCountsTitle}</h3>
          <dl className="confirm-counts">
            <div><dt>{copy.attendance.present}</dt><dd>{num(summary.present)}</dd></div>
            <div><dt>{copy.attendance.absent}</dt><dd>{num(summary.absent)}</dd></div>
            <div><dt>{copy.attendance.late}</dt><dd>{num(summary.late)}</dd></div>
            <div><dt>{copy.attendance.early_leave}</dt><dd>{num(summary.earlyLeave)}</dd></div>
          </dl>
        </section>

        <section className="sheet__section" aria-label={copy.confirmExceptionsTitle}>
          <h3 className="sheet__section-title">{copy.confirmExceptionsTitle}</h3>
          <p>{exceptions.childrenCount === 0 ? copy.confirmNone : exceptionsText(exceptions)}</p>
          <NamesLine names={names} />
        </section>

        <section className="sheet__section" aria-label={copy.confirmNotesTitle}>
          {/* Behavior notes stay separate from the exception list above. */}
          <h3 className="sheet__section-title">{copy.confirmNotesTitle}</h3>
          <p>{notes.length === 0 ? copy.confirmNone : num(notes.length)}</p>
        </section>

        {warnings.length > 0 && (
          <section className="sheet__section" aria-label={copy.confirmWarningsTitle}>
            <h3 className="sheet__section-title">{copy.confirmWarningsTitle}</h3>
            <ul className="confirm-warnings">
              {warnings.map((w) => (
                <li key={w.field}>{copy.warnText(copy.warnField[w.field], w.missing, w.total)}</li>
              ))}
            </ul>
          </section>
        )}

        <footer className="sheet__footer">
          <button type="button" data-primary className="btn btn--primary" disabled={submitting} onClick={onConfirm}>
            {submitting ? copy.submitting : copy.sendReport}
          </button>
          <button type="button" className="btn btn--ghost" disabled={submitting} onClick={onBack}>
            {copy.back}
          </button>
        </footer>
      </div>
    </div>
  )
}

export function SubmitErrorSheet({ onRetry }: { onRetry: () => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap({ dialogRef, initialFocus: '[data-primary]', onClose: onRetry })
  return (
    <div className="sheet-overlay" data-testid="submit-error">
      <div className="sheet" role="alert" aria-label={copy.submitError} ref={dialogRef}>
        <div className="sheet__section">
          <p className="submit-error__text">{copy.submitError}</p>
        </div>
        <footer className="sheet__footer">
          <button type="button" data-primary className="btn btn--primary" onClick={onRetry}>
            {copy.submitRetry}
          </button>
        </footer>
      </div>
    </div>
  )
}

export function SuccessScreen({
  classroom,
  state,
  elapsedMs,
}: {
  classroom: Classroom
  state: ReportState
  elapsedMs: number | null
}) {
  const childIds = classroom.children.map((c) => c.id)
  const summary = computeSummary(state, childIds)
  const exceptions = computeExceptions(state, childIds)
  const notes = computeNotes(state, childIds)
  const names = exceptionNames(classroom, exceptions.children)
  return (
    <main className="success-screen" data-testid="success-screen">
      <div className="success-card">
        <h1 className="success-screen__title">{copy.successTitle(classroom.name)}</h1>
        <p className="success-screen__kicker">{copy.successKicker}</p>
        <dl className="confirm-counts success-screen__facts">
          {elapsedMs !== null && (
            <div>
              <dt>{copy.elapsedLabel}</dt>
              <dd>{formatClockAr(elapsedMs)}</dd>
            </div>
          )}
          {state.submittedAt && (
            <div>
              <dt>{copy.submittedAtLabel}</dt>
              <dd>{formatIsoTime(state.submittedAt)}</dd>
            </div>
          )}
        </dl>
        <section aria-label={copy.confirmCountsTitle}>
          <h2 className="sheet__section-title">{copy.confirmCountsTitle}</h2>
          <dl className="confirm-counts">
            <div><dt>{copy.attendance.present}</dt><dd>{num(summary.present)}</dd></div>
            <div><dt>{copy.attendance.absent}</dt><dd>{num(summary.absent)}</dd></div>
            <div><dt>{copy.attendance.late}</dt><dd>{num(summary.late)}</dd></div>
            <div><dt>{copy.attendance.early_leave}</dt><dd>{num(summary.earlyLeave)}</dd></div>
          </dl>
        </section>
        <section aria-label={copy.confirmExceptionsTitle}>
          <h2 className="sheet__section-title">{copy.confirmExceptionsTitle}</h2>
          <p>{exceptions.childrenCount === 0 ? copy.confirmNone : exceptionsText(exceptions)}</p>
          <NamesLine names={names} />
        </section>
        <section aria-label={copy.confirmNotesTitle}>
          <h2 className="sheet__section-title">{copy.confirmNotesTitle}</h2>
          <p>{notes.length === 0 ? copy.confirmNone : num(notes.length)}</p>
        </section>
        <p className="success-screen__readonly">{copy.submittedReadOnly}</p>
      </div>
    </main>
  )
}
