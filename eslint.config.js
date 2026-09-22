import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ ignores: ['dist/**','node_modules/**','public/**','artifacts/**','test-results/**','playwright-report/**'] }, js.configs.recommended, ...ts.configs.recommended, { files: ['**/*.{ts,tsx,js,mjs}'], languageOptions: { globals: { console:'readonly', process:'readonly', Buffer:'readonly', fetch:'readonly', URL:'readonly', setTimeout:'readonly', performance:'readonly', navigator:'readonly', self:'readonly' } } });
