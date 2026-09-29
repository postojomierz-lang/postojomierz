import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// the route planner as its own single-file page, ../rysy/planer.html (run after the main build,
// which empties ../rysy)
// the build time, shown in the app so it is clear which version a phone has
const BUILD = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });

// the planner's online part (supabase/): the project URL and its public (anon / publishable) key, from
// the environment; without them the planner works offline only
const SUPABASE = { __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL || ''), __SUPABASE_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY || '') };
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) console.warn('\n!! SUPABASE_URL / SUPABASE_ANON_KEY not set: the planner is built without its online part\n');

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD), ...SUPABASE },
  publicDir: false,
  plugins: [viteSingleFile()],
  build: { outDir: '../rysy', emptyOutDir: false, target: 'es2022', rollupOptions: { input: 'planer.html' } },
});
