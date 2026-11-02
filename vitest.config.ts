import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    env: loadEnv('test', process.cwd(), ''), // lee .env.local para las pruebas de integración
  },
});
