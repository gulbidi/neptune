import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri', 'supabase', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2021, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    // The classic hook rules only: the React Compiler rules in `recommended` don't apply, as the app doesn't use the compiler.
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  { files: ['*.{js,mjs,ts}', 'scripts/**', 'e2e/**'], languageOptions: { globals: globals.node } },
  // Playwright fixtures call `use()`, which isn't React's hook.
  { files: ['e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
);
