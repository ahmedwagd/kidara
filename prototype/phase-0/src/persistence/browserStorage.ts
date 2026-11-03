// Safe access to the browser storage for the prototype.
// localStorage access can throw (privacy mode, disabled site data), so every
// touch is wrapped: the app always continues in memory, never crashes.
// In-memory shims are for tests and for "storage not usable" fallbacks.

export type SimpleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Working in-memory storage (tests, or explicit opt-in to a memory session). */
export function createMemoryStorage(seed?: Record<string, string>): SimpleStorage {
  const map = new Map<string, string>(Object.entries(seed ?? {}))
  return {
    getItem(key) {
      return map.has(key) ? (map.get(key) as string) : null
    },
    setItem(key, value) {
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

/** A storage whose every operation throws — models "localStorage unavailable". */
export function createBrokenStorage(): SimpleStorage {
  return {
    getItem() {
      throw new Error('unavailable')
    },
    setItem() {
      throw new Error('unavailable')
    },
    removeItem() {
      throw new Error('unavailable')
    },
  }
}

/**
 * Returns the real localStorage when usable, otherwise a broken shim.
 * A broken shim (instead of a silent memory store) keeps persistence honest:
 * loadDraft reports "unavailable" and saveDraft reports "error" so the UI can
 * warn the user instead of pretending the draft will survive a refresh.
 */
export function createBrowserStorage(): SimpleStorage {
  try {
    const s = window.localStorage
    // Property access or getItem can throw in privacy/disabled modes.
    void s.getItem('__kidara_probe__')
    return s
  } catch {
    return createBrokenStorage()
  }
}
