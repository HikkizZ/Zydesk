import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  archivoDePrueba,
  crearArchivoPendiente,
  crearOt,
  crearTicket,
  crearUsuario,
  directorioArchivosTest,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { crearLogger, logger as loggerGlobal } from '../../config/logger.js';
import { dataSource } from '../../config/db.js';
import { enTransaccion } from '../../core/historial/transaccion.js';
import { storage } from '../../integraciones/storage/storage.js';
import { Archivo } from './archivo.entity.js';
import {
  archivosDe,
  archivosDeMensajes,
  asociarArchivos,
  guardarBufferComoArchivo,
  sanearNombre,
} from './archivos.service.js';

const app = () => crearApp({ comprobarBd: async () => true });
const CLAVE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z]+$/;

const sesion = async (rol: 'tecnico' | 'lectura' | 'admin' = 'tecnico') => {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
};

function archivosEnDisco(dir: string = directorioArchivosTest()): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).flatMap((e) => {
    return e.isFile() ? [path.join(e.parentPath, e.name)] : [];
  });
}

const total = async (): Promise<number> => dataSource.manager.count(Archivo);

async function asociar(archivoId: number, ticketId: number): Promise<void> {
  await dataSource.manager.update(
    Archivo,
    { id: archivoId },
    { entidad: 'ticket', entidad_id: ticketId },
  );
}

