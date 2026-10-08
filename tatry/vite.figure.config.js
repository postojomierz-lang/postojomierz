import { defineConfig } from 'vite';

// the look editor's turning 3D figure as its own module, ../rysy/figura.js (three.js and the figure),
// loaded by the planner only when the editor opens (run after the main build, which empties ../rysy).
// A plain build with the module as its entry (a library build would keep the whitespace)
export default defineConfig({
  publicDir: false,
  build: {
    outDir: '../rysy', emptyOutDir: false, target: 'es2022', copyPublicDir: false,
    rollupOptions: {
      input: 'src/avatar/preview3d.js',
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: 'figura.js', format: 'es' },
    },
  },
});
