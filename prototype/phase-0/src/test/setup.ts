// Vitest + Testing Library setup for the Phase 0 prototype tests.
// jsdom environment comes from vite.config.ts.

import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
