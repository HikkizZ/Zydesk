import type { Request } from 'express';
import { env } from '../../config/env.js';

// ADR 0013: tras Cloudflare la IP real llega en `cf-connecting-ip`; sin proxy, `req.ip`.
export function ipReal(req: Request): string {
  if (env.PROXY_SALTOS > 0) {
    const cf = req.header('cf-connecting-ip');
    if (cf) return cf;
  }
  return req.ip ?? '';
}
