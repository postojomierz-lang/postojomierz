import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces one HTML file (code inlined) in ../rysy/, plus the data and textures
// copied from public/ next to it
// the build time, shown in the app so it is clear which version a phone has
const BUILD = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [viteSingleFile()],
  build: { outDir: '../rysy', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
});
