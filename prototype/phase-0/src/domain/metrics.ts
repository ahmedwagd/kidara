// Session metrics for the hidden facilitator mode.
// The aggregate across ≥3 teachers (not a single run) is the Phase 0 exit evidence.

/** 5:00 in milliseconds — the usability target from the design spec (14.5). */
export const PASS_LIMIT_MS = 300_000

export type SessionResult = {
  sessionId: string
  /** Anonymous label, e.g. «معلمة 1» — no personal data. */
  teacherLabel: string
  /** YYYY-MM-DD */
  reportDate: string
  startedAt: string
  submittedAt: string
  elapsedMs: number
  taps: number
  pass: boolean
  attendanceComplete: boolean
  /** present + late + early_leave */
  attendingCount: number
  mealCount: number
  napCount: number
  moodCount: number
  /** unique affected children */
  exceptionChildren: number
  /** individual exception flags */
  exceptionFlags: number
  notes: number
  usedAllPresent: boolean
  /** Facilitator observation notes (repeated explanations, difficulties). */
  facilitatorNotes: string
}

export function isPass(elapsedMs: number): boolean {
  return elapsedMs < PASS_LIMIT_MS
}

/** mm:ss clock, e.g. 04:32 (formatting keeps western digits; UI renders Arabic-Indic separately). */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export type SessionAggregate = {
  count: number
  averageMs: number
  minMs: number
  maxMs: number
  passes: number
  passRate: number | null // 0..100, null when no sessions
}

export function computeAggregate(sessions: readonly SessionResult[]): SessionAggregate {
  if (sessions.length === 0) return { count: 0, averageMs: 0, minMs: 0, maxMs: 0, passes: 0, passRate: null }
  const times = sessions.map((s) => s.elapsedMs)
  const passes = sessions.filter((s) => s.pass).length
  const total = times.reduce((a, b) => a + b, 0)
  return {
    count: sessions.length,
    averageMs: Math.round(total / sessions.length),
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    passes,
    passRate: Math.round((passes / sessions.length) * 100),
  }
}

/** Anonymous label for the Nth teacher. */
export function teacherLabel(n: number): string {
  const formatted = new Intl.NumberFormat('ar-EG').format(n)
  return `معلمة ${formatted}`
}

export type SessionInput = {
  teacherLabel: string
  reportDate: string
  startedAt: number
  submittedAt: number
  taps: number
  attendanceComplete: boolean
  attendingCount: number
  mealCount: number
  napCount: number
  moodCount: number
  exceptionChildren: number
  exceptionFlags: number
  notes: number
  usedAllPresent: boolean
  facilitatorNotes: string
}

export function buildSessionResult(input: SessionInput): SessionResult {
  return {
    sessionId: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    teacherLabel: input.teacherLabel,
    reportDate: input.reportDate,
    startedAt: new Date(input.startedAt).toISOString(),
    submittedAt: new Date(input.submittedAt).toISOString(),
    elapsedMs: Math.max(0, input.submittedAt - input.startedAt),
    taps: input.taps,
    pass: isPass(input.submittedAt - input.startedAt),
    attendanceComplete: input.attendanceComplete,
    attendingCount: input.attendingCount,
    mealCount: input.mealCount,
    napCount: input.napCount,
    moodCount: input.moodCount,
    exceptionChildren: input.exceptionChildren,
    exceptionFlags: input.exceptionFlags,
    notes: input.notes,
    usedAllPresent: input.usedAllPresent,
    facilitatorNotes: input.facilitatorNotes,
  }
}

const CSV_HEADER = [
  'sessionId',
  'teacherLabel',
  'reportDate',
  'startedAt',
  'submittedAt',
  'elapsedMs',
  'pass',
  'taps',
  'attendanceComplete',
  'attendingCount',
  'mealCount',
  'napCount',
  'moodCount',
  'exceptionChildren',
  'exceptionFlags',
  'notes',
  'usedAllPresent',
  'facilitatorNotes',
] as const

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

function sessionRow(s: SessionResult): string[] {
  return [
    s.sessionId,
    s.teacherLabel,
    s.reportDate,
    s.startedAt,
    s.submittedAt,
    String(s.elapsedMs),
    s.pass ? 'true' : 'false',
    String(s.taps),
    s.attendanceComplete ? 'true' : 'false',
    String(s.attendingCount),
    String(s.mealCount),
    String(s.napCount),
    String(s.moodCount),
    String(s.exceptionChildren),
    String(s.exceptionFlags),
    String(s.notes),
    s.usedAllPresent ? 'true' : 'false',
    s.facilitatorNotes,
  ]
}

/** CSV, with BOM so Excel renders Arabic labels correctly. No personal data. */
export function sessionsToCsv(sessions: readonly SessionResult[]): string {
  const agg = computeAggregate(sessions)
  const rows: string[] = [CSV_HEADER.join(',')]
  for (const s of sessions) rows.push(sessionRow(s).map(csvEscape).join(','))
  rows.push('')
  rows.push(['aggregate', `sessions=${agg.count}`, `averageMs=${agg.averageMs}`, `minMs=${agg.minMs}`, `maxMs=${agg.maxMs}`, `passes=${agg.passes}`, `passRate=${agg.passRate ?? ''}`].join(','))
  return `\uFEFF${rows.join('\r\n')}`
}
