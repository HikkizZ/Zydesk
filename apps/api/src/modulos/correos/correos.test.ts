import { describe, expect, it } from 'vitest';
import {
  archivoDePrueba,
  crearArchivoPendiente,
  crearTicket,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';
import { Archivo } from '../archivos/archivo.entity.js';

const app = () => crearApp({ comprobarBd: async () => true });

const sesion = async (rol: 'tecnico' | 'lectura' = 'tecnico') => {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
};

describe('POST /api/correos/parsear', () => {
  it('con archivo_id (.eml subido por la API): cabeceras, cuerpo, adjuntos y solicitante; no persiste nada', async () => {
    const { agente } = await sesion();
    const subida = await agente
      .post('/api/archivos')
      .attach('archivos', archivoDePrueba('correo.eml'), 'correo.eml');
    expect(subida.body[0].categoria).toBe('correo');
    const antes = await dataSource.manager.count(Archivo);

    const res = await agente.post('/api/correos/parsear').send({ archivo_id: subida.body[0].id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      origen: 'eml',
      de: 'Paula Herrera <pherrera@ejemplo.test>',
      fecha: '2026-09-29T19:45:00.000Z',
      asunto: 'Error al emitir facturas desde el ERP',
      solicitante_sugerido: { nombre: 'Paula Herrera', correo: 'pherrera@ejemplo.test' },
    });
    expect(res.body.para).toContain('soporte@zydesk.test');
    expect(res.body.cuerpo_texto).toContain('el ERP muestra un error');
    expect(res.body.adjuntos).toEqual([
      {
        indice: 0,
        nombre: 'captura.png',
        tamano: expect.any(Number),
        tipo_mime: 'image/png',
        permitido: true,
      },
    ]);
    expect(await dataSource.manager.count(Archivo)).toBe(antes);
    const [c] = await dataSource.query(`SELECT count(*)::int AS n FROM correo_adjunto`);
    expect(c.n).toBe(0);
  });

  it('con texto: heurística De/Para/Enviado/Asunto (fecha en español → null)', async () => {
    const { agente } = await sesion();
    const res = await agente
      .post('/api/correos/parsear')
      .send({ texto: archivoDePrueba('correo.txt').toString('utf8') });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      origen: 'texto',
      de: 'Paula Herrera <pherrera@ejemplo.test>',
      asunto: 'Error al emitir facturas desde el ERP',
      fecha: null,
      adjuntos: [],
      solicitante_sugerido: { nombre: 'Paula Herrera', correo: 'pherrera@ejemplo.test' },
    });
    expect(res.body.cuerpo_texto.startsWith('Hola equipo')).toBe(true);
  });

  it('archivo_id que no es un pendiente propio de categoría correo → 404', async () => {
    const a = await sesion();
    const b = await sesion();
    const eml = await crearArchivoPendiente(a.usuario.id, {
      tipo_mime: 'message/rfc822',
      contenido: archivoDePrueba('correo.eml'),
    });
    const foto = await crearArchivoPendiente(a.usuario.id, {
      tipo_mime: 'image/jpeg',
      contenido: archivoDePrueba('foto.jpg'),
    });
    const asociado = await crearArchivoPendiente(a.usuario.id, {
      tipo_mime: 'message/rfc822',
      contenido: archivoDePrueba('correo.eml'),
    });
    await dataSource.manager.update(
      Archivo,
      { id: asociado.id },
      { entidad: 'ticket', entidad_id: (await crearTicket()).id },
    );
    for (const id of [eml.id, foto.id, asociado.id, 99999]) {
      const quien = id === eml.id ? b : a;
      expect(
        (await quien.agente.post('/api/correos/parsear').send({ archivo_id: id })).status,
      ).toBe(404);
    }
    expect((await a.agente.post('/api/correos/parsear').send({ archivo_id: eml.id })).status).toBe(
      200,
    );
  });

  it('un .eml corrupto → 400 CORREO_ILEGIBLE', async () => {
    const { agente } = await sesion();
    const subida = await agente
      .post('/api/archivos')
      .attach('archivos', Buffer.from('esto no es un correo\nsolo texto'), 'corrupto.eml');
    expect(subida.status).toBe(201);
    const res = await agente.post('/api/correos/parsear').send({ archivo_id: subida.body[0].id });
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('CORREO_ILEGIBLE');
    expect(res.body.error.mensaje).toBe('No se pudo leer el correo; pega el texto');
  });

  it('6. correo HTML con <script>: cuerpo_texto sin etiquetas', async () => {
    const { usuario, agente } = await sesion();
    const eml = [
      'From: Mala <mala@ejemplo.test>',
      'Subject: Hola',
      'Content-Type: text/html; charset="utf-8"',
      '',
      '<p onclick="x()">Hola <b>equipo</b></p><script>alert(1)</script><img src=x onerror=alert(2)>',
    ].join('\r\n');
    const f = await crearArchivoPendiente(usuario.id, {
      tipo_mime: 'message/rfc822',
      contenido: Buffer.from(eml),
    });
    const res = await agente.post('/api/correos/parsear').send({ archivo_id: f.id });
    expect(res.status).toBe(200);
    expect(res.body.cuerpo_texto).toContain('Hola');
    expect(res.body.cuerpo_texto).not.toMatch(/<|onclick|onerror/);
  });

  it('marca como no permitido un adjunto con extensión fuera de la lista', async () => {
    const { usuario, agente } = await sesion();
    const eml = [
      'From: X <x@ejemplo.test>',
      'Subject: Adjunto raro',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="b"',
      '',
      '--b',
      'Content-Type: text/plain',
      '',
      'Hola',
      '--b',
      'Content-Type: application/octet-stream',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="instalador.exe"',
      '',
      'TVqQAAMAAAAEAAAA',
      '--b--',
      '',
    ].join('\r\n');
    const f = await crearArchivoPendiente(usuario.id, {
      tipo_mime: 'message/rfc822',
      contenido: Buffer.from(eml),
    });
    const res = await agente.post('/api/correos/parsear').send({ archivo_id: f.id });
    expect(res.body.adjuntos).toMatchObject([{ nombre: 'instalador.exe', permitido: false }]);
  });

  it('entrada inválida → 400 VALIDACION; lectura → 403; sin sesión → 401', async () => {
    const { agente } = await sesion();
    expect((await agente.post('/api/correos/parsear').send({})).body.error.codigo).toBe(
      'VALIDACION',
    );
    expect((await agente.post('/api/correos/parsear').send({ texto: '   ' })).status).toBe(400);
    expect(
      (await agente.post('/api/correos/parsear').send({ texto: 'a'.repeat(200_001) })).status,
    ).toBe(400);
    const lector = await sesion('lectura');
    expect((await lector.agente.post('/api/correos/parsear').send({ texto: 'hola' })).status).toBe(
      403,
    );
  });
});
