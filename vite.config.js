import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// Sibling libraries are linked with `file:`; Vite follows the symlink to the real path.
const jsLibs = path.resolve(here, '..');

export default defineConfig({
  server: {
    host: true,
    port: 5180,
    fs: {
      allow: [here, jsLibs],
    },
  },
  preview: {
    host: true,
    port: 5180,
  },
  optimizeDeps: {
    exclude: ['block-editor', 'mgl-common-ui', 'mgl-web-ime'],
  },
  build: {
    target: 'es2020',
  },
});
