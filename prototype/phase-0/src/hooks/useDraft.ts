import { useCallback, useEffect, useRef, useState, useReducer } from 'react'
import { createReport, reportReducer, canSubmit, missingAttendanceCount } from '../domain/report'
import type { ReportState } from '../domain/types'
import { draftKey, loadDraft, removeDraft, saveDraft } from '../persistence/draftStore'
import type { SimpleStorage } from '../persistence/browserStorage'
import { copy, formatIsoTime, formatTime } from '../copy'

export type SaveStatus = 'idle' | 'saved' | 'error'

type RestoreKind = 'empty' | 'restored' | 'submitted' | 'invalid' | 'unavailable'

type DraftInit = {
  state: ReportState
  restoreKind: RestoreKind
}

function initDraft(today: string, childIds: readonly string[], storage: SimpleStorage): DraftInit {
  const result = loadDraft(storage, today, childIds)
  switch (result.kind) {
    case 'unavailable':
      // Storage is unusable: fresh in-memory report, warn (never pretend it saved).
      return { state: createReport(today, childIds), restoreKind: 'unavailable' }
    case 'invalid':
      // Invalid payload was already removed by loadDraft.
      return { state: createReport(today, childIds), restoreKind: 'invalid' }
    case 'restored':
    case 'submitted':
      return { state: result.state, restoreKind: result.kind }
    default:
      return { state: createReport(today, childIds), restoreKind: 'empty' }
  }
}

export function useDraft(opts: { today: string; childIds: string[]; storage: SimpleStorage }) {
  const { today, childIds, storage } = opts

  // Runs once per mount; the restore kind drives the one-time toasts below.
  const [init] = useState(() => initDraft(today, childIds, storage))

  const [state, dispatch] = useReducer(reportReducer, init.state)

  // Restore toasts computed once from the load result (no set-state-in-effect).
  const [warningToast, setWarningToast] = useState<string | null>(() =>
    init.restoreKind === 'invalid' ? copy.invalidDraftToast : init.restoreKind === 'unavailable' ? copy.storageUnavailable : null,
  )
  const [restoredToast, setRestoredToast] = useState<string | null>(() =>
    init.restoreKind === 'restored' ? copy.restoreToast(formatIsoTime(init.state.updatedAt) || '') : null,
  )

  // ----- autosave -----
  const serialize = useCallback((s: ReportState) => JSON.stringify(s), [])
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  // Last-saved snapshot kept both in a ref (event/effect comparisons) and in
  // state (`dirty` is derived during render — refs are not read there).
  const [lastSaved, setLastSaved] = useState<string>(() => serialize(init.state))
  const lastSavedRef = useRef<string>(lastSaved)
  const rememberSaved = useCallback((v: string) => {
    lastSavedRef.current = v
    setLastSaved(v)
  }, [])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [savedAtText, setSavedAtText] = useState<string | null>(null)

  const save = useCallback((): 'saved' | 'error' => {
    const result = saveDraft(storage, stateRef.current)
    if (result === 'saved') {
      rememberSaved(serialize(stateRef.current))
      setSaveStatus('saved')
      setSavedAtText(copy.savedAt(formatTime(new Date())))
    } else {
      setSaveStatus('error')
    }
    return result
  }, [storage, serialize, rememberSaved])

  // Periodic autosave every 10 s while dirty.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (serialize(stateRef.current) !== lastSavedRef.current) save()
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [save, serialize])

  // Save on page exit (synchronous setItem).
  useEffect(() => {
    const saveIfDirty = () => {
      if (serialize(stateRef.current) !== lastSavedRef.current) save()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveIfDirty()
    }
    window.addEventListener('pagehide', saveIfDirty)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', saveIfDirty)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [save, serialize])

  // Persist immediately when the report flips draft → submitted.
  const prevStatusRef = useRef(init.state.status)
  useEffect(() => {
    if (prevStatusRef.current === 'draft' && state.status === 'submitted') save()
    prevStatusRef.current = state.status
  }, [state, save])

  const dirty = serialize(state) !== lastSaved

  const resetReport = useCallback(
    (freshChildIds: string[]) => {
      removeDraft(storage, today)
      const fresh = createReport(today, freshChildIds)
      rememberSaved(serialize(fresh))
      setSaveStatus('idle')
      setSavedAtText(null)
      setRestoredToast(null)
      setWarningToast(null)
      dispatch({ type: 'reset', date: today, childIds: freshChildIds })
    },
    [today, storage, serialize, rememberSaved],
  )

  return {
    state,
    dispatch,
    warningToast,
    dismissWarning: useCallback(() => setWarningToast(null), []),
    restoredToast,
    dismissRestored: useCallback(() => setRestoredToast(null), []),
    saveStatus,
    savedAtText,
    dirty,
    saveNow: save,
    retrySave: save,
    resetReport,
    // Classroom-wide validation: every roster child must have an attendance value.
    canSubmitNow: canSubmit(state, childIds),
    missingCount: missingAttendanceCount(state, childIds),
    keyForDate: draftKey(today),
  }
}