describe('POST /api/archivos', () => {
  it('sube archivos (campo `archivos`), los deja pendientes y los guarda con clave aaaa/mm/<uuid>.<ext>', async () => {
    const { usuario, agente } = await sesion();
    const res = await agente
      .post('/api/archivos')
      .attach('archivos', archivoDePrueba('foto.jpg'), 'foto.jpg')
      .attach('archivos', archivoDePrueba('doc.pdf'), 'doc.pdf')
      .attach('archivos', archivoDePrueba('correo.eml'), 'correo.eml');
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((a: { categoria: string }) => a.categoria)).toEqual([
      'foto',
      'documento',
      'correo',
    ]);
    expect(res.body[0]).toMatchObject({
      nombre_original: 'foto.jpg',
      tipo_mime: 'image/jpeg',
      es_imagen: true,
      origen_correo: false,
      subido_por: { id: usuario.id, nombre: usuario.nombre },
    });
    expect(res.body[0].url).toBe(`/api/archivos/${res.body[0].id}`);

    const filas = await dataSource.manager.find(Archivo, { order: { id: 'ASC' } });
    expect(filas.map((f) => f.entidad)).toEqual([null, null, null]);
    expect(filas.map((f) => f.subido_por)).toEqual([usuario.id, usuario.id, usuario.id]);
    for (const f of filas) {
      expect(f.clave).toMatch(CLAVE);
      expect(await storage.existe(f.clave)).toBe(true);
    }
    expect(filas[2]!.tipo_mime).toBe('message/rfc822');
  });

  it('conserva nombres con acentos (UTF-8)', async () => {
    const { agente } = await sesion();
    const res = await agente
      .post('/api/archivos')
      .attach('archivos', archivoDePrueba('doc.pdf'), 'Informe ñandú año.pdf');
    expect(res.status).toBe(201);
    expect(res.body[0].nombre_original).toBe('Informe ñandú año.pdf');
  });

  it('4. MIME falso: no-es-imagen.png, .exe renombrado .pdf y .eml con bytes nulos → 400 sin dejar nada', async () => {
    const { agente } = await sesion();
    const antes = archivosEnDisco().length;
    const casos: Array<[Buffer, string]> = [
      [archivoDePrueba('no-es-imagen.png'), 'no-es-imagen.png'],
      [archivoDePrueba('no-es-imagen.png'), 'programa.pdf'],
      [Buffer.from('From: a@x.cl\0\0\0Subject: x\r\n\r\ncuerpo'), 'nulos.eml'],
    ];
    for (const [contenido, nombre] of casos) {
      const res = await agente.post('/api/archivos').attach('archivos', contenido, nombre);
      expect(res.status, nombre).toBe(400);
      expect(res.body.error.codigo).toBe('ARCHIVO_NO_PERMITIDO');
      expect(res.body.error.detalles).toEqual({ nombre });
    }
    expect(await total()).toBe(0);
    expect(archivosEnDisco()).toHaveLength(antes);
  });

  it('todo o nada: si uno de la petición falla, no queda ninguno', async () => {
    const { agente } = await sesion();
    const antes = archivosEnDisco().length;
    const res = await agente
      .post('/api/archivos')
      .attach('archivos', archivoDePrueba('foto.jpg'), 'foto.jpg')
      .attach('archivos', archivoDePrueba('no-es-imagen.png'), 'malo.png');
    expect(res.status).toBe(400);
    expect(await total()).toBe(0);
    expect(archivosEnDisco()).toHaveLength(antes);
  });

  it('4. tamaño: 20 MB + 1 byte → 413 ARCHIVO_MUY_GRANDE, con X-Request-Id y sin rastro en disco ni BD', async () => {
    const { agente } = await sesion();
    const antes = archivosEnDisco().length;
    const res = await agente
      .post('/api/archivos')
      .attach('archivos', Buffer.alloc(20 * 1024 * 1024 + 1, 'a'), 'grande.txt');
    expect(res.status).toBe(413);
    expect(res.body.error.codigo).toBe('ARCHIVO_MUY_GRANDE');
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(await total()).toBe(0);
    expect(archivosEnDisco()).toHaveLength(antes);
  }, 30_000);

  it('un archivo de exactamente 20 MB se acepta', async () => {
    const { agente } = await sesion();
    const res = await agente
      .post('/api/archivos')
      .attach('archivos', Buffer.alloc(20 * 1024 * 1024, 'a'), 'justo.txt');
    expect(res.status).toBe(201);
    expect(res.body[0].tamano).toBe(20 * 1024 * 1024);
  }, 30_000);

  it('4. cantidad: 11 archivos → 400 DEMASIADOS_ARCHIVOS; 10 → 201', async () => {
    const { agente } = await sesion();
    const enviar = (n: number) => {
      const r = agente.post('/api/archivos');
      for (let i = 0; i < n; i++) r.attach('archivos', archivoDePrueba('foto.jpg'), `f${i}.jpg`);
      return r;
    };
    const mal = await enviar(11);
    expect(mal.status).toBe(400);
    expect(mal.body.error.codigo).toBe('DEMASIADOS_ARCHIVOS');
    expect(await total()).toBe(0);
    expect((await enviar(10)).status).toBe(201);
    expect(await total()).toBe(10);
  });

  it('sin archivos o con otro campo → 400 VALIDACION', async () => {
    const { agente } = await sesion();
    const vacio = await agente.post('/api/archivos').send({});
    expect(vacio.status).toBe(400);
    expect(vacio.body.error.codigo).toBe('VALIDACION');
    const otro = await agente
      .post('/api/archivos')
      .attach('otro', archivoDePrueba('foto.jpg'), 'foto.jpg');
    expect(otro.status).toBe(400);
    expect(otro.body.error.codigo).toBe('VALIDACION');
  });

  it('1. permisos: lectura → 403; sin sesión → 401', async () => {
    const { agente } = await sesion('lectura');
    const res = await agente
      .post('/api/archivos')
      .attach('archivos', archivoDePrueba('foto.jpg'), 'foto.jpg');
    expect(res.status).toBe(403);
    expect(await total()).toBe(0);
    const sin = await request(app())
      .post('/api/archivos')
      .set('X-Requested-With', 'Zydesk')
      .attach('archivos', archivoDePrueba('foto.jpg'), 'foto.jpg');
    expect(sin.status).toBe(401);
  });

  it('5. nombre: `../../etc/passwd.pdf` se guarda tal cual; en disco es aaaa/mm/<uuid>.pdf y la cabecera lo codifica', async () => {
    const { agente } = await sesion();
    const peligroso = '../../etc/passwd.pdf';
    const res = await agente.post('/api/archivos').attach('archivos', archivoDePrueba('doc.pdf'), {
      filename: peligroso,
      filepath: peligroso,
    } as unknown as { filename: string });
    expect(res.status).toBe(201);
    expect(res.body[0].nombre_original).toBe(peligroso);
    const fila = await dataSource.manager.findOneByOrFail(Archivo, { id: res.body[0].id });
    expect(fila.clave).toMatch(CLAVE);
    expect(fila.clave).not.toContain('..');
    expect(fila.clave.endsWith('.pdf')).toBe(true);
    const enDisco = storage.ruta(fila.clave);
    expect(enDisco.startsWith(directorioArchivosTest())).toBe(true);
    expect(fs.existsSync(enDisco)).toBe(true);

    const descarga = await agente.get(`/api/archivos/${fila.id}`);
    expect(descarga.status).toBe(200);
    const cd = descarga.headers['content-disposition'] as string;
    expect(cd).toContain(`filename*=UTF-8''..%2F..%2Fetc%2Fpasswd.pdf`);
    expect(cd).toContain('filename=".._.._etc_passwd.pdf"');
  });
});

