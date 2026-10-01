import { formatearCLP, formatearFecha, formatearMonto } from '@zydesk/shared';
import PdfPrinter from 'pdfmake';
import vfs from 'pdfmake/build/vfs_fonts.js';
import type { Content, ContentTable, TDocumentDefinitions } from 'pdfmake/interfaces.js';
import type { CotizacionSalidaDatos } from '../../modulos/cotizaciones/cotizaciones.tipos.js';
import type { MarcaDocumento } from '../documentos.js';

// Roboto (Apache 2.0) viene incluida en pdfmake (spec fase 4 §18.9): se carga como Buffer, sin disco.
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

const GRIS = '#666666';
const ROJO = '#b3261e';

// AAAA-MM-DD → "29 sep 2026" (mediodía UTC para que la zona no cambie el día)
const fecha = (f: string): string => formatearFecha(new Date(`${f}T12:00:00Z`));

const pct = (n: number): string => String(n).replace('.', ',');

function datos(rotulo: string, valor: string): Content {
  return { text: [{ text: `${rotulo}: `, color: GRIS }, valor], margin: [0, 1, 0, 1] };
}

// PDF de la cotización (spec fase 4 §7.2). Nunca incluye `nota_interna`. El logo solo si es PNG o JPEG.
export function generarPdf(cot: CotizacionSalidaDatos, marca: MarcaDocumento): Promise<Buffer> {
  const monto = (n: number): string => formatearMonto(n, cot.moneda);
  const titulo = `Cotización ${cot.codigo} v${cot.version}`;
  const logo =
    marca.logo && (marca.logo.tipo_mime === 'image/png' || marca.logo.tipo_mime === 'image/jpeg')
      ? `data:${marca.logo.tipo_mime};base64,${marca.logo.datos.toString('base64')}`
      : null;

  const encabezado: Content[] = [];
  if (logo) encabezado.push({ image: logo, width: 120, margin: [0, 0, 0, 6] });
  encabezado.push({ text: marca.nombre_app, fontSize: 14, bold: true });
  encabezado.push({
    text: cot.estado === 'borrador' ? [{ text: 'BORRADOR · ', color: ROJO }, titulo] : titulo,
    fontSize: 16,
    bold: true,
    margin: [0, 10, 0, 8],
  });

  const contacto = cot.contacto
    ? [cot.contacto.nombre, cot.contacto.correo].filter(Boolean).join(' · ')
    : '';
  const bloqueDatos: Content = {
    columns: [
      [
        datos('Fecha de emisión', fecha(cot.fecha_emision)),
        datos('Válida hasta', fecha(cot.vence_el)),
        datos('Cliente', cot.cliente?.nombre ?? ''),
        datos('Contacto', contacto),
      ],
      [
        datos('Orden de trabajo', `${cot.ot.codigo} · ${cot.ot.titulo}`),
        datos('Ticket', cot.ot.ticket.codigo),
      ],
    ],
    columnGap: 16,
    margin: [0, 0, 0, 12],
  };

  const cab = (texto: string, alineacion: 'left' | 'right' | 'center' = 'left') => ({
    text: texto,
    bold: true,
    fillColor: '#eeeeee',
    alignment: alineacion,
  });
  const tabla: ContentTable = {
    table: {
      headerRows: 1,
      widths: [22, '*', 38, 24, 64, 40, 70],
      body: [
        [
          cab('N°', 'center'),
          cab('Descripción'),
          cab('Cant.', 'right'),
          cab('Un.', 'center'),
          cab('P. unitario', 'right'),
          cab('Desc.', 'right'),
          cab('Total', 'right'),
        ],
        ...cot.lineas.map((l) => [
          { text: String(l.orden), alignment: 'center' as const },
          {
            stack: [
              { text: String(l.descripcion) },
              { text: l.tipo.replaceAll('_', ' '), color: GRIS, fontSize: 8 },
            ],
          },
          { text: String(l.cantidad).replace('.', ','), alignment: 'right' as const },
          { text: l.unidad, alignment: 'center' as const },
          { text: monto(l.precio_unitario), alignment: 'right' as const },
          {
            text: l.descuento_pct > 0 ? `${pct(l.descuento_pct)} %` : '',
            alignment: 'right' as const,
          },
          { text: monto(l.total), alignment: 'right' as const },
        ]),
      ],
    },
    layout: 'lightHorizontalLines',
  };

  const t = cot.totales;
  const fila = (rotulo: string, valor: string, negrita = false) => [
    { text: rotulo, bold: negrita, alignment: 'right' as const },
    { text: valor, bold: negrita, alignment: 'right' as const },
  ];
  const totales: Content = {
    columns: [
      { width: '*', text: '' },
      {
        width: 230,
        table: {
          widths: ['*', 90],
          body: [
            fila('Subtotal', monto(t.subtotal)),
            fila('Descuentos', t.descuentos > 0 ? `−${monto(t.descuentos)}` : monto(0)),
            fila('Neto', monto(t.neto)),
            cot.aplica_iva
              ? fila(`IVA ${pct(cot.iva_pct)} %`, monto(t.iva))
              : fila('Exento de IVA', ''),
            fila('Total', monto(t.total), true),
          ],
        },
        layout: 'noBorders',
      },
    ],
    margin: [0, 10, 0, 6],
  };

  const contenido: Content[] = [...encabezado, bloqueDatos, tabla, totales];
  if (cot.moneda === 'UF' && cot.total_clp !== null) {
    contenido.push({
      text: `Equivale a ${formatearCLP(cot.total_clp)} al valor UF del ${fecha(cot.fecha_emision)}`,
      alignment: 'right',
      color: GRIS,
      fontSize: 8,
      margin: [0, 0, 0, 6],
    });
  }
  if (cot.condiciones) {
    contenido.push(
      { text: 'Condiciones comerciales', bold: true, margin: [0, 12, 0, 4] },
      { text: String(cot.condiciones) },
    );
  }

  const definicion: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: titulo, author: marca.nombre_app },
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    content: contenido,
    footer: {
      text: `Generado con ${marca.nombre_app} · ${formatearFecha(new Date())}`,
      alignment: 'center',
      color: GRIS,
      fontSize: 8,
      margin: [0, 16, 0, 0],
    },
  };

  return new Promise<Buffer>((resolver, rechazar) => {
    const doc = obtenerImpresora().createPdfKitDocument(definicion);
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);
    doc.end();
  });
}
