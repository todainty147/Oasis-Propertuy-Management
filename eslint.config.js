import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    '.next/**',
    'marketing-site/.next/**',
    'node_modules/**',
    'marketing-site/node_modules/**',
    '.claude/**',
  ]),

  // ── App source (browser environment) ────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ── Node scripts ─────────────────────────────────────────────────────────────
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'vite.config.js', '*.config.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // ── Test files (Vitest + Node) ────────────────────────────────────────────────
  {
    files: [
      'tests/**/*.{js,ts}',
      'src/**/*.test.{js,ts,jsx,tsx}',
      '**/*.spec.{js,ts,jsx,tsx}',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        // Vitest globals
        describe:   'readonly',
        it:         'readonly',
        test:       'readonly',
        expect:     'readonly',
        vi:         'readonly',
        beforeEach: 'readonly',
        afterEach:  'readonly',
        beforeAll:  'readonly',
        afterAll:   'readonly',
      },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
])