describe('Endurecimiento de subida y descarga (ADR 0031)', () => {
  const CSP = "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";

  it('la descarga de imagen, PDF y .txt lleva la CSP aislada, nosniff y su Content-Type; otras rutas no', async () => {
    const a = await sesion();
    const ticket = await crearTicket();
    for (const [nombre, tipo_mime, contenido] of [
      ['foto.jpg', 'image/jpeg', archivoDePrueba('foto.jpg')],
      ['doc.pdf', 'application/pdf', archivoDePrueba('doc.pdf')],
      ['nota.txt', 'text/plain', Buffer.from('hola')],
    ] as const) {
      const f = await crearArchivoPendiente(a.usuario.id, { nombre, tipo_mime, contenido });
      await asociar(f.id, ticket.id);
      const res = await a.agente.get(`/api/archivos/${f.id}`);
      expect(res.status, nombre).toBe(200);
      expect(res.headers['content-security-policy'], nombre).toBe(CSP);
      expect(res.headers['x-content-type-options'], nombre).toBe('nosniff');
      expect(res.headers['content-type'], nombre).toContain(tipo_mime);
    }
    const otra = await a.agente.get('/api/archivos/pendientes');
    expect(otra.headers['content-security-policy']).toContain("default-src 'self'");
    expect(otra.headers['content-security-policy']).not.toBe(CSP);
  });

  async function llenarPendientes(usuario_id: number, n: number, tamano = 10): Promise<void> {
    await dataSource.manager.insert(
      Archivo,
      Array.from({ length: n }, (_, i) => ({
        entidad: null,
        entidad_id: null,
        mensaje_id: null,
        categoria: 'documento' as const,
        nombre_original: `p${i}.txt`,
        tipo_mime: 'text/plain',
        tamano,
        clave: `2000/01/relleno-${usuario_id}-${i}-${Math.random()}.txt`,
        origen_correo_id: null,
        subido_por: usuario_id,
      })),
    );
  }

  it('con 50 pendientes → 429 CUPO_ARCHIVOS_PENDIENTES sin escribir en disco; otro usuario sí sube; al asociarlos vuelve a poder', async () => {
    const a = await sesion();
    const b = await sesion();
    await llenarPendientes(a.usuario.id, 50);
    const antes = archivosEnDisco().length;
    const subir = (agente: typeof a.agente) =>
      agente.post('/api/archivos').attach('archivos', archivoDePrueba('foto.jpg'), 'foto.jpg');

    const res = await subir(a.agente);
    expect(res.status).toBe(429);
    expect(res.body.error.codigo).toBe('CUPO_ARCHIVOS_PENDIENTES');
    expect(archivosEnDisco()).toHaveLength(antes);
    expect(await total()).toBe(50);

    expect((await subir(b.agente)).status).toBe(201);

    const ticket = await crearTicket();
    await dataSource.manager.update(
      Archivo,
      { subido_por: a.usuario.id },
      { entidad: 'ticket', entidad_id: ticket.id },
    );
    expect((await subir(a.agente)).status).toBe(201);
  });

  it('con 200 MB pendientes → 429; con 49 pendientes pequeños aún sube', async () => {
    const a = await sesion();
    const b = await sesion();
    await llenarPendientes(a.usuario.id, 10, 20 * 1024 * 1024);
    await llenarPendientes(b.usuario.id, 49);
    const subir = (agente: typeof a.agente) =>
      agente.post('/api/archivos').attach('archivos', archivoDePrueba('foto.jpg'), 'foto.jpg');
    const res = await subir(a.agente);
    expect(res.status).toBe(429);
    expect(res.body.error.codigo).toBe('CUPO_ARCHIVOS_PENDIENTES');
    expect((await subir(b.agente)).status).toBe(201);
  });

  it('nombre de 1 000 caracteres: se recorta a 255 conservando la extensión y la descarga responde 200', async () => {
    const { agente } = await sesion();
    const largo = `${'a'.repeat(1000)}.pdf`;
    const res = await agente.post('/api/archivos').attach('archivos', archivoDePrueba('doc.pdf'), {
      filename: largo,
    } as unknown as { filename: string });
    expect(res.status).toBe(201);
    const nombre = res.body[0].nombre_original as string;
    expect(nombre).toHaveLength(255);
    expect(nombre.endsWith('.pdf')).toBe(true);
    const fila = await dataSource.manager.findOneByOrFail(Archivo, { id: res.body[0].id });
    expect(fila.nombre_original).toBe(nombre);
    const descarga = await agente.get(`/api/archivos/${fila.id}`);
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-disposition']).toMatch(
      /^inline; filename="a+\.pdf"; filename\*=/,
    );
  });

  it('nombre con U+202E y caracteres de control: se guarda saneado', async () => {
    const { agente } = await sesion();
    const res = await agente.post('/api/archivos').attach('archivos', archivoDePrueba('doc.pdf'), {
      filename: 'fact‮fdp.exe⁦.pdf',
    } as unknown as { filename: string });
    expect(res.status).toBe(201);
    expect(res.body[0].nombre_original).toBe('factfdp.exe.pdf');
    const descarga = await agente.get(`/api/archivos/${res.body[0].id}`);
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-disposition']).toContain('filename="factfdp.exe.pdf"');
  });
});

