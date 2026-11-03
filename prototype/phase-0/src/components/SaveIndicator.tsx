import { copy } from '../copy'
import type { SaveStatus } from '../hooks/useDraft'

/** Visible persistence states: saving / saved at HH:MM / failed. */
export function SaveIndicator({
  status,
  savedAtText,
  dirty,
}: {
  status: SaveStatus
  savedAtText: string | null
  dirty: boolean
}) {
  if (status === 'error') {
    return (
      <span className="save-indicator save-indicator--error" role="status" data-testid="save-indicator">
        {copy.saveErrorShort}
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="save-indicator save-indicator--saving" role="status" data-testid="save-indicator">
        {copy.saving}
      </span>
    )
  }
  if (status === 'saved' && savedAtText) {
    return (
      <span className="save-indicator save-indicator--saved" role="status" data-testid="save-indicator">
        {savedAtText}
      </span>
    )
  }
  return null
}
