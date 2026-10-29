import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['**/node_modules/', '**/coverage/', 'frontend/dist/'],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: globals.jest,
    },
  },
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...Object.fromEntries(Object.keys(globals.node).map((name) => [name, 'off'])),
        ...globals.browser,
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['frontend/src/**/*.test.{js,jsx}', 'frontend/src/test.setup.js'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
