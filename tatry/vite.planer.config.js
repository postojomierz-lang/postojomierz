import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// the route planner as its own single-file page, ../rysy/planer.html (run after the main build,
// which empties ../rysy)
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: '../rysy', emptyOutDir: false, target: 'es2022', rollupOptions: { input: 'planer.html' } },
});
