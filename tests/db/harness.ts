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
  create role service_role nologin bypassrls;
  create table auth.users (id uuid primary key, email text);

  -- Storage: só o necessário para as políticas do bucket de documentos.
  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
    owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
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
