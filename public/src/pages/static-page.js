import { attachSettingsModal } from '../app/shell.js';

// Shared entry for text-only static pages (terms, guides): footer settings and medal case.
const root = document.getElementById('root');
if (root) attachSettingsModal(root);
