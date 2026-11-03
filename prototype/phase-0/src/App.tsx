import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@fontsource-variable/cairo'
import './styles.css'
import { ClassroomScreen } from './components/ClassroomScreen'
import { ChildSheet } from './components/ChildSheet'
import { SubmitSheet, SubmitErrorSheet, SuccessScreen } from './components/SubmitSheet'
import { FacilitatorPanel } from './components/FacilitatorPanel'
import { mockClassroom } from './data/classroom'
import { useDraft } from './hooks/useDraft'
import { useSessionMetrics } from './hooks/useSessionMetrics'
import { normalizeDate } from './persistence/draftStore'
import { createBrowserStorage } from './persistence/browserStorage'
import type { SimpleStorage } from './persistence/browserStorage'
import { copy, facilitatorCopy } from './copy'
import { ParentDayScreen } from './components/parent/ParentDayScreen'
import {
  computeCompleteness,
  computeExceptions,
  computeNotes,
  computeSummary,
} from './domain/report'
import { num, childrenCountPhrase, flagsCountPhrase } from './copy'
import type { Classroom, ReportAction, SheetEntry } from './domain/types'

type Props = {
  /** override the report day (YYYY-MM-DD) for deterministic tests / VITE_REPORT_DATE */
  reportDate?: string
  classroom?: Classroom
  /** force facilitator mode on (tests); by default reads ?facilitator=1 */
  facilitator?: boolean
  /** storage override for tests; by default the real localStorage, or a broken shim if unusable */
  storage?: SimpleStorage
}

export function App(props: Props) {
  // Route resolved once at mount; ParentDayScreen renders on the parent route
  // without touching any teacher hook (useDraft / useSessionMetrics).
  const [route] = useState(() => readRoute())
  if (route.view === 'parent') {
    return (
      <ParentDayScreen
        childId={route.childId}
        reportDate={props.reportDate}
        classroom={props.classroom ?? mockClassroom}
        storage={props.storage}
      />
    )
  }
  return <TeacherApp {...props} />
}