describe('GET /api/archivos/pendientes', () => {
  it('devuelve solo los pendientes del actor', async () => {
    const a = await sesion();
    const b = await sesion();
    const mio = await crearArchivoPendiente(a.usuario.id);
    await crearArchivoPendiente(b.usuario.id);
    const asociado = await crearArchivoPendiente(a.usuario.id);
    await asociar(asociado.id, (await crearTicket()).id);
    const res = await a.agente.get('/api/archivos/pendientes');
    expect(res.status).toBe(200);
    expect(res.body.map((x: { id: number }) => x.id)).toEqual([mio.id]);
  });

  it('lectura → 403', async () => {
    const { agente } = await sesion('lectura');
    expect((await agente.get('/api/archivos/pendientes')).status).toBe(403);
  });
});

describe('GET /api/archivos/:id', () => {
  it('3. un pendiente ajeno → 404; el propio → 200 con el contenido', async () => {
    const a = await sesion();
    const b = await sesion();
    const contenido = Buffer.from('contenido propio');
    const propio = await crearArchivoPendiente(a.usuario.id, { contenido });
    const res = await a.agente.get(`/api/archivos/${propio.id}`).buffer(true).parse(binario);
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body as Buffer).equals(contenido)).toBe(true);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-length']).toBe(String(contenido.length));
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect((await b.agente.get(`/api/archivos/${propio.id}`)).status).toBe(404);
    expect((await a.agente.get('/api/archivos/99999')).status).toBe(404);
  });

  it('sin sesión → 401', async () => {
    const res = await request(app()).get('/api/archivos/1');
    expect(res.status).toBe(401);
  });

  it('2. un archivo asociado a un ticket lo descarga cualquier rol, incluido lectura', async () => {
    const a = await sesion();
    const lector = await sesion('lectura');
    const archivo = await crearArchivoPendiente(a.usuario.id, {
      tipo_mime: 'application/pdf',
      contenido: archivoDePrueba('doc.pdf'),
    });
    await asociar(archivo.id, (await crearTicket()).id);
    const res = await lector.agente.get(`/api/archivos/${archivo.id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('13. Content-Disposition: inline para imágenes y PDF, attachment para el resto; auditoría solo en attachment', async () => {
    const a = await sesion();
    const ticket = await crearTicket();
    const crear = async (nombre: string, tipo_mime: string, contenido: Buffer) => {
      const f = await crearArchivoPendiente(a.usuario.id, { nombre, tipo_mime, contenido });
      await asociar(f.id, ticket.id);
      return f;
    };
    const jpg = await crear('foto.jpg', 'image/jpeg', archivoDePrueba('foto.jpg'));
    const pdf = await crear('doc.pdf', 'application/pdf', archivoDePrueba('doc.pdf'));
    const csv = await crear('datos.csv', 'text/csv', Buffer.from('a,b\n1,2'));
    const eml = await crear('correo.eml', 'message/rfc822', archivoDePrueba('correo.eml'));

    const disposicion = async (id: number) =>
      ((await a.agente.get(`/api/archivos/${id}`)).headers['content-disposition'] as string).split(
        ';',
      )[0];
    expect(await disposicion(jpg.id)).toBe('inline');
    expect(await disposicion(pdf.id)).toBe('inline');
    expect(await disposicion(csv.id)).toBe('attachment');
    expect(await disposicion(eml.id)).toBe('attachment');

    const filas: Array<{ usuario_id: number; detalle: Record<string, unknown> }> =
      await dataSource.query(
        `SELECT usuario_id, detalle FROM auditoria WHERE accion = 'descarga_archivo' ORDER BY id`,
      );
    expect(filas.map((f) => f.detalle['archivo_id'])).toEqual([csv.id, eml.id]);
    expect(filas[0]).toMatchObject({
      usuario_id: a.usuario.id,
      detalle: { archivo_id: csv.id, entidad: 'ticket', entidad_id: ticket.id },
    });
  });

  it('F3: un archivo de entidad ot lo descarga el rol lectura (200); solo el attachment se audita, con entidad ot', async () => {
    const a = await sesion();
    const lector = await sesion('lectura');
    const ot = await crearOt((await crearTicket()).id);
    const crear = async (nombre: string, tipo_mime: string, contenido: Buffer) => {
      const f = await crearArchivoPendiente(a.usuario.id, { nombre, tipo_mime, contenido });
      await dataSource.manager.update(Archivo, { id: f.id }, { entidad: 'ot', entidad_id: ot.id });
      return f;
    };
    const foto = await crear('foto.jpg', 'image/jpeg', archivoDePrueba('foto.jpg'));
    const csv = await crear('datos.csv', 'text/csv', Buffer.from('a,b,1,2'));

    const r1 = await lector.agente.get(`/api/archivos/${foto.id}`);
    expect(r1.status).toBe(200);
    expect(r1.headers['content-disposition']).toMatch(/^inline/);
    const r2 = await lector.agente.get(`/api/archivos/${csv.id}`);
    expect(r2.status).toBe(200);
    expect(r2.headers['content-disposition']).toMatch(/^attachment/);

    const filas: Array<{ detalle: Record<string, unknown> }> = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'descarga_archivo' ORDER BY id`,
    );
    expect(filas.map((f) => f.detalle)).toEqual([
      { archivo_id: csv.id, entidad: 'ot', entidad_id: ot.id },
    ]);
  });

  it('descargar un pendiente propio como attachment se audita con entidad null', async () => {
    const a = await sesion();
    const f = await crearArchivoPendiente(a.usuario.id);
    await a.agente.get(`/api/archivos/${f.id}`);
    const [fila] = await dataSource.query(
      `SELECT detalle FROM auditoria WHERE accion = 'descarga_archivo'`,
    );
    expect(fila.detalle).toEqual({ archivo_id: f.id, entidad: null, entidad_id: null });
  });
});

