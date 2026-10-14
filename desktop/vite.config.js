import { defineConfig } from 'vite';

// Рендерер Electron збирається у dist-renderer і відкривається через file://
export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist-renderer',
    emptyOutDir: true,
  },
});