function TeacherApp(props: Props) {
  const classroom = props.classroom ?? mockClassroom
  const today = props.reportDate ?? import.meta.env.VITE_REPORT_DATE ?? normalizeDate(new Date())
  const [facilitatorOn] = useState<boolean>(props.facilitator ?? readFacilitatorParam())
  // Resolved once: real localStorage when usable, otherwise a shim that reports
  // errors so the UI warns instead of silently pretending the draft persists.
  const [storage] = useState<SimpleStorage>(() => props.storage ?? createBrowserStorage())

  const childIds = useMemo(() => classroom.children.map((c) => c.id), [classroom.children])
  const draft = useDraft({ today, childIds, storage })
  // Destructure once: dispatch/dismiss fns are stable, and effects/callbacks
  // below take the values they actually read (not the whole reshaped `draft`).
  const { state, dispatch, warningToast, dismissWarning, restoredToast, dismissRestored, saveStatus, savedAtText, dirty, retrySave, canSubmitNow, missingCount } = draft
  const metrics = useSessionMetrics({ today, storage, enabled: facilitatorOn })

  const [sheetOpen, setSheetOpen] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [errorSimOn, setErrorSimOn] = useState(false)
  // The facilitator panel starts closed so it is never shown to the teacher by accident.
  const [facilitatorOpen, setFacilitatorOpen] = useState(false)
  const [copiedFlash, setCopiedFlash] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const errorSimUsedRef = useRef(false)
  const usedAllPresentRef = useRef(false)

  const dispatchWithMeta = useCallback(
    (action: ReportAction) => {
      if (action.type === 'markAllPresent') usedAllPresentRef.current = true
      dispatch(action)
    },
    [dispatch],
  )

  // ----- stable callbacks (focus-trap effects must not re-run on re-render) -----
  const openChild = useCallback((id: string) => setSheetOpen(id), [])
  const closeSheet = useCallback(() => setSheetOpen(null), [])
  /** «رجوع» / Escape on the review sheet: dismiss it and return to the roster, no submit. */
  const backFromConfirm = useCallback(() => {
    setConfirming(false)
    setSheetOpen(null)
  }, [])
  const changeEntry = useCallback(
    (childId: string, patch: Partial<Omit<SheetEntry, 'childId'>>) => {
      dispatch({ type: 'updateEntry', childId, patch })
    },
    [dispatch],
  )
  const openValidation = useCallback(() => setConfirming(true), [])

  // ----- submit pipeline -----
  const confirmSubmit = useCallback(() => {
    if (errorSimOn && !errorSimUsedRef.current) {
      errorSimUsedRef.current = true
      setConfirming(false)
      setSubmitError(true)
      return
    }
    setSubmitting(true)
    window.setTimeout(() => {
      setSubmitting(false)
      dispatch({ type: 'submit', at: new Date().toISOString(), childIds })
    }, 400)
  }, [dispatch, errorSimOn, childIds])

  // «إعادة المحاولة» runs the submit again immediately — no detour back to the review.
  const retrySubmit = useCallback(() => {
    setSubmitError(false)
    confirmSubmit()
  }, [confirmSubmit])

  // ----- facilitator session finalization on draft → submitted -----
  const prevStatusRef = useRef(state.status)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = state.status
    if (prev !== 'draft' || state.status !== 'submitted') return
    const summary = computeSummary(state, childIds)
    const completeness = computeCompleteness(state, childIds)
    const exceptions = computeExceptions(state, childIds)
    metrics.finalize({
      attendanceComplete: completeness.attendance.count === childIds.length,
      attendingCount: summary.attending,
      mealCount: completeness.meal.count,
      napCount: completeness.nap.count,
      moodCount: completeness.mood.count,
      exceptionChildren: exceptions.childrenCount,
      exceptionFlags: exceptions.flagsCount,
      notes: computeNotes(state, childIds).length,
      usedAllPresent: usedAllPresentRef.current,
    })
  }, [state, metrics, childIds])

  // ----- facilitator actions -----
  const resetAll = useCallback(() => {
    draft.resetReport(childIds)
    metrics.reset()
    usedAllPresentRef.current = false
    errorSimUsedRef.current = false
    setSheetOpen(null)
    setConfirming(false)
    setSubmitError(false)
  }, [draft, metrics, childIds])

  const copyJson = useCallback(() => {
    const payload = {
      generatedAt: new Date().toISOString(),
      reportDate: today,
      sessions: metrics.sessions,
      lastResult: metrics.lastResult,
    }
    const text = JSON.stringify(payload, null, 2)
    const done = () => {
      setCopiedFlash(true)
      setCopyFailed(false)
      window.setTimeout(() => setCopiedFlash(false), 2000)
    }
    const fail = () => {
      // Never claim success when the clipboard write failed.
      setCopiedFlash(false)
      setCopyFailed(true)
      window.setTimeout(() => setCopyFailed(false), 3000)
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done, fail)
    } else {
      fail()
    }
  }, [metrics.sessions, metrics.lastResult, today])

  // ----- derived facilitator live text -----
  const liveTexts = useMemo(() => {
    const completeness = computeCompleteness(state, childIds)
    const exceptions = computeExceptions(state, childIds)
    const completenessText = [
      `${copy.attendanceTitle} ${num(completeness.attendance.count)}/${num(completeness.attendance.total)}`,
      `${copy.mealSectionTitle} ${num(completeness.meal.count)}/${num(completeness.meal.total)}`,
      `${copy.napSectionTitle} ${num(completeness.nap.count)}/${num(completeness.nap.total)}`,
      `${copy.moodSectionTitle} ${num(completeness.mood.count)}/${num(completeness.mood.total)}`,
    ].join(' · ')
    return {
      completenessText,
      exceptionsText: `${childrenCountPhrase(exceptions.childrenCount)} · ${flagsCountPhrase(exceptions.flagsCount)}`,
    }
  }, [state, childIds])

  // auto-dismiss the restore toast
  useEffect(() => {
    if (!restoredToast) return
    const t = window.setTimeout(() => dismissRestored(), 6000)
    return () => window.clearTimeout(t)
  }, [restoredToast, dismissRestored])

  useEffect(() => {
    if (!warningToast) return
    const t = window.setTimeout(() => dismissWarning(), 8000)
    return () => window.clearTimeout(t)
  }, [warningToast, dismissWarning])

  if (state.status === 'submitted') {
    return (
      <>
        <SuccessScreen classroom={classroom} state={state} elapsedMs={metrics.lastResult ? metrics.lastResult.elapsedMs : null} />
        {facilitatorOn && (
          <div data-facilitator>
            {/* Entries are preserved after submit, so the live texts are the
                submission values — completeness stays visible after submit. */}
            <FacilitatorPanel
              open={facilitatorOpen}
              onToggle={() => setFacilitatorOpen((v) => !v)}
              currentLabel={metrics.currentLabel}
              taps={metrics.taps}
              startedAt={metrics.startedAt}
              elapsedMs={metrics.elapsedMs}
              liveCompleteness={liveTexts.completenessText}
              liveExceptions={liveTexts.exceptionsText}
              facilitatorNotes={metrics.facilitatorNotes}
              onNotesChange={metrics.setFacilitatorNotes}
              sessions={metrics.sessions}
              unsavedCount={metrics.unsavedCount}
              lastResultUnsaved={metrics.lastResultUnsaved}
              lastResult={metrics.lastResult}
              onReset={resetAll}
              onCopyJson={copyJson}
              errorSimOn={errorSimOn}
              onToggleErrorSim={() => setErrorSimOn((v) => !v)}
            />
            {copiedFlash && <div className="toast toast--info">{facilitatorCopy.copyDone}</div>}
            {copyFailed && <div className="toast toast--warn">{facilitatorCopy.copyFailed}</div>}
          </div>
        )}
      </>
    )
  }

  const sheetChild = sheetOpen ? classroom.children.find((c) => c.id === sheetOpen) ?? null : null
  const sheetEntry = sheetOpen ? state.entries[sheetOpen] ?? null : null

  return (
    <>
      <ClassroomScreen
        classroom={classroom}
        state={state}
        dispatch={dispatchWithMeta}
        now={new Date()}
        saveStatus={saveStatus}
        savedAtText={savedAtText}
        saveDirty={dirty}
        canSubmit={canSubmitNow}
        missingCount={missingCount}
        onOpenChild={openChild}
        onValidate={openValidation}
        submitting={submitting}
      />

      {sheetChild && sheetEntry && (
        <ChildSheet
          child={sheetChild}
          entry={sheetEntry}
          onChange={(patch) => changeEntry(sheetChild.id, patch)}
          onClose={closeSheet}
        />
      )}

      {confirming && (
        <SubmitSheet
          state={state}
          classroom={classroom}
          submitting={submitting}
          onConfirm={confirmSubmit}
          onBack={backFromConfirm}
        />
      )}

      {submitError && <SubmitErrorSheet onRetry={retrySubmit} />}

      {(restoredToast || warningToast || saveStatus === 'error') && (
        <div className="toast-stack" role="status" aria-live="polite">
          {restoredToast && (
            <div className="toast toast--info" data-testid="toast-restored">
              {restoredToast}
              <button type="button" className="toast__close" onClick={dismissRestored} aria-label="إغلاق">
                ×
              </button>
            </div>
          )}
          {warningToast && (
            <div className="toast toast--warn" data-testid="toast-warning">
              {warningToast}
              <button type="button" className="toast__close" onClick={dismissWarning} aria-label="إغلاق">
                ×
              </button>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="toast toast--warn" data-testid="toast-save-error">
              {copy.saveError}
              <button type="button" className="toast__close" onClick={retrySave}>
                {copy.saveRetry}
              </button>
            </div>
          )}
        </div>
      )}

      {facilitatorOn && (
        <div data-facilitator>
          <FacilitatorPanel
            open={facilitatorOpen}
            onToggle={() => setFacilitatorOpen((v) => !v)}
            currentLabel={metrics.currentLabel}
            taps={metrics.taps}
            startedAt={metrics.startedAt}
            elapsedMs={metrics.elapsedMs}
            liveCompleteness={liveTexts.completenessText}
            liveExceptions={liveTexts.exceptionsText}
            facilitatorNotes={metrics.facilitatorNotes}
            onNotesChange={metrics.setFacilitatorNotes}
            sessions={metrics.sessions}
            unsavedCount={metrics.unsavedCount}
            lastResultUnsaved={metrics.lastResultUnsaved}
            lastResult={metrics.lastResult}
            onReset={resetAll}
            onCopyJson={copyJson}
            errorSimOn={errorSimOn}
            onToggleErrorSim={() => setErrorSimOn((v) => !v)}
          />
          {copiedFlash && <div className="toast toast--info">{facilitatorCopy.copyDone}</div>}
          {copyFailed && <div className="toast toast--warn">{facilitatorCopy.copyFailed}</div>}
        </div>
      )}
    </>
  )
}

function readRoute(): { view: 'parent' | 'teacher'; childId: string } {
  try {
    const params = new URLSearchParams(window.location.search)
    // ?child=… without ?view=parent is ignored: only the parent route reads it.
    return {
      view: params.get('view') === 'parent' ? 'parent' : 'teacher',
      childId: params.get('child') ?? '',
    }
  } catch {
    return { view: 'teacher', childId: '' }
  }
}

function readFacilitatorParam(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('facilitator') === '1'
  } catch {
    return false
  }
}