describe('DELETE /api/archivos/:id', () => {
  it('3. un pendiente ajeno → 404 y no se toca; el propio → 204 y se borra fila y disco', async () => {
    const a = await sesion();
    const b = await sesion();
    const f = await crearArchivoPendiente(a.usuario.id);
    expect((await b.agente.delete(`/api/archivos/${f.id}`)).status).toBe(404);
    expect(await storage.existe(f.clave)).toBe(true);
    expect((await a.agente.delete(`/api/archivos/${f.id}`)).status).toBe(204);
    expect(await total()).toBe(0);
    expect(await storage.existe(f.clave)).toBe(false);
  });

  it('un archivo ya asociado no se puede borrar (404)', async () => {
    const a = await sesion();
    const f = await crearArchivoPendiente(a.usuario.id);
    await asociar(f.id, (await crearTicket()).id);
    expect((await a.agente.delete(`/api/archivos/${f.id}`)).status).toBe(404);
    expect(await total()).toBe(1);
    expect(await storage.existe(f.clave)).toBe(true);
  });

  it('1. lectura → 403', async () => {
    const { agente } = await sesion('lectura');
    expect((await agente.delete('/api/archivos/1')).status).toBe(403);
  });
});

describe('15. logs', () => {
  it('subir un archivo no deja el nombre original en los logs, solo ids', async () => {
    const lineas: string[] = [];
    const destino = new Writable({
      write(chunk, _enc, cb) {
        lineas.push(...String(chunk).split('\n').filter(Boolean));
        cb();
      },
    });
    const logger = crearLogger({
      nivel: 'debug',
      entorno: 'test',
      version: '0.0.0',
      bonito: false,
      destino,
    });
    const espia = vi.spyOn(loggerGlobal, 'info');
    const usuario = await crearUsuario();
    const { agente } = await ingresarComo(
      crearApp({ comprobarBd: async () => true, logger }),
      usuario,
    );
    const res = await agente
      .post('/api/archivos')
      .attach('archivos', archivoDePrueba('doc.pdf'), 'secreto-confidencial.pdf');
    expect(res.status).toBe(201);
    expect(lineas.length).toBeGreaterThan(0);
    expect(lineas.some((l) => l.includes('secreto-confidencial'))).toBe(false);
    expect(JSON.stringify(espia.mock.calls)).not.toContain('secreto-confidencial');
    expect(JSON.stringify(espia.mock.calls)).toContain('archivos subidos');
    espia.mockRestore();
  });
});

