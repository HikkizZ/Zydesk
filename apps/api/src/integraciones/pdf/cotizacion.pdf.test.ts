import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cotizacionDePrueba } from '../../../test/cotizacion-salida.js';
import { generarPdf } from './cotizacion.pdf.js';

const marca = { nombre_app: 'Zydesk' };

// Unión del PDF crudo y de cada stream `FlateDecode` descomprimido (en latin1, byte a byte).
function contenidoPlano(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const partes = [crudo];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(crudo))) {
    const inicio = m.index + m[0].length;
    const fin = crudo.indexOf('endstream', inicio);
    if (fin < 0) break;
    try {
      partes.push(zlib.inflateSync(pdf.subarray(inicio, fin)).toString('latin1'));
    } catch {
      // stream que no está comprimido con Flate
    }
  }
  return partes.join('\n');
}

// `/Title` apunta a un objeto indirecto con la cadena en hexadecimal o literal, a veces en UTF-16BE (tildes).
function titulo(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const ref = /\/Title (\d+) 0 R/.exec(crudo);
  if (!ref) return '';
  const obj = new RegExp(`\\n${ref[1]} 0 obj\\n([\\s\\S]*?)\\nendobj`).exec(crudo)?.[1] ?? '';
  const bytes = obj.startsWith('<')
    ? Buffer.from(obj.slice(1, obj.indexOf('>')), 'hex')
    : Buffer.from(obj.slice(1, obj.lastIndexOf(')')), 'latin1');
  return bytes[0] === 0xfe && bytes[1] === 0xff
    ? Buffer.from(bytes.subarray(2)).swap16().toString('utf16le')
    : bytes.toString('latin1');
}

describe('generarPdf (prueba 17)', () => {
  it('empieza por %PDF-, pesa más de 1 KB y el título incluye el código y la versión', async () => {
    const pdf = await generarPdf(cotizacionDePrueba(), marca);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1024);
    expect(titulo(pdf)).toContain('COT-0218 v1');
  });

  it('no contiene la nota interna ni cruda ni en los streams descomprimidos', async () => {
    const pdf = await generarPdf(
      cotizacionDePrueba({ nota_interna: 'NOTA-INTERNA-SECRETA-XYZ' }),
      marca,
    );
    expect(contenidoPlano(pdf)).not.toContain('NOTA-INTERNA-SECRETA-XYZ');
  });

  it('genera borradores, UF, sin IVA, sin líneas y con descripciones raras sin fallar', async () => {
    const casos = [
      cotizacionDePrueba({ estado: 'borrador' }),
      cotizacionDePrueba({ moneda: 'UF', valor_uf: 38000.5 }),
      cotizacionDePrueba({ aplica_iva: false, condiciones: null }),
      cotizacionDePrueba({ lineas: [], contacto: null, cliente: null }),
      cotizacionDePrueba({
        lineas: [
          {
            tipo: 'servicio',
            descripcion: '=1+1 <img src=x onerror=alert(1)> ñandú — “comillas”',
            cantidad: 1.5,
            unidad: 'un',
            precio_unitario: 1000,
            descuento_pct: 12.5,
          },
        ],
      }),
    ];
    for (const caso of casos) {
      const pdf = await generarPdf(caso, marca);
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });

  it('el logo PNG se incrusta; un logo SVG se omite', async () => {
    // PNG de 1×1 píxel
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const sin = await generarPdf(cotizacionDePrueba(), marca);
    const con = await generarPdf(cotizacionDePrueba(), {
      ...marca,
      logo: { tipo_mime: 'image/png', datos: png },
    });
    expect(con.length).toBeGreaterThan(sin.length);
    const svg = await generarPdf(cotizacionDePrueba(), {
      ...marca,
      logo: {
        tipo_mime: 'image/svg+xml',
        datos: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      },
    });
    expect(svg.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
