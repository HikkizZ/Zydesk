import { afterAll, beforeAll, beforeEach } from 'vitest';
import { dataSource } from '../src/config/db.js';
import { abrirOwner, cerrarOwner, reiniciarBd } from './bd.js';

// globalSetup corre en el proceso principal; cada archivo de test abre su propio DataSource de la app
// y su propio DataSource owner (el que borra `evento` y `auditoria` entre tests).
beforeAll(async () => {
  if (!dataSource.isInitialized) await dataSource.initialize();
  await abrirOwner();
});

afterAll(async () => {
  await cerrarOwner();
  if (dataSource.isInitialized) await dataSource.destroy();
});

// Los tests sin BD (env, logger) no se ven afectados: solo se reinicia con el DataSource inicializado.
beforeEach(async () => {
  if (dataSource.isInitialized) await reiniciarBd();
});
