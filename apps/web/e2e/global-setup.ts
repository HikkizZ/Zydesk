import type { FullConfig } from '@playwright/test';
import { iniciarSesiones } from './sesion.js';

export default async function globalSetup(config: FullConfig): Promise<void> {
  await iniciarSesiones(config.projects[0]!.use.baseURL ?? 'http://localhost:4173');
}
