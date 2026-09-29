import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produces one HTML file (code inlined) in ../rysy/, plus the data and textures
// copied from public/ next to it
// the build time, shown in the app so it is clear which version a phone has
const BUILD = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });

// the planner's online part (supabase/): the project URL and its public (anon / publishable) key, from
// the environment; without them the planner works offline only
const SUPABASE = { __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL || ''), __SUPABASE_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY || '') };
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) console.warn('\n!! SUPABASE_URL / SUPABASE_ANON_KEY not set: the planner is built without its online part\n');

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD), ...SUPABASE },
  plugins: [viteSingleFile()],
  build: { outDir: '../rysy', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
});
