// Empacota src/domain para a Edge Function (Deno), com decimal.js embutido.
import { build } from 'esbuild';
await build({
  entryPoints: ['src/domain/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: 'supabase/functions/_shared/domain.js',
  banner: { js: '// Gerado por scripts/build-shared.mjs a partir de src/domain. Não edite.' },
});
console.log('domain.js gerado');
