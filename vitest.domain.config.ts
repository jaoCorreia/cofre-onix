import { defineConfig } from 'vitest/config';

// Testes da camada de domínio (TS puro, sem Angular).
export default defineConfig({
  test: {
    include: ['src/domain/**/*.spec.ts'],
    environment: 'node',
  },
});
