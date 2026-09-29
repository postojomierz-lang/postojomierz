import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// the route planner as its own single-file page, ../rysy/planer.html (run after the main build,
// which empties ../rysy)
// the build time, shown in the app so it is clear which version a phone has
const BUILD = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: '../rysy', emptyOutDir: false, target: 'es2022', rollupOptions: { input: 'planer.html' } },
});
