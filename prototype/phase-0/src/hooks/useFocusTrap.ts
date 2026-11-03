import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/**
 * Dialog focus trap: focuses the initial target (or the first focusable),
 * cycles Tab/Shift+Tab inside the dialog, closes on Escape, restores focus on
 * unmount. `onClose` is read through a ref so parent re-renders do not restart
 * the trap (previous focus would otherwise be captured twice).
 */
export function useFocusTrap(opts: {
  dialogRef: RefObject<HTMLElement | null>
  onClose: () => void
  /** CSS selector for the initially focused element; defaults to the first focusable. */
  initialFocus?: string
  enabled?: boolean
}) {
  const { dialogRef, initialFocus, enabled = true } = opts
  const onCloseRef = useRef(opts.onClose)
  useEffect(() => {
    onCloseRef.current = opts.onClose
  })

  useEffect(() => {
    if (!enabled) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement as HTMLElement | null
    const initial =
      (initialFocus ? dialog.querySelector<HTMLElement>(initialFocus) : null) ??
      dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    initial?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (items.length === 0) return
      const first = items[0] ?? null
      const last = items[items.length - 1] ?? null
      const active = document.activeElement
      if (!dialog.contains(active)) {
        // Focus escaped (e.g. clicked the browser chrome): pull it back in.
        e.preventDefault()
        ;(e.shiftKey ? last : first)?.focus()
        return
      }
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [dialogRef, initialFocus, enabled])
}
