import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  root: true,
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module'
  },
  env: {
    es2023: true,
    node: true
  },
  extends: ['airbnb-base', 'plugin:prettier/recommended'],
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
    'no-console': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      {
        packageDir: [__dirname]
      }
    ],
    'class-methods-use-this': 'off',
    'no-await-in-loop': 'off',
    'no-restricted-syntax': 'off'
  }
};
