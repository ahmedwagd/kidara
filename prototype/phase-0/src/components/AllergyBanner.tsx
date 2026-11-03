import { copy } from '../copy'
import type { Classroom } from '../domain/types'

/** Static red allergy strip read from the mock data — informational only. */
export function AllergyBanner({ classroom }: { classroom: Classroom }) {
  const withAllergy = classroom.children.filter((c) => c.allergy)
  if (withAllergy.length === 0) return null
  return (
    <section className="allergy-banner" role="note" aria-label={copy.allergyTitle}>
      <strong className="allergy-banner__title">{copy.allergyTitle}:</strong>
      <ul className="allergy-banner__list">
        {withAllergy.map((c) => (
          <li key={c.id}>
            {c.fullName} — {c.allergy?.label}
          </li>
        ))}
      </ul>
    </section>
  )
}
