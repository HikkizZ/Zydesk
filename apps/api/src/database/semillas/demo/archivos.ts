import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PdfPrinter from 'pdfmake';
import vfs from 'pdfmake/build/vfs_fonts.js';
import { categoriaDe } from '../../../integraciones/archivos/mime.js';
import { crearStorage, directorioArchivos } from '../../../integraciones/storage/storage.js';
import { NOMBRE_APP } from './base.js';
import type { Tx } from './util.js';

// Archivos de la demo (spec fase 9 §11.2): fotos y correos de ejemplo versionados en `archivos/` (sin datos
// personales ni EXIF; los marca de agua llevan el código del ticket); los PDF y .xlsx se generan aquí con
// pdfmake y exceljs. Todo se guarda con `StorageLocal` bajo `ARCHIVOS_DIR/demo/aaaa/mm/<uuid>.<ext>`; la `clave`
// de la fila lleva el prefijo `demo/`, así que `--reiniciar` borra la carpeta `demo/` completa.

export const CARPETA_DEMO = 'demo';
const storageDemo = () => crearStorage(path.join(directorioArchivos, CARPETA_DEMO));

// En `dist` esta carpeta debe copiarse junto a los .js (la imagen de la API lo hace); en `tsx` está en `src`.
const DIR_ESTATICOS = fileURLToPath(new URL('./archivos/', import.meta.url));

const TIPOS: Record<string, { mime: string; ext: string }> = {
  '.png': { mime: 'image/png', ext: '.png' },
  '.eml': { mime: 'message/rfc822', ext: '.eml' },
  '.pdf': { mime: 'application/pdf', ext: '.pdf' },
  '.xlsx': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: '.xlsx',
  },
};

export function leerEstatico(nombre: string): Buffer {
  const ruta = path.join(DIR_ESTATICOS, nombre);
  if (!fs.existsSync(ruta)) {
    throw new Error(`Falta el archivo de ejemplo de la demo: ${nombre} (${DIR_ESTATICOS})`);
  }
  return fs.readFileSync(ruta);
}

export interface DatosArchivo {
  contenido: Buffer;
  nombre: string; // nombre original; la extensión decide el tipo
  subido_por: number | null;
  subido_en: Date;
  entidad: 'ticket' | 'ot';
  entidad_id: number;
  mensaje_id?: number | null;
  origen_correo_id?: number | null;
}

// Guarda el contenido en disco e inserta la fila `archivo`; `claves` acumula las claves para deshacer el disco si
// la transacción del llamador se revierte.
export async function guardarArchivo(
  tx: Tx,
  d: DatosArchivo,
  claves: string[],
): Promise<{ id: number; clave: string }> {
  const tipo = TIPOS[path.extname(d.nombre).toLowerCase()];
  if (!tipo) throw new Error(`Tipo de archivo de demo no previsto: ${d.nombre}`);
  const relativa = await storageDemo().guardar(d.contenido, tipo.ext);
  const clave = `${CARPETA_DEMO}/${relativa}`;
  claves.push(clave);
  const [{ id }] = await tx.query(
    `INSERT INTO archivo (entidad, entidad_id, mensaje_id, categoria, nombre_original, tipo_mime, tamano, clave,
                          origen_correo_id, subido_por, subido_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      d.entidad,
      d.entidad_id,
      d.mensaje_id ?? null,
      categoriaDe(tipo.mime),
      d.nombre,
      tipo.mime,
      d.contenido.length,
      clave,
      d.origen_correo_id ?? null,
      d.subido_por,
      d.subido_en,
    ],
  );
  return { id: id as number, clave };
}

export async function eliminarClaves(claves: string[]): Promise<void> {
  const storage = crearStorage(directorioArchivos);
  for (const c of claves) await storage.eliminar(c).catch(() => undefined);
}

// `--reiniciar`: borra los archivos que la semilla creó antes (la carpeta `demo/` completa).
export async function borrarArchivosDemo(): Promise<void> {
  await fs.promises.rm(path.join(directorioArchivos, CARPETA_DEMO), {
    recursive: true,
    force: true,
  });
}

// ---- PDF y .xlsx generados ----

const fuente = (archivo: string): Buffer => Buffer.from(vfs[archivo] ?? '', 'base64');
let impresora: PdfPrinter | undefined;
function obtenerImpresora(): PdfPrinter {
  impresora ??= new PdfPrinter({
    Roboto: {
      normal: fuente('Roboto-Regular.ttf'),
      bold: fuente('Roboto-Medium.ttf'),
      italics: fuente('Roboto-Italic.ttf'),
      bolditalics: fuente('Roboto-MediumItalic.ttf'),
    },
  });
  return impresora;
}

// PDF de una página con datos ficticios («Orden de compra OC-7781», «Aprobación cotización COT-0300»).
export function generarPdfSimple(titulo: string, lineas: string[]): Promise<Buffer> {
  return new Promise<Buffer>((resolver, rechazar) => {
    const doc = obtenerImpresora().createPdfKitDocument({
      info: { title: titulo, author: NOMBRE_APP },
      defaultStyle: { font: 'Roboto', fontSize: 11 },
      pageMargins: [56, 56, 56, 56],
      content: [
        { text: titulo, fontSize: 18, bold: true, margin: [0, 0, 0, 14] },
        ...lineas.map((l) => ({
          text: l,
          margin: [0, 0, 0, 6] as [number, number, number, number],
        })),
        {
          text: 'Documento de ejemplo generado para la demostración de Zydesk. Todos los datos son ficticios.',
          italics: true,
          color: '#666666',
          margin: [0, 24, 0, 0],
        },
      ],
    });
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);
    doc.end();
  });
}

export async function generarXlsxSimple(
  hoja: string,
  columnas: string[],
  filas: (string | number)[][],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = NOMBRE_APP;
  const ws = wb.addWorksheet(hoja);
  ws.addRow(columnas).font = { bold: true };
  for (const f of filas) ws.addRow(f);
  columnas.forEach((_, i) => {
    ws.getColumn(i + 1).width = 24;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
