import { QueryFailedError } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { logger } from '../../config/logger.js';
import { manejadorErrores } from './manejador.js';

describe('manejadorErrores: error de consulta', () => {
  it('no registra la query ni los parámetros', () => {
    const registrado: string[] = [];
    const espia = vi.spyOn(logger, 'error').mockImplementation(((...args: unknown[]) => {
      registrado.push(JSON.stringify(args));
    }) as never);
    try {
      const err = new QueryFailedError(
        'UPDATE cotizacion SET nota_interna = $1',
        ['SECRETO-XYZ'],
        Object.assign(new Error('numeric field overflow'), { code: '22003' }),
      );
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      manejadorErrores(err, {} as never, res as never, vi.fn());
      expect(res.status).toHaveBeenCalledWith(500);
      expect(registrado.length).toBeGreaterThan(0);
      const log = registrado.join('');
      expect(log).not.toContain('SECRETO-XYZ');
      expect(log).not.toContain('UPDATE cotizacion');
      expect(log).toContain('22003');
    } finally {
      espia.mockRestore();
    }
  });
});
