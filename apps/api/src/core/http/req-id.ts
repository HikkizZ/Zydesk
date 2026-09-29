import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { contexto } from './contexto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function reqId(): RequestHandler {
  return (req, res, next) => {
    const entrante = req.header('x-request-id');
    const id = entrante && UUID.test(entrante) ? entrante : randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    contexto.run({ req_id: id }, next);
  };
}
