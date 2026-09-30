import { describe, expect, it } from 'vitest';
import {
  archivoDePrueba,
  crearArchivoPendiente,
  crearUsuario,
  ingresarComo,
} from '../../../test/fabricas.js';
import { crearApp } from '../../app.js';
import { dataSource } from '../../config/db.js';

const app = () => crearApp({ comprobarBd: async () => true });

async function como(rol: 'admin' | 'coordinacion' | 'tecnico' | 'lectura' = 'tecnico') {
  const usuario = await crearUsuario({ rol });
  return { usuario, ...(await ingresarComo(app(), usuario)) };
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  asunto: 'Error al emitir facturas desde el ERP',
  descripcion: null,
  cliente_id: null,
  solicitante_nombre: null,
  solicitante_correo: null,
  origen: 'externo',
  prioridad: 'media',
  categoria_id: null,
  inicio_planificado: null,
  fecha_limite: null,
  horas_estimadas: null,
  ...extra,
});

const eml = (usuario_id: number, nombre = 'correo.eml', archivo = 'correo.eml') =>
  crearArchivoPendiente(usuario_id, {
    nombre,
    tipo_mime: 'message/rfc822',
    contenido: archivoDePrueba(archivo),
  });

const cuentas = async () => ({
  tickets: (await dataSource.query(`SELECT count(*)::int AS n FROM ticket`))[0].n as number,
  archivos: (await dataSource.query(`SELECT count(*)::int AS n FROM archivo`))[0].n as number,
  correos: (await dataSource.query(`SELECT count(*)::int AS n FROM correo_adjunto`))[0].n as number,
});

describe('crear ticket con correo (F2-T9)', () => {
  it('desde correo.eml con el adjunto seleccionado: correo_adjunto, original asociado y adjunto extraído', async () => {
    const { agente, usuario } = await como();
    const pendiente = await eml(usuario.id);
    const r = await agente
      .post('/api/tickets')
      .send(entrada({ correo: { archivo_id: pendiente.id, adjuntos_indices: [0] } }));
    expect(r.status).toBe(201);
    expect(r.body.tiene_correo).toBe(true);
    expect(r.body.correo).toMatchObject({
      origen: 'eml',
      asunto: 'Error al emitir facturas desde el ERP',
      archivo: { id: pendiente.id, nombre_original: 'correo.eml', categoria: 'correo' },
    });
    expect(r.body.correo.de).toContain('Paula Herrera');
    expect(r.body.correo.cuerpo.length).toBeGreaterThan(0);
    expect(r.body.correo.adjuntos).toHaveLength(1);
    expect(r.body.correo.adjuntos[0]).toMatchObject({
      nombre_original: 'captura.png',
      tipo_mime: 'image/png',
      origen_correo: true,
      categoria: 'foto',
    });
    // ni el original ni el extraído se repiten entre los archivos propios del ticket
    expect(r.body.archivos).toEqual([]);

    const filas = await dataSource.query(
      `SELECT id, entidad, entidad_id, origen_correo_id FROM archivo ORDER BY id`,
    );
    expect(filas).toHaveLength(2);
    for (const f of filas) expect(f).toMatchObject({ entidad: 'ticket', entidad_id: r.body.id });
    const [ca] = await dataSource.query(`SELECT id, archivo_id FROM correo_adjunto`);
    expect(ca.archivo_id).toBe(pendiente.id);
    expect(filas.find((f: { id: number }) => f.id !== pendiente.id).origen_correo_id).toBe(ca.id);

    const [ev] = await dataSource.query(
      `SELECT datos FROM evento WHERE entidad = 'ticket' AND entidad_id = $1 AND accion = 'creado'`,
      [String(r.body.id)],
    );
    expect(ev.datos).toEqual({ desde_correo: true, adjuntos_extraidos: 1, codigo: r.body.codigo });

    // el detalle devuelve lo mismo y el original se descarga
    const detalle = await agente.get(`/api/tickets/${r.body.id}`);
    expect(detalle.body.correo.adjuntos).toHaveLength(1);
    expect((await agente.get(detalle.body.correo.archivo.url)).status).toBe(200);
  });

  it('sin adjuntos seleccionados no extrae nada', async () => {
    const { agente, usuario } = await como();
    const pendiente = await eml(usuario.id);
    const r = await agente
      .post('/api/tickets')
      .send(entrada({ correo: { archivo_id: pendiente.id, adjuntos_indices: [] } }));
    expect(r.status).toBe(201);
    expect(r.body.correo.adjuntos).toEqual([]);
    expect((await cuentas()).archivos).toBe(1);
    const [ev] = await dataSource.query(`SELECT datos FROM evento WHERE accion = 'creado'`);
    expect(ev.datos).toMatchObject({ desde_correo: true, adjuntos_extraidos: 0 });
  });

  it('desde texto pegado: guarda correo-pegado.txt (categoría correo) descargable', async () => {
    const { agente } = await como();
    const texto = archivoDePrueba('correo.txt').toString('utf8');
    const r = await agente.post('/api/tickets').send(entrada({ correo: { texto } }));
    expect(r.status).toBe(201);
    expect(r.body.correo).toMatchObject({
      origen: 'texto',
      archivo: {
        nombre_original: 'correo-pegado.txt',
        tipo_mime: 'text/plain',
        categoria: 'correo',
      },
      adjuntos: [],
    });
    expect(r.body.correo.asunto).not.toBeNull();
    const [a] = await dataSource.query(
      `SELECT entidad, entidad_id, subido_por, categoria FROM archivo`,
    );
    expect(a).toMatchObject({ entidad: 'ticket', entidad_id: r.body.id, categoria: 'correo' });
    const descarga = await agente
      .get(r.body.correo.archivo.url)
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (d: Buffer) => partes.push(d));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(descarga.status).toBe(200);
    expect((descarga.body as Buffer).toString('utf8')).toBe(texto.trim());
    const [ev] = await dataSource.query(`SELECT datos FROM evento WHERE accion = 'creado'`);
    expect(ev.datos).toMatchObject({ desde_correo: true, adjuntos_extraidos: 0 });
  });

  it('un adjunto no permitido revierte toda la creación (ticket, número, archivos y correo)', async () => {
    const { agente, usuario } = await como();
    const mime =
      'From: a@ejemplo.test\r\nTo: b@ejemplo.test\r\nSubject: Con ejecutable\r\nMIME-Version: 1.0\r\n' +
      'Content-Type: multipart/mixed; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nHola\r\n' +
      '--x\r\nContent-Type: application/octet-stream; name="virus.exe"\r\n' +
      'Content-Disposition: attachment; filename="virus.exe"\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
      `${Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff').toString('base64')}\r\n--x--\r\n`;
    const pendiente = await crearArchivoPendiente(usuario.id, {
      nombre: 'malo.eml',
      tipo_mime: 'message/rfc822',
      contenido: Buffer.from(mime),
    });
    const antes = await cuentas();
    const r = await agente
      .post('/api/tickets')
      .send(entrada({ correo: { archivo_id: pendiente.id, adjuntos_indices: [0] } }));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('ARCHIVO_NO_PERMITIDO');
    expect(r.body.error.detalles).toEqual({ nombre: 'virus.exe' });
    expect(await cuentas()).toEqual(antes);
    const [a] = await dataSource.query(`SELECT entidad FROM archivo WHERE id = $1`, [pendiente.id]);
    expect(a.entidad).toBeNull(); // sigue pendiente
    // el número no se consumió
    const ok = await agente.post('/api/tickets').send(entrada());
    expect(ok.body.codigo).toBe('TK-1000');
  });

  it('archivo de correo ajeno, que no es correo o que no existe → 400 VALIDACION sin crear nada', async () => {
    const { agente, usuario } = await como();
    const otro = await crearUsuario();
    const ajeno = await eml(otro.id);
    const pdf = await crearArchivoPendiente(usuario.id, {
      nombre: 'doc.pdf',
      tipo_mime: 'application/pdf',
      contenido: archivoDePrueba('doc.pdf'),
    });
    const antes = await cuentas();
    for (const archivo_id of [ajeno.id, pdf.id, 999999]) {
      const r = await agente
        .post('/api/tickets')
        .send(entrada({ correo: { archivo_id, adjuntos_indices: [] } }));
      expect(r.status, String(archivo_id)).toBe(400);
      expect(r.body.error.codigo).toBe('VALIDACION');
      expect(r.body.error.detalles).toHaveProperty('correo');
    }
    expect(await cuentas()).toEqual(antes);
  });

  it('índice de adjunto inexistente → 400 VALIDACION', async () => {
    const { agente, usuario } = await como();
    const pendiente = await eml(usuario.id);
    const r = await agente
      .post('/api/tickets')
      .send(entrada({ correo: { archivo_id: pendiente.id, adjuntos_indices: [7] } }));
    expect(r.status).toBe(400);
    expect(r.body.error.detalles).toHaveProperty('correo');
    expect((await cuentas()).tickets).toBe(0);
  });
});

