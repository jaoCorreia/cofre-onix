import { PGlite, Transaction } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Imita o mínimo do Supabase que as migrações usam: papéis, auth.uid() e auth.jwt().
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth, public to anon, authenticated;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant execute on all functions in schema auth to anon, authenticated;
`;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(__dirname, '../../supabase/migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return db;
}

export interface TestUser {
  id: string;
  email: string;
}

let seq = 0;
export function user(name: string): TestUser {
  seq++;
  return { id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, email: `${name}@exemplo.com` };
}

/** Executa como um usuário logado, com RLS valendo. Desfaz tudo se lançar erro. */
export async function as<T>(db: PGlite, u: TestUser, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [
      u.id,
      JSON.stringify({ sub: u.id, email: u.email }),
    ]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}
