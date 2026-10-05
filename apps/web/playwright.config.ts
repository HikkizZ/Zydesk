import { defineConfig } from '@playwright/test';

// Auditoría móvil (Fase 8, spec §9): corre contra la API y el `preview` de la web con las semillas.
// `docs:capturas` (CAPTURAS=1) usa el mismo servidor pero solo `e2e/capturas.ts`.
const capturas = Boolean(process.env.CAPTURAS);

export default defineConfig({
  testDir: 'e2e',
  testMatch: capturas ? 'capturas.ts' : '*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/informe' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'movil-320',
      grep: /@desborde/,
      use: { browserName: 'chromium', viewport: { width: 320, height: 568 } },
    },
    {
      name: 'movil-375',
      grepInvert: /@escritorio/,
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'escritorio',
      ...(capturas ? {} : { grep: /@desborde|@escritorio|@axe/ }),
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npm run start -w @zydesk/api',
      url: 'http://localhost:3010/api/salud',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run preview -w @zydesk/web -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
