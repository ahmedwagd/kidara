import { useState } from 'react'
import { copy } from '../copy'
import type { Meal, Mood, Nap } from '../domain/types'

export type BulkValue = Exclude<Meal, 'unset'> | Exclude<Nap, 'unset'> | Exclude<Mood, 'unset'>

type Preset = {
  id: string
  label: string
  alternatives: Array<{ label: string; value: BulkValue }>
}

export function BulkActions({
  onBulkMeal,
  onBulkNap,
  onBulkMood,
  onAllPresent,
}: {
  onBulkMeal: (v: Exclude<Meal, 'unset'>) => void
  onBulkNap: (v: Exclude<Nap, 'unset'>) => void
  onBulkMood: (v: Exclude<Mood, 'unset'>) => void
  onAllPresent: () => void
}) {
  const [open, setOpen] = useState<string |null>(null)

  const presets: Preset[] = [
    {
      id: 'meal',
      label: copy.mealAllFull,
      alternatives: [
        { label: copy.mealAltPartial, value: 'partial' },
        { label: copy.mealAltRefused, value: 'refused' },
      ],
    },
    {
      id: 'nap',
      label: copy.napAllSlept,
      alternatives: [{ label: copy.napAlt, value: 'did_not_sleep' }],
    },
    {
      id: 'mood',
      label: copy.moodAllCalm,
      alternatives: [
        { label: copy.moodAltHappy, value: 'happy' },
        { label: copy.moodAltTired, value: 'tired' },
        { label: copy.moodAltUpset, value: 'upset' },
      ],
    },
  ]

  const apply = (presetId: string, value: BulkValue | null) => {
    if (presetId === 'meal') onBulkMeal((value ?? 'full') as Exclude<Meal, 'unset'>)
    else if (presetId === 'nap') onBulkNap((value ?? 'slept') as Exclude<Nap, 'unset'>)
    else onBulkMood((value ?? 'calm') as Exclude<Mood, 'unset'>)
    setOpen(null)
  }

  return (
    <div className="bulk-panel" data-report-control>
      <button type="button" className="btn btn--primary bulk-panel__all-present" onClick={onAllPresent} data-testid="bulk-all-present">
        {copy.allPresent}
      </button>
      <p className="bulk-panel__hint">{copy.bulkTitle} · {copy.bulkHint}</p>
      <div className="bulk-panel__presets">
        {presets.map((preset) => (
          <div key={preset.id} className="bulk-presets__item">
            <div className="bulk-presets__row">
              <button type="button" className="btn bulk-preset" onClick={() => apply(preset.id, null)}>
                {preset.label}
              </button>
              <button
                type="button"
                className="btn btn--chevron"
                aria-expanded={open === preset.id}
                aria-label={`بديل: ${preset.label}`}
                onClick={() => setOpen(open === preset.id ? null : preset.id)}
              >
                ▾
              </button>
            </div>
            {open === preset.id && (
              <div className="bulk-preset__alternatives">
                {preset.alternatives.map((alt) => (
                  <button key={alt.value} type="button" className="btn btn--chip" onClick={() => apply(preset.id, alt.value)}>
                    {alt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
