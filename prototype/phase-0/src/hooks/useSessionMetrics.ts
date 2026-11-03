import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionResult, SessionInput } from '../domain/metrics'
import { buildSessionResult, teacherLabel } from '../domain/metrics'
import { appendSessions, loadSessions } from '../persistence/draftStore'
import type { SimpleStorage } from '../persistence/browserStorage'

const PASS_LIMIT_MS = 300_000

/**
 * Session metric tracking for the hidden facilitator mode.
 * Timer starts on the first report interaction (a click/input/change on an
 * element with `[data-report-control]`, not on `[data-facilitator]`, not
 * scrolling). Tap counting runs in the capture phase on report controls only.
 * A result is persisted only in facilitator mode; the elapsed time is always
 * kept for the success screen.
 */
export function useSessionMetrics(opts: {
  today: string
  storage: SimpleStorage
  enabled: boolean
}) {
  const { today, enabled } = opts
  const storageRef = useRef(opts.storage)
  useEffect(() => {
    storageRef.current = opts.storage
  }, [opts.storage])

  // One read on mount feeds both the session list and the current teacher label.
  const [bootstrap] = useState(() => {
    const stored = loadSessions(opts.storage)
    return { stored, label: teacherLabel(stored.length + 1) }
  })
  const [sessions, setSessions] = useState<SessionResult[]>(bootstrap.stored)
  const [currentLabel, setCurrentLabel] = useState<string>(bootstrap.label)
  const [taps, setTaps] = useState(0)
  const tapsRef = useRef(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  /** Recomputed by the tick interval and event handlers only — never during render. */
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedRef = useRef<number | null>(null)
  const [facilitatorNotes, setFacilitatorNotes] = useState('')
  const [lastResult, setLastResult] = useState<SessionResult | null>(null)
  /** Sessions that failed to persist: kept in memory until a later write succeeds. */
  const [unsavedSessions, setUnsavedSessions] = useState<SessionResult[]>([])
  const unsavedRef = useRef<SessionResult[]>([])
  /** Whether the last finalized session failed to reach the session log. */
  const [lastResultUnsaved, setLastResultUnsaved] = useState(false)

  // Elapsed clock re-render while a session is running (no initial synchronous
  // set: the timer shows 00:00 until the first tick — harmless for a prototype).
  useEffect(() => {
    if (startedAt === null) return
    const read = () => setElapsedMs(Math.max(0, Date.now() - startedAt))
    const interval = window.setInterval(read, 500)
    return () => window.clearInterval(interval)
  }, [startedAt])

  // Capture-phase interaction listeners on report controls only.
  useEffect(() => {
    const onCapture = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-facilitator]')) return
      if (!target.closest('[data-report-control]')) return
      if (startedRef.current === null) {
        startedRef.current = Date.now()
        setStartedAt(startedRef.current)
      }
      if (event.type === 'click') {
        tapsRef.current += 1
        setTaps(tapsRef.current)
      }
    }
    document.addEventListener('click', onCapture, true)
    document.addEventListener('input', onCapture, true)
    document.addEventListener('change', onCapture, true)
    return () => {
      document.removeEventListener('click', onCapture, true)
      document.removeEventListener('input', onCapture, true)
      document.removeEventListener('change', onCapture, true)
    }
  }, [])

  const reset = useCallback(() => {
    tapsRef.current = 0
    startedRef.current = null
    setTaps(0)
    setStartedAt(null)
    setElapsedMs(0)
    setFacilitatorNotes('')
    setLastResult(null)
    setLastResultUnsaved(false)
    // Unsaved sessions stay in memory here (only a page reload loses them),
    // so the next teacher label keeps not colliding with them.
    const stored = loadSessions(storageRef.current)
    const memory = unsavedRef.current
    setSessions([...stored, ...memory])
    setCurrentLabel(teacherLabel(stored.length + memory.length + 1))
  }, [])

  const finalize = useCallback(
    (
      input: Omit<SessionInput, 'teacherLabel' | 'reportDate' | 'startedAt' | 'submittedAt' | 'taps' | 'facilitatorNotes'>,
    ): SessionResult | null => {
      const started = startedRef.current
      if (started === null) return null
      const submitted = Date.now()
      const result = buildSessionResult({
        teacherLabel: currentLabel,
        reportDate: today,
        startedAt: started,
        submittedAt: submitted,
        taps: tapsRef.current,
        attendanceComplete: input.attendanceComplete,
        attendingCount: input.attendingCount,
        mealCount: input.mealCount,
        napCount: input.napCount,
        moodCount: input.moodCount,
        exceptionChildren: input.exceptionChildren,
        exceptionFlags: input.exceptionFlags,
        notes: input.notes,
        usedAllPresent: input.usedAllPresent,
        facilitatorNotes,
      })
      startedRef.current = null
      setStartedAt(null) // stop the running timer
      setElapsedMs(0)
      setLastResult(result) // always — the success screen shows the elapsed time
      if (enabled) {
        // Persist only in facilitator mode. A failed write keeps the result in
        // memory only: the next teacher label never collides with it, and it is
        // re-attempted with the next successful write — but it is lost on reload.
        const stored = loadSessions(storageRef.current)
        const all = [...stored, ...unsavedRef.current, result]
        setSessions(all)
        if (appendSessions(storageRef.current, all) === 'saved') {
          unsavedRef.current = []
          setUnsavedSessions([])
          setLastResultUnsaved(false)
        } else {
          unsavedRef.current = [...unsavedRef.current, result]
          setUnsavedSessions(unsavedRef.current)
          setLastResultUnsaved(true)
        }
      }
      return result
    },
    [enabled, today, currentLabel, facilitatorNotes],
  )

  const pass = startedAt === null ? null : elapsedMs < PASS_LIMIT_MS

  return {
    taps,
    startedAt,
    elapsedMs,
    pass,
    currentLabel,
    facilitatorNotes,
    setFacilitatorNotes,
    sessions,
    unsavedCount: unsavedSessions.length,
    lastResultUnsaved,
    lastResult,
    reset,
    finalize,
  }
}
