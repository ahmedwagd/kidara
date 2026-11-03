import { copy } from '../copy'
import type { Child, SheetEntry } from '../domain/types'

/** Roster badges state the real exception, not a field abbreviation. */
function exceptionBadge(entry: SheetEntry): Array<{ key: string; label: string }> {
  const badges: Array<{ key: string; label: string }> = []
  if (entry.meal === 'partial') badges.push({ key: 'meal', label: copy.badgeMealPartial })
  else if (entry.meal === 'refused') badges.push({ key: 'meal', label: copy.badgeMealRefused })
  if (entry.nap === 'did_not_sleep') badges.push({ key: 'nap', label: copy.badgeNapNoSleep })
  if (entry.mood === 'tired') badges.push({ key: 'mood', label: copy.badgeMoodTired })
  else if (entry.mood === 'upset') badges.push({ key: 'mood', label: copy.badgeMoodUpset })
  return badges
}

export function ChildRow({ child, entry, onOpen }: { child: Child; entry: SheetEntry; onOpen: (id: string) => void }) {
  const attendance = entry.attendance
  const chipText = attendance === null ? copy.attendanceNone : copy.attendance[attendance]
  const badges = exceptionBadge(entry)
  const ariaParts = [`${child.fullName}: ${chipText}`, ...badges.map((b) => b.label)]
  if (child.allergy) ariaParts.push(`${copy.allergyChip}: ${child.allergy.label}`)
  return (
    <li className="child-row" data-child-id={child.id}>
      <button
        type="button"
        className="child-row__button"
        data-report-control
        onClick={() => onOpen(child.id)}
        aria-label={ariaParts.join(' · ')}
      >
        <span className={`child-avatar child-avatar--${attendance ?? 'none'}`} aria-hidden="true">
          {child.initials}
        </span>
        <span className="child-row__name">{child.fullName}</span>
        {child.allergy && (
          <span className="allergy-dot" title={child.allergy.label} aria-label={`${copy.allergyChip}: ${child.allergy.label}`} />
        )}
        {badges.map((b) => (
          <span key={b.key} className="child-row__badge" title={b.label}>
            {b.label}
          </span>
        ))}
        <span className={`attendance-chip attendance-chip--${attendance ?? 'none'}`}>{chipText}</span>
      </button>
      {entry.behaviorNote.trim() !== '' && <span className="visually-hidden">{`ملاحظة سلوك: ${entry.behaviorNote}`}</span>}
    </li>
  )
}
