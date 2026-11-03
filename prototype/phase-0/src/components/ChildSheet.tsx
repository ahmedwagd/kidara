import { useRef } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { copy, num } from '../copy'
import type { AttendanceStatus, Child, SheetEntry, ToiletType } from '../domain/types'

/**
 * Per-child sheet. Attendance, meal, nap, toilet, mood, behavior note.
 * For an absent child the daily fields are cleared (by the reducer) and disabled.
 * Focus is trapped; Escape closes; «تم» commits (changes are already live).
 */

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'present', label: copy.attendance.present },
  { value: 'absent', label: copy.attendance.absent },
  { value: 'late', label: copy.attendance.late },
  { value: 'early_leave', label: copy.attendance.early_leave },
]

const MEAL_OPTIONS = [
  { value: 'full', label: copy.meal.full },
  { value: 'partial', label: copy.meal.partial },
  { value: 'refused', label: copy.meal.refused },
] as const

const NAP_OPTIONS = [
  { value: 'slept', label: copy.nap.slept },
  { value: 'did_not_sleep', label: copy.nap.did_not_sleep },
] as const

const TOILET_TYPE_OPTIONS: Array<{ value: ToiletType; label: string }> = [
  { value: 'urine', label: copy.toiletType.urine },
  { value: 'stool', label: copy.toiletType.stool },
  { value: 'both', label: copy.toiletType.both },
  { value: 'unset', label: copy.toiletClear },
]

const MOOD_OPTIONS = [
  { value: 'happy', label: copy.mood.happy },
  { value: 'calm', label: copy.mood.calm },
  { value: 'tired', label: copy.mood.tired },
  { value: 'upset', label: copy.mood.upset },
] as const

export function ChildSheet({
  child,
  entry,
  onChange,
  onClose,
}: {
  child: Child
  entry: SheetEntry
  onChange: (patch: Partial<Omit<SheetEntry, 'childId'>>) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap({ dialogRef, onClose })

  const heading = child.fullName
  const dailyDisabled = entry.attendance === 'absent'

  return (
    <div className="sheet-overlay" data-testid={`sheet-${child.id}`}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={heading} ref={dialogRef} data-report-control>
        <header className="sheet__header">
          <span className="child-avatar child-avatar--sheet" aria-hidden="true">
            {child.initials}
          </span>
          <h2 className="sheet__title">{child.fullName}</h2>
          {child.allergy && <span className="sheet__allergy">{`${copy.allergyChip}: ${child.allergy.label}`}</span>}
          <button type="button" className="sheet__close" aria-label={copy.close} onClick={onClose}>
            ×
          </button>
        </header>

        <section className="sheet__section" aria-label={copy.attendanceTitle}>
          <h3 className="sheet__section-title">{copy.attendanceTitle}</h3>
          <div className="option-row" aria-label={copy.attendanceTitle}>
            {ATTENDANCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn btn--option ${entry.attendance === opt.value ? 'is-selected' : ''}`}
                aria-pressed={entry.attendance === opt.value}
                onClick={() => onChange({ attendance: opt.value })}
                data-testid={`attendance-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {dailyDisabled && <p className="sheet__hint sheet__absent-hint">{copy.attendanceAbsentHint}</p>}

        <section className={`sheet__section ${dailyDisabled ? 'is-disabled' : ''}`} aria-label={copy.mealSectionTitle}>
          <h3 className="sheet__section-title">{copy.mealSectionTitle}</h3>
          <div className="option-row" aria-label={copy.mealSectionTitle}>
            {MEAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={dailyDisabled}
                className={`btn btn--option ${entry.meal === opt.value ? 'is-selected' : ''}`}
                aria-pressed={entry.meal === opt.value}
                onClick={() => onChange({ meal: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <h3 className="sheet__section-title">{copy.napSectionTitle}</h3>
          <div className="option-row" aria-label={copy.napSectionTitle}>
            {NAP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={dailyDisabled}
                className={`btn btn--option ${entry.nap === opt.value ? 'is-selected' : ''}`}
                aria-pressed={entry.nap === opt.value}
                onClick={() => onChange({ nap: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <h3 className="sheet__section-title">
            {copy.toiletTitle} <span className="sheet__hint">({copy.toiletHint})</span>
          </h3>
          <div className="option-row" aria-label={copy.toiletTitle}>
            {TOILET_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={dailyDisabled}
                className={`btn btn--option ${entry.toilet.type === opt.value ? 'is-selected' : ''}`}
                aria-pressed={entry.toilet.type === opt.value}
                onClick={() => onChange({ toilet: { ...entry.toilet, type: opt.value } })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="toilet-stepper">
            <span className="toilet-stepper__label">{copy.toiletCountLabel}</span>
            <button
              type="button"
              className="btn btn--stepper"
              disabled={dailyDisabled || entry.toilet.count === 0}
              aria-label="إنقاص العدد"
              onClick={() => onChange({ toilet: { ...entry.toilet, count: Math.max(0, entry.toilet.count - 1) } })}
            >
              −
            </button>
            <span className="toilet-stepper__value" aria-live="polite">
              {num(entry.toilet.count)}
            </span>
            <button
              type="button"
              className="btn btn--stepper"
              disabled={dailyDisabled}
              aria-label="زيادة العدد"
              onClick={() => onChange({ toilet: { ...entry.toilet, count: entry.toilet.count + 1 } })}
            >
              +
            </button>
          </div>

          <h3 className="sheet__section-title">{copy.moodSectionTitle}</h3>
          <div className="option-row" aria-label={copy.moodSectionTitle}>
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={dailyDisabled}
                className={`btn btn--option ${entry.mood === opt.value ? 'is-selected' : ''}`}
                aria-pressed={entry.mood === opt.value}
                onClick={() => onChange({ mood: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        <section className="sheet__section" aria-label={copy.behaviorNoteTitle}>
          <h3 className="sheet__section-title">{copy.behaviorNoteTitle}</h3>
          <p className="sheet__hint">{copy.behaviorNoteHelper}</p>
          <textarea
            className="sheet__textarea"
            value={entry.behaviorNote}
            disabled={dailyDisabled}
            placeholder={copy.behaviorNotePlaceholder}
            onChange={(e) => onChange({ behaviorNote: e.target.value })}
            aria-label={copy.behaviorNoteTitle}
          />
        </section>

        <footer className="sheet__footer">
          {/* No «إلغاء»: edits are live, so there is nothing to discard. «تم» closes. */}
          <button type="button" className="btn btn--primary sheet__done" onClick={onClose}>
            {copy.done}
          </button>
        </footer>
      </div>
    </div>
  )
}
