import { describe, expect, it } from 'vitest';
import {
  cabeceraMiDia,
  escaparHtml,
  fechaLargaDeIso,
  formatearMiDia,
  type DatosMiDia,
} from './formato-mi-dia.js';

const vacio: DatosMiDia = {
  fecha: '2026-10-02',
  vencen_hoy: [],
  vencidos: [],
  por_aprobar: [],
  tareas: [],
  conteos: { vencen_hoy: 0, vencidos: 0, por_aprobar: 0, menciones: 0, tareas: 0 },
};
const opciones = { url: 'https://desk.test/mi-dia' };

describe('escaparHtml', () => {
  it('escapa &, <, > y comillas', () => {
    expect(escaparHtml('<img src="x"> & co')).toBe('&lt;img src=&quot;x&quot;&gt; &amp; co');
  });
});

describe('fechaLargaDeIso', () => {
  it.each([
    ['2026-10-02', 'viernes 2 de octubre'],
    ['2026-10-01', 'jueves 1 de octubre'],
    ['2027-01-31', 'domingo 31 de enero'],
  ])('%s', (iso, esperado) => expect(fechaLargaDeIso(iso)).toBe(esperado));
});

describe('formatearMiDia', () => {
  it('sin nada pendiente devuelve null', () => {
    expect(formatearMiDia(vacio, opciones)).toBeNull();
  });

  it('cabecera', () => {
    expect(cabeceraMiDia('2026-10-02')).toBe('<b>Zydesk · Mi día</b> — viernes 2 de octubre');
  });

  it('el formato aprobado, con secciones separadas por una línea en blanco', () => {
    const texto = formatearMiDia(
      {
        ...vacio,
        vencen_hoy: [{ codigo: 'TK-1048', asunto: 'Error al emitir facturas desde el ERP' }],
        tareas: [
          { titulo: 'Cargar CAF y probar emisión en QA', destino: { codigo: 'TK-1048' } },
          { titulo: 'Carga de nuevo CAF y pruebas en QA', destino: { codigo: 'OT-0218' } },
          { titulo: 'Paso a producción y acompañamiento', destino: { codigo: 'OT-0218' } },
        ],
        conteos: { ...vacio.conteos, vencen_hoy: 1, menciones: 1, tareas: 3 },
      },
      opciones,
    );
    expect(texto).toBe(
      [
        '<b>Zydesk · Mi día</b> — viernes 2 de octubre',
        '',
        '<b>Vencen hoy (1)</b>',
        '• TK-1048 · Error al emitir facturas desde el ERP',
        '',
        '<b>Menciones sin leer:</b> 1',
        '',
        '<b>Tareas para hoy (3)</b>',
        '• Cargar CAF y probar emisión en QA · TK-1048',
        '• Carga de nuevo CAF y pruebas en QA · OT-0218',
        '• Paso a producción y acompañamiento · OT-0218',
        '',
        '<a href="https://desk.test/mi-dia">Abrir Mi día</a>',
      ].join('\n'),
    );
  });

  it('Vencidos y Por aprobar con código al inicio; secciones vacías no aparecen', () => {
    const texto = formatearMiDia(
      {
        ...vacio,
        vencidos: [{ codigo: 'TK-1040', asunto: 'Caída de VPN' }],
        por_aprobar: [{ codigo: 'OT-0219', titulo: 'Reemplazo de UPS' }],
        conteos: { ...vacio.conteos, vencidos: 1, por_aprobar: 1 },
      },
      opciones,
    )!;
    expect(texto).toContain('<b>Vencidos (1)</b>\n• TK-1040 · Caída de VPN');
    expect(texto).toContain('<b>Por aprobar (1)</b>\n• OT-0219 · Reemplazo de UPS');
    expect(texto).not.toContain('Vencen hoy');
    expect(texto).not.toContain('Menciones');
    expect(texto).not.toContain('Tareas');
  });

  it('tope de 5 ítems con «y N más», recorta a 60 y escapa HTML', () => {
    const vencen_hoy = Array.from({ length: 5 }, (_, i) => ({
      codigo: `TK-${i}`,
      asunto: i === 0 ? '<b>x</b>'.padEnd(80, 'y') : `Asunto ${i}`,
    }));
    const texto = formatearMiDia(
      { ...vacio, vencen_hoy, conteos: { ...vacio.conteos, vencen_hoy: 7 } },
      opciones,
    )!;
    expect(texto).toContain('<b>Vencen hoy (7)</b>');
    expect(texto.match(/^• /gm)).toHaveLength(5);
    expect(texto).toContain('\ny 2 más\n');
    expect(texto).toContain('• TK-0 · &lt;b&gt;x&lt;/b&gt;yyy');
    expect(texto).not.toContain('<b>x</b>');
    const linea = texto.split('\n').find((l) => l.startsWith('• TK-0'))!;
    expect(linea.endsWith('…')).toBe(true);
  });

  it('escapa la URL del enlace', () => {
    const texto = formatearMiDia(
      { ...vacio, conteos: { ...vacio.conteos, menciones: 2 } },
      { url: 'https://desk.test/mi-dia?a="1"&b=2' },
    )!;
    expect(texto).toContain('<a href="https://desk.test/mi-dia?a=&quot;1&quot;&amp;b=2">');
  });
});
