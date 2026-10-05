/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const raiz = fileURLToPath(new URL('../../', import.meta.url));
  const env = loadEnv(mode, raiz, '');
  return {
    plugins: [react(), tailwindcss()],
    envDir: raiz,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: Number(env.WEB_PUERTO ?? 5173),
      proxy: { '/api': `http://localhost:${env.API_PUERTO ?? 3010}` },
    },
    preview: {
      port: 4173,
      proxy: { '/api': `http://localhost:${env.API_PUERTO ?? 3010}` },
    },
    // Ningún asset se inlinea en base64 (los PNG de los manuales pesan cientos de KB; Fase 8).
    build: { assetsInlineLimit: 0 },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
      setupFiles: ['src/test/setup.ts'],
      // Los tests con interacción (p. ej. el Cotizador) superan los 5 s por defecto en equipos lentos.
      testTimeout: 15_000,
    },
  };
});
