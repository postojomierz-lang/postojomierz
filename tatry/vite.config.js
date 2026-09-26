import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces one HTML file (code inlined) in ../rysy/, plus the data and textures
// copied from public/ next to it
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../rysy', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
});
