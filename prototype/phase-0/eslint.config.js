// Flat ESLint config for the Phase 0 prototype.
// Keep it small: recommended + React hooks/refresh. This is a throwaway design
// artifact, not the production app — do not grow it into a tiered rule library.

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config([
  // Build output and dependencies only — node_modules must stay ignored.
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // This prototype renders state through small module-level constants next
      // to exports (e.g. copy objects, test helpers); allowFastRefresh would
      // flag every file for no real benefit in a non-HMR test environment.
      'react-refresh/only-export-components': 'off',
    },
  },
])
