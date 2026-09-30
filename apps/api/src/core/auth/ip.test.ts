import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

function peticion(cabeceras: Record<string, string>, ip: string): Request {
  return {
    ip,
    header: (n: string) => cabeceras[n.toLowerCase()],
  } as unknown as Request;
}

async function cargarIpReal(saltos: string) {
  vi.stubEnv('PROXY_SALTOS', saltos);
  vi.resetModules();
  return (await import('./ip.js')).ipReal;
}

describe('ipReal', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('sin proxy usa req.ip e ignora cf-connecting-ip', async () => {
    const ipReal = await cargarIpReal('0');
    expect(ipReal(peticion({ 'cf-connecting-ip': '8.8.8.8' }, '10.0.0.1'))).toBe('10.0.0.1');
  });

  it('con proxy usa cf-connecting-ip si existe, si no req.ip', async () => {
    const ipReal = await cargarIpReal('1');
    expect(ipReal(peticion({ 'cf-connecting-ip': '8.8.8.8' }, '10.0.0.1'))).toBe('8.8.8.8');
    expect(ipReal(peticion({}, '10.0.0.1'))).toBe('10.0.0.1');
  });
});