function binario(res: request.Response, cb: (err: Error | null, cuerpo: Buffer) => void): void {
  const flujo = res as unknown as NodeJS.ReadableStream;
  const partes: Buffer[] = [];
  flujo.on('data', (p: Buffer) => partes.push(p));
  flujo.on('end', () => cb(null, Buffer.concat(partes)));
}

describe('servicio: asociarArchivos y consultas', () => {
  it('asocia pendientes propios al ticket (y al mensaje)', async () => {
    const u = await crearUsuario();
    const ticket = await crearTicket();
    const f1 = await crearArchivoPendiente(u.id);
    const f2 = await crearArchivoPendiente(u.id);
    await enTransaccion((tx) =>
      asociarArchivos(tx, [f1.id, f2.id, f1.id], { entidad: 'ticket', entidad_id: ticket.id }, u),
    );
    const filas = await dataSource.manager.find(Archivo, { order: { id: 'ASC' } });
    expect(filas.map((f) => [f.entidad, f.entidad_id, f.mensaje_id])).toEqual([
      ['ticket', ticket.id, null],
      ['ticket', ticket.id, null],
    ]);
  });

  it('3. ajeno, inexistente o ya asociado → 400 VALIDACION { archivo_ids } y nada cambia', async () => {
    const u = await crearUsuario();
    const otro = await crearUsuario();
    const ticket = await crearTicket();
    const propio = await crearArchivoPendiente(u.id);
    const ajeno = await crearArchivoPendiente(otro.id);
    const asociado = await crearArchivoPendiente(u.id);
    await asociar(asociado.id, ticket.id);
    for (const ids of [
      [propio.id, ajeno.id],
      [propio.id, 99999],
      [propio.id, asociado.id],
    ]) {
      await expect(
        enTransaccion((tx) =>
          asociarArchivos(tx, ids, { entidad: 'ticket', entidad_id: ticket.id }, u),
        ),
      ).rejects.toMatchObject({
        codigo: 'VALIDACION',
        detalles: { archivo_ids: ['Archivo no disponible'] },
      });
    }
    expect(
      (await dataSource.manager.findOneByOrFail(Archivo, { id: propio.id })).entidad,
    ).toBeNull();
  });

  it('archivosDe excluye los de mensajes, el original del correo y los extraídos; archivosDeMensajes agrupa', async () => {
    const u = await crearUsuario();
    const ticket = await crearTicket();
    const dueno = { entidad: 'ticket' as const, entidad_id: ticket.id };
    const suelto = await crearArchivoPendiente(u.id, { nombre: 'suelto.txt' });
    const original = await crearArchivoPendiente(u.id, { nombre: 'original.eml' });
    const extraido = await crearArchivoPendiente(u.id, { nombre: 'extraido.txt' });
    const deMensaje = await crearArchivoPendiente(u.id, { nombre: 'mensaje.txt' });
    const [mensaje] = await dataSource.query(
      `INSERT INTO mensaje (ticket_id, tipo, autor_id, texto) VALUES ($1, 'seguimiento', $2, 'x') RETURNING id`,
      [ticket.id, u.id],
    );
    const [correo] = await dataSource.query(
      `INSERT INTO correo_adjunto (ticket_id, archivo_id, origen) VALUES ($1, $2, 'eml') RETURNING id`,
      [ticket.id, original.id],
    );
    await dataSource.manager.update(Archivo, { id: suelto.id }, dueno);
    await dataSource.manager.update(Archivo, { id: original.id }, dueno);
    await dataSource.manager.update(
      Archivo,
      { id: extraido.id },
      { ...dueno, origen_correo_id: correo.id },
    );
    await dataSource.manager.update(
      Archivo,
      { id: deMensaje.id },
      { ...dueno, mensaje_id: mensaje.id },
    );

    const propios = await archivosDe(dataSource.manager, 'ticket', ticket.id);
    expect(propios.map((a) => a.nombre_original)).toEqual(['suelto.txt']);
    const porMensaje = await archivosDeMensajes(dataSource.manager, [mensaje.id, 12345]);
    expect([...porMensaje.keys()]).toEqual([mensaje.id]);
    expect(porMensaje.get(mensaje.id)![0]).toMatchObject({
      nombre_original: 'mensaje.txt',
      subido_por: { id: u.id },
    });
    expect((await archivosDeMensajes(dataSource.manager, [])).size).toBe(0);
  });

  it('F3: asociarArchivos acepta entidad ot; archivosDe(ot) no aplica el filtro de correo y excluye mensajes', async () => {
    const u = await crearUsuario();
    const ticket = await crearTicket();
    const ot = await crearOt(ticket.id);
    const f1 = await crearArchivoPendiente(u.id, { nombre: 'uno.txt' });
    const f2 = await crearArchivoPendiente(u.id, { nombre: 'dos.txt' });
    await enTransaccion((tx) =>
      asociarArchivos(tx, [f1.id, f2.id], { entidad: 'ot', entidad_id: ot.id }, u),
    );
    const [mensaje] = await dataSource.query(
      `INSERT INTO mensaje (ot_id, tipo, autor_id, texto) VALUES ($1, 'seguimiento', $2, 'x') RETURNING id`,
      [ot.id, u.id],
    );
    await dataSource.manager.update(Archivo, { id: f2.id }, { mensaje_id: mensaje.id });
    const propios = await archivosDe(dataSource.manager, 'ot', ot.id);
    expect(propios.map((a) => a.nombre_original)).toEqual(['uno.txt']);
    expect(await archivosDe(dataSource.manager, 'ticket', ticket.id)).toEqual([]);
  });

  it('sanearNombre quita caracteres invisibles y acota a 255 conservando la extensión', () => {
    expect(sanearNombre('factura‮fdp.exe')).toBe('facturafdp.exe');
    expect(sanearNombre('a b⁦c.pdf')).toBe('abc.pdf');
    expect(sanearNombre('‮')).toBe('archivo');
    const largo = sanearNombre(`${'x'.repeat(1000)}.pdf`);
    expect(largo).toHaveLength(255);
    expect(largo.endsWith('.pdf')).toBe(true);
  });

  it('un adjunto de correo con nombre largo o invisible se guarda saneado', async () => {
    const u = await crearUsuario();
    const ok = await enTransaccion((tx) =>
      guardarBufferComoArchivo(tx, {
        contenido: archivoDePrueba('foto.jpg'),
        nombre_original: `‮${'y'.repeat(400)}.jpg`,
        subido_por: u.id,
      }),
    );
    expect(ok.nombre_original).toHaveLength(255);
    expect(ok.nombre_original).not.toContain('‮');
  });

  it('guardarBufferComoArchivo valida el contenido real y guarda con origen_correo_id', async () => {
    const u = await crearUsuario();
    const ticket = await crearTicket();
    const [correo] = await dataSource.query(
      `INSERT INTO correo_adjunto (ticket_id, origen) VALUES ($1, 'eml') RETURNING id`,
      [ticket.id],
    );
    const ok = await enTransaccion((tx) =>
      guardarBufferComoArchivo(tx, {
        contenido: archivoDePrueba('foto.jpg'),
        nombre_original: 'captura.jpg',
        subido_por: u.id,
        destino: { entidad: 'ticket', entidad_id: ticket.id },
        origen_correo_id: correo.id,
      }),
    );
    expect(ok).toMatchObject({
      categoria: 'foto',
      tipo_mime: 'image/jpeg',
      entidad_id: ticket.id,
      origen_correo_id: correo.id,
    });
    expect(await storage.existe(ok.clave)).toBe(true);
    await expect(
      enTransaccion((tx) =>
        guardarBufferComoArchivo(tx, {
          contenido: archivoDePrueba('no-es-imagen.png'),
          nombre_original: 'falso.png',
          subido_por: u.id,
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'ARCHIVO_NO_PERMITIDO', detalles: { nombre: 'falso.png' } });
  });
});
