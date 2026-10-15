import { defineConfig } from 'vitest/config';

// Testes do banco (migrações + RLS) em Postgres embutido (PGlite).
export default defineConfig({
  test: {
    include: ['tests/db/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
