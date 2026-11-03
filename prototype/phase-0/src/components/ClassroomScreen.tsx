import { copy, formatDateLong } from '../copy'
import type { Classroom, ReportAction, ReportState } from '../domain/types'
import { SaveIndicator } from './SaveIndicator'
import type { SaveStatus } from '../hooks/useDraft'
import { AllergyBanner } from './AllergyBanner'
import { BulkActions } from './BulkActions'
import type { Meal, Mood, Nap } from '../domain/types'
import { ChildRow } from './ChildRow'
import { computeSummary } from '../domain/report'
import type { AttendanceStatus } from '../domain/types'

export function ClassroomScreen({
  classroom,
  state,
  dispatch,
  now,
  saveStatus,
  savedAtText,
  saveDirty,
  canSubmit,
  missingCount,
  onOpenChild,
  onValidate,
  submitting,
}: {
  classroom: Classroom
  state: ReportState
  dispatch: (action: ReportAction) => void
  /** injected "now" keeps date formatting deterministic in tests */
  now: Date
  saveStatus: SaveStatus
  savedAtText: string | null
  /** true while the draft has unsaved changes (shows «جارٍ الحفظ…») */
  saveDirty: boolean
  canSubmit: boolean
  missingCount: number
  onOpenChild: (childId: string) => void
  onValidate: () => void
  submitting: boolean
}) {
  const childIds = classroom.children.map((c) => c.id)
  const summary = computeSummary(state, childIds)
  const attendingCount = summary.attending

  return (
    <div className="classroom-screen">
      <header className="classroom-header" data-testid="classroom-header">
        <div className="classroom-header__top">
          <h1 className="classroom-header__name">{classroom.name}</h1>
          <SaveIndicator status={saveStatus} savedAtText={savedAtText} dirty={saveDirty} />
        </div>
        <div className="classroom-header__meta">
          <span className="classroom-header__date">{formatDateLong(now)}</span>
          {classroom.children.length > 0 && (
            <span className="classroom-header__count" data-testid="attendance-count">
              {copy.countLabel(attendingCount, classroom.children.length)}
            </span>
          )}
        </div>
      </header>

      <AllergyBanner classroom={classroom} />

      {/* No [data-report-control] here: taps against the scroll container's
          empty space would count as report interactions. The bulk panel, child
          row buttons, per-child sheet and submit bar carry the attribute. */}
      <div className="classroom-scroll">
        {classroom.children.length > 0 && (
          <BulkActions
            onAllPresent={() => dispatch({ type: 'markAllPresent' })}
            onBulkMeal={(v: Exclude<Meal, 'unset'>) => dispatch({ type: 'applyBulkMeal', value: v })}
            onBulkNap={(v: Exclude<Nap, 'unset'>) => dispatch({ type: 'applyBulkNap', value: v })}
            onBulkMood={(v: Exclude<Mood, 'unset'>) => dispatch({ type: 'applyBulkMood', value: v })}
          />
        )}

        {classroom.children.length === 0 ? (
          <div className="classroom-empty" data-testid="empty-classroom">
            {copy.emptyClassroom}
            <p className="classroom-empty__hint">{copy.emptyClassroomHint}</p>
          </div>
        ) : (
          <ul className="child-list" data-testid="child-list">
            {classroom.children.map((child) => (
              <ChildRow key={child.id} child={child} entry={state.entries[child.id] ?? emptyEntry(child.id)} onOpen={onOpenChild} />
            ))}
          </ul>
        )}
      </div>

      <footer className="submit-bar" data-report-control data-testid="submit-bar">
        <button
          type="button"
          className="btn btn--primary submit-bar__button"
          disabled={!canSubmit || submitting || classroom.children.length === 0}
          onClick={onValidate}
          data-testid="submit-bar-button"
        >
          {submitting ? copy.submitting : copy.submitBar}
        </button>
        <span className="submit-bar__remaining" data-testid="submit-remaining">
          {canSubmit || classroom.children.length === 0 ? '' : copy.remainingText(missingCount)}
        </span>
      </footer>
    </div>
  )
}

function emptyEntry(childId: string) {
  return {
    childId,
    attendance: null as AttendanceStatus | null,
    meal: 'unset' as const,
    nap: 'unset' as const,
    mood: 'unset' as const,
    toilet: { count: 0, type: 'unset' as const },
    behaviorNote: '',
  }
}
