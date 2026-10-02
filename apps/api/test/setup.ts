import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { esperarDespachos } from '../src/avisos/despachador.js';
import { dataSource } from '../src/config/db.js';
import { abrirOwner, cerrarOwner, reiniciarBd } from './bd.js';
import { restaurarEnv } from './entorno.js';

// globalSetup corre en el proceso principal; cada archivo de test abre su propio DataSource de la app
// y su propio DataSource owner (el que borra `evento` y `auditoria` entre tests).
beforeAll(async () => {
  if (!dataSource.isInitialized) await dataSource.initialize();
  await abrirOwner();
});

afterAll(async () => {
  await esperarDespachos();
  await cerrarOwner();
  if (dataSource.isInitialized) await dataSource.destroy();
});

// Los tests sin BD (env, logger) no se ven afectados: solo se reinicia con el DataSource inicializado.
// Antes se esperan los avisos que el despachador aún escribe del test anterior (si no, llegarían a la BD nueva).
beforeEach(async () => {
  await esperarDespachos();
  if (dataSource.isInitialized) await reiniciarBd();
});

afterEach(() => restaurarEnv());
