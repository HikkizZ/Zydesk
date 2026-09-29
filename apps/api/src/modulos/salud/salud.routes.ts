import { Router } from 'express';
import { VERSION } from '../../config/version.js';

export function crearRutaSalud(comprobar: () => Promise<boolean>): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const ok = await comprobar();
    res.status(ok ? 200 : 503).json({
      estado: ok ? 'ok' : 'error',
      version: VERSION,
      bd: ok ? 'ok' : 'error',
    });
  });
  return router;
}
