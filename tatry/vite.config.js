import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces one self-contained HTML file (data included) in ../rysy/
export default defineConfig({
  base: './',
  assetsInclude: ['**/*.u16'],
  plugins: [viteSingleFile()],
  build: { outDir: '../rysy', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
});
