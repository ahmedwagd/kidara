// Domain types for the Phase 0 daily-report prototype.
// Throwaway design artifact: no production architecture is established here.

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'early_leave'

export type Meal = 'full' | 'partial' | 'refused' | 'unset'
export type Nap = 'slept' | 'did_not_sleep' | 'unset'
export type Mood = 'happy' | 'calm' | 'tired' | 'upset' | 'unset'
export type ToiletType = 'urine' | 'stool' | 'both' | 'unset'

export type Toilet = {
  count: number
  type: ToiletType
}

export type Child = {
  id: string
  fullName: string
  initials: string
  allergy?: { label: string }
}

export type Classroom = {
  name: string
  template: 'preschool' | string
  children: Child[]
}

export type SheetEntry = {
  childId: string
  attendance: AttendanceStatus | null
  meal: Meal
  nap: Nap
  mood: Mood
  toilet: Toilet
  behaviorNote: string
}

export type ReportStatus = 'draft' | 'submitted'

export type ReportState = {
  schemaVersion: 1
  /** YYYY-MM-DD, the local report day. Part of the draft key and payload. */
  date: string
  entries: Record<string, SheetEntry>
  status: ReportStatus
  updatedAt: string
  submittedAt?: string
}

export type ReportAction =
  | { type: 'markAllPresent' }
  | { type: 'setAttendance'; childId: string; value: AttendanceStatus }
  | { type: 'applyBulkMeal'; value: Exclude<Meal, 'unset'> }
  | { type: 'applyBulkNap'; value: Exclude<Nap, 'unset'> }
  | { type: 'applyBulkMood'; value: Exclude<Mood, 'unset'> }
  | { type: 'updateEntry'; childId: string; patch: Partial<Omit<SheetEntry, 'childId'>> }
  | { type: 'submit'; at: string; childIds?: string[] }
  | { type: 'reset'; date: string; childIds: string[] }
