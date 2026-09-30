import { afterAll, beforeAll, beforeEach } from 'vitest';
import { dataSource } from '../src/config/db.js';
import { reiniciarBd } from './bd.js';

// globalSetup corre en el proceso principal; cada archivo de test abre su propio DataSource de la app.
beforeAll(async () => {
  if (!dataSource.isInitialized) await dataSource.initialize();
});

afterAll(async () => {
  if (dataSource.isInitialized) await dataSource.destroy();
});

// Los tests sin BD (env, logger) no se ven afectados: solo se reinicia con el DataSource inicializado.
beforeEach(async () => {
  if (dataSource.isInitialized) await reiniciarBd();
});