describe('crear ticket con archivo_ids (prueba 3)', () => {
  it('asocia los pendientes propios: salen en archivos del ticket y dejan de ser pendientes', async () => {
    const { agente, usuario } = await como();
    const foto = await crearArchivoPendiente(usuario.id, {
      nombre: 'foto.jpg',
      tipo_mime: 'image/jpeg',
      contenido: archivoDePrueba('foto.jpg'),
    });
    const r = await agente.post('/api/tickets').send(entrada({ archivo_ids: [foto.id] }));
    expect(r.status).toBe(201);
    expect(r.body.archivos).toMatchObject([
      { id: foto.id, nombre_original: 'foto.jpg', es_imagen: true, categoria: 'foto' },
    ]);
    expect((await agente.get('/api/archivos/pendientes')).body).toEqual([]);
    // un archivo ya asociado no puede usarse en otro ticket
    const otra = await agente.post('/api/tickets').send(entrada({ archivo_ids: [foto.id] }));
    expect(otra.status).toBe(400);
  });

  it('archivo_ids de otro usuario → 400 VALIDACION y no se crea el ticket', async () => {
    const { agente } = await como();
    const otro = await crearUsuario();
    const ajeno = await crearArchivoPendiente(otro.id);
    const r = await agente.post('/api/tickets').send(entrada({ archivo_ids: [ajeno.id] }));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('VALIDACION');
    expect(r.body.error.detalles).toHaveProperty('archivo_ids');
    expect((await cuentas()).tickets).toBe(0);
    const [a] = await dataSource.query(`SELECT entidad FROM archivo WHERE id = $1`, [ajeno.id]);
    expect(a.entidad).toBeNull();
  });
});
