import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces one self-contained HTML file in ../plastic-front/
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: '../plastic-front', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 },
});
