import { useState } from 'react'
import { facilitatorCopy, formatClockAr, num } from '../copy'
import type { SessionResult } from '../domain/metrics'
import { computeAggregate, PASS_LIMIT_MS } from '../domain/metrics'
import { sessionsToCsv } from '../persistence/draftStore'

export function FacilitatorPanel({
  open,
  onToggle,
  currentLabel,
  taps,
  startedAt,
  elapsedMs,
  liveCompleteness,
  liveExceptions,
  facilitatorNotes,
  onNotesChange,
  sessions,
  unsavedCount,
  lastResultUnsaved,
  lastResult,
  onReset,
  onCopyJson,
  errorSimOn,
  onToggleErrorSim,
}: {
  open: boolean
  onToggle: () => void
  currentLabel: string
  taps: number
  startedAt: number | null
  elapsedMs: number
  liveCompleteness: string
  liveExceptions: string
  facilitatorNotes: string
  onNotesChange: (v: string) => void
  sessions: SessionResult[]
  /** Sessions kept in memory only because the session-log write failed. */
  unsavedCount: number
  /** Whether the last finalized session failed to reach the session log. */
  lastResultUnsaved: boolean
  lastResult: SessionResult | null
  onReset: () => void
  onCopyJson: () => void
  errorSimOn: boolean
  onToggleErrorSim: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  const resetConfirmed = () => {
    setConfirming(false)
    onReset()
  }

  const exportCsv = () => {
    if (sessions.length === 0) return
    const csv = sessionsToCsv(sessions)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kidara-phase0-sessions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-facilitator>
      <button type="button" className="facilitator-toggle" aria-expanded={open} onClick={onToggle}>
        {facilitatorCopy.toggle}
      </button>
      {open && (
        <aside className="facilitator-panel" aria-label={facilitatorCopy.title}>
          <h2 className="facilitator-panel__title">{facilitatorCopy.title}</h2>
          <p className="facilitator-panel__hint">{facilitatorCopy.hint}</p>

          <section className="facilitator-panel__section">
            <h3>{facilitatorCopy.sessionTitle}</h3>
            <p className="facilitator-panel__row">
              <span>{facilitatorCopy.teacherLabelTitle}:</span> <strong>{currentLabel}</strong>
            </p>
            <p className="facilitator-panel__row">
              <span>{facilitatorCopy.timerLabel}:</span>{' '}
              <strong data-testid="facilitator-timer">{startedAt === null ? facilitatorCopy.waitingTimer : formatClockAr(elapsedMs)}</strong>
            </p>
            <p className="facilitator-panel__row">
              <span>{facilitatorCopy.tapsLabel}:</span> <strong>{num(taps)}</strong>
            </p>
            {startedAt !== null && (
              <p className="facilitator-panel__row">
                <span>{facilitatorCopy.passLabel}:</span>{' '}
                <strong>{elapsedMs < PASS_LIMIT_MS ? facilitatorCopy.passOk : facilitatorCopy.passLate}</strong>
                <span className="facilitator-panel__hint"> ({facilitatorCopy.passCriteria})</span>
              </p>
            )}
            {liveCompleteness && (
              <p className="facilitator-panel__row">
                <span>{facilitatorCopy.completenessLabel}:</span> <strong>{liveCompleteness}</strong>
              </p>
            )}
            {liveExceptions && (
              <p className="facilitator-panel__row">
                <span>{facilitatorCopy.exceptionsLabel}:</span> <strong>{liveExceptions}</strong>
              </p>
            )}
            {lastResult && (
              <p className="facilitator-panel__row facilitator-panel__result" data-testid="facilitator-last-result">
                {facilitatorCopy.resultTitle}: {lastResult.teacherLabel} · {formatClockAr(lastResult.elapsedMs)} ·{' '}
                {lastResult.pass ? facilitatorCopy.passOk : facilitatorCopy.passLate} ·{' '}
                {lastResultUnsaved ? facilitatorCopy.resultNotSavedNote : facilitatorCopy.resultSavedNote}
              </p>
            )}
          </section>

          <section className="facilitator-panel__section">
            <label className="facilitator-panel__label" htmlFor="facilitator-notes">
              {facilitatorCopy.notesLabel}
            </label>
            <textarea
              id="facilitator-notes"
              className="facilitator-panel__notes"
              value={facilitatorNotes}
              placeholder={facilitatorCopy.notesPlaceholder}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </section>

          <section className="facilitator-panel__section">
            <button type="button" className="btn btn--chip" onClick={() => setConfirming(true)}>
              {facilitatorCopy.startNew}
            </button>
            <button type="button" className="btn btn--chip" onClick={onCopyJson}>
              {facilitatorCopy.copyJson}
            </button>
            <button type="button" className="btn btn--chip" onClick={() => exportCsv()}>
              {facilitatorCopy.exportCsv}
            </button>
          </section>

          {confirming && (
            <div className="facilitator-confirm" role="alertdialog" aria-label={facilitatorCopy.confirmResetTitle}>
              <p>{facilitatorCopy.confirmResetBody}</p>
              <div className="facilitator-confirm__actions">
                <button type="button" className="btn btn--danger" onClick={resetConfirmed}>
                  {facilitatorCopy.confirmYes}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
                  {facilitatorCopy.cancelButtonText}
                </button>
              </div>
            </div>
          )}

          <section className="facilitator-panel__section">
            <label className="facilitator-panel__switch">
              <input type="checkbox" checked={errorSimOn} onChange={onToggleErrorSim} />
              <span>{facilitatorCopy.errorSimTitle}</span>
            </label>
            <p className="facilitator-panel__hint">{facilitatorCopy.errorSimNote}</p>
          </section>

          <section className="facilitator-panel__section">
            <h3>{facilitatorCopy.aggregateTitle}</h3>
            {/* The empty message is about the persisted log; in-memory-only
                sessions still feed the aggregate below, and the hint says so. */}
            {sessions.length - unsavedCount === 0 && <p>{facilitatorCopy.noSessions}</p>}
            {sessions.length > 0 && (
              <dl className="facilitator-aggregate">
                <div><dt>{facilitatorCopy.aggregateCount}</dt><dd>{num(sessions.length)}</dd></div>
                <div><dt>{facilitatorCopy.aggregateAverage}</dt><dd>{formatClockAr(aggregateMs(sessions, 'averageMs'))}</dd></div>
                <div><dt>{facilitatorCopy.aggregateMin}</dt><dd>{formatClockAr(aggregateMs(sessions, 'minMs'))}</dd></div>
                <div><dt>{facilitatorCopy.aggregateMax}</dt><dd>{formatClockAr(aggregateMs(sessions, 'maxMs'))}</dd></div>
                <div><dt>{facilitatorCopy.aggregatePassRate}</dt><dd>{aggregatePassRateText(sessions)}</dd></div>
              </dl>
            )}
            {unsavedCount > 0 && <p className="facilitator-panel__hint">{facilitatorCopy.unsavedNote(unsavedCount)}</p>}
          </section>
        </aside>
      )}
    </div>
  )
}

function aggregateMs(sessions: SessionResult[], key: 'averageMs' | 'minMs' | 'maxMs'): number {
  return computeAggregate(sessions)[key]
}

function aggregatePassRateText(sessions: SessionResult[]): string {
  const agg = computeAggregate(sessions)
  return agg.passRate === null ? '' : `${num(agg.passRate)}٪ (${num(agg.passes)})`
}
