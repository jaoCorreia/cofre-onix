// Gera src/environments/env.generated.ts a partir do .env, só com as chaves públicas.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PUBLIC_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'GOOGLE_WEB_CLIENT_ID'];

const vars = {};
const file = existsSync('.env') ? '.env' : '.env.example';
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const env = Object.fromEntries(PUBLIC_KEYS.map((k) => [k, process.env[k] ?? vars[k] ?? '']));
writeFileSync(
  'src/environments/env.generated.ts',
  `// Gerado por scripts/gen-env.mjs a partir de ${file}. Não edite.\nexport const publicEnv = ${JSON.stringify(env, null, 2)} as const;\n`,
);
console.log(`env.generated.ts criado a partir de ${file}`);
