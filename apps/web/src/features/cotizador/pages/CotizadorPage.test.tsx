import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IndicadorUfSalidaDatos, Rol } from '@zydesk/shared';
import { Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CotizacionSalidaDatos } from '@/features/cotizador/api';
import {
  borradorDePrueba,
  cotizacionDePrueba,
  plantillaDePrueba,
  tarifasDePrueba,
} from '@/test/cotizaciones';
import { respuesta, simularFetch, type Llamada } from '@/test/fetch';
import { otDePrueba } from '@/test/ots';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { CotizadorPage } from './CotizadorPage';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});
afterEach(() => vi.unstubAllGlobals());

const CLIENTE = {
  id: 1,
  nombre: 'Viña Santa Clara',
  es_interno: false,
  activo: true,
  contactos: [
    {
      id: 11,
      cliente_id: 1,
      nombre: 'Paula Herrera',
      area: 'Finanzas',
      correo: null,
      telefono: null,
      aprueba_cotizaciones: true,
      activo: true,
    },
    {
      id: 12,
      cliente_id: 1,
      nombre: 'Jorge Soto',
      area: null,
      correo: null,
      telefono: null,
      aprueba_cotizaciones: false,
      activo: true,
    },
  ],
  bolsa: { vigente: null, historial: [] },
  tarifas: [] as { concepto: string; moneda: 'CLP' | 'UF'; valor: number }[],
};

const UF_DEL_DIA: IndicadorUfSalidaDatos = {
  fecha: '2026-10-05',
  valor: 41098.15,
  fuente: 'boostr',
  obtenido_en: '2026-10-05T11:07:00.000Z',
  hoy: '2026-10-05',
  desactualizado: false,
};

function Ubicacion() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

interface Opciones {
  rol?: Rol;
  cliente?: typeof CLIENTE;
  manejador?: (l: Llamada) => Response | Promise<Response> | undefined;
  otras?: CotizacionSalidaDatos[];
  uf?: IndicadorUfSalidaDatos | null;
  tarifas?: ReturnType<typeof tarifasDePrueba>;
}

function montar(cot: CotizacionSalidaDatos, opciones: Opciones = {}) {
  const cliente = opciones.cliente ?? CLIENTE;
  const todas = [cot, ...(opciones.otras ?? [])];
  const llamadas = simularFetch(
    (l) => opciones.manejador?.(l),
    ({ ruta, metodo }) => {
      if (metodo !== 'GET') return undefined;
      const una = /^\/api\/cotizaciones\/(\d+)$/.exec(ruta);
      if (una) {
        const c = todas.find((x) => x.id === Number(una[1]));
        return c ? respuesta(200, c) : undefined;
      }
      if (ruta === '/api/config/tarifas') {
        return respuesta(200, opciones.tarifas ?? tarifasDePrueba());
      }
      if (ruta === '/api/indicadores/uf') {
        return respuesta(200, opciones.uf === undefined ? UF_DEL_DIA : opciones.uf);
      }
      if (ruta === '/api/config/plantillas-cotizacion') {
        return respuesta(200, [plantillaDePrueba()]);
      }
      if (ruta === '/api/clientes/1') return respuesta(200, cliente);
      if (ruta === '/api/ots/21') {
        return respuesta(200, otDePrueba({ horas: { estimadas: 10, reales: 4, registradas: 3 } }));
      }
      return undefined;
    },
  );
  render(
    <TooltipProvider>
      <ConSesion
        yo={yoDePrueba({ rol: opciones.rol ?? 'tecnico' })}
        ruta={`/cotizaciones/${cot.id}`}
      >
        <Routes>
          <Route path="/cotizaciones/:id" element={<CotizadorPage />} />
          <Route path="/ots/:id" element={<p>Página de la OT</p>} />
        </Routes>
        <Ubicacion />
        <Toaster />
      </ConSesion>
    </TooltipProvider>,
  );
  return llamadas;
}

const totales = () => screen.getByRole('region', { name: 'Totales' });
const guardar = () => screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
const boton = (nombre: string | RegExp) => screen.queryByRole('button', { name: nombre });
const esperarCarga = () => screen.findByRole('heading', { level: 1, name: /COT-0218/ });

it('con las 5 líneas del diseño los totales son 484.000 / -9.000 / 475.000 / 90.250 / 565.250', async () => {
  montar(borradorDePrueba());
  await esperarCarga();
  const t = within(totales());
  expect(t.getByText('$484.000')).toBeTruthy();
  expect(t.getByText('-$9.000')).toBeTruthy();
  expect(t.getByText('$475.000')).toBeTruthy();
  expect(t.getByText('$90.250')).toBeTruthy();
  expect(t.getByText('$565.250')).toBeTruthy();
  expect(t.getByText('IVA 19 %')).toBeTruthy();
  expect(screen.getByText('La API vuelve a calcular al guardar')).toBeTruthy();
});

it('al desmarcar IVA el total queda en 475.000 y el IVA en "Exento"', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba());
  await esperarCarga();
  await usuario.click(screen.getByRole('checkbox', { name: 'Aplica IVA 19 %' }));
  const t = within(totales());
  expect(t.getAllByText('$475.000')).toHaveLength(2); // neto y total
  expect(t.getByText('Exento')).toBeTruthy();
  expect(t.queryByText('$565.250')).toBeNull();
});

it('cambiar una cantidad recalcula los totales y la línea en vivo', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba());
  await esperarCarga();
  const cantidad = screen.getByLabelText('Cantidad de la línea 1');
  await usuario.clear(cantidad);
  await usuario.type(cantidad, '4');
  // 4 × 38.000 = 152.000 → neto 513.000
  expect(within(totales()).getByText('$513.000')).toBeTruthy();
  expect(guardar().disabled).toBe(false);
});

it('cantidad 0 muestra error y deshabilita Guardar', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba());
  await esperarCarga();
  expect(guardar().disabled).toBe(true); // sin cambios
  const cantidad = screen.getByLabelText('Cantidad de la línea 1');
  await usuario.clear(cantidad);
  await usuario.type(cantidad, '0');
  await waitFor(() => expect(cantidad.getAttribute('aria-invalid')).toBe('true'));
  expect(guardar().disabled).toBe(true);
});

it('una descripción vacía bloquea Guardar', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba());
  await esperarCarga();
  await usuario.clear(screen.getByLabelText('Descripción de la línea 2'));
  await waitFor(() => expect(guardar().disabled).toBe(true));
});

it('Guardar envía el encabezado y las líneas sin totales y refleja la respuesta', async () => {
  const usuario = userEvent.setup();
  const guardada = borradorDePrueba({
    actualizado_en: '2026-09-30T15:00:00.000Z',
    lineas: borradorDePrueba().lineas.map((l, i) =>
      i === 0 ? { ...l, cantidad: 5, total: 190000 } : l,
    ),
    totales: { subtotal: 560000, descuentos: 9000, neto: 551000, iva: 104690, total: 655690 },
  });
  const llamadas = montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'PUT' && ruta === '/api/cotizaciones/5' ? respuesta(200, guardada) : undefined,
  });
  await esperarCarga();
  const cantidad = screen.getByLabelText('Cantidad de la línea 1');
  await usuario.clear(cantidad);
  await usuario.type(cantidad, '5');
  await usuario.click(guardar());
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(true));
  const cuerpo = llamadas.find((l) => l.metodo === 'PUT')?.cuerpo as Record<string, unknown>;
  expect(cuerpo).toMatchObject({
    contacto_id: 11,
    fecha_emision: '2026-09-30',
    validez_dias: 30,
    moneda: 'CLP',
    valor_uf: null,
    aplica_iva: true,
    nota_interna: 'Paula pidió detallar el soporte por separado.',
  });
  expect(Object.keys(cuerpo)).not.toContain('total');
  expect(Object.keys(cuerpo)).not.toContain('iva_pct');
  expect((cuerpo['lineas'] as unknown[]).length).toBe(5);
  expect((cuerpo['lineas'] as { cantidad: number }[])[0]?.cantidad).toBe(5);
  expect(await screen.findByText('Cotización guardada')).toBeTruthy();
  // El formulario queda con lo que devolvió el servidor: sin cambios pendientes.
  await waitFor(() => expect(within(totales()).getByText('$655.690')).toBeTruthy());
  expect(guardar().disabled).toBe(true);
});

it('una cotización enviada deja los campos deshabilitados y ofrece "Duplicar como v2"', async () => {
  montar(cotizacionDePrueba());
  await esperarCarga();
  expect((screen.getByLabelText('Cantidad de la línea 1') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('Descripción de la línea 1') as HTMLInputElement).disabled).toBe(
    true,
  );
  expect((screen.getByLabelText('Nota interna') as HTMLTextAreaElement).disabled).toBe(true);
  expect(boton('Duplicar como v2')).toBeTruthy();
  expect(boton('Guardar')).toBeNull();
  expect(boton('Marcar como enviada…')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Agregar línea' })).toBeNull();
  expect(screen.getByText(/ya no se edita; duplica para hacer cambios/)).toBeTruthy();
  // Siempre se puede descargar.
  expect(boton('Descargar .xlsx')).toBeTruthy();
  expect(boton('Descargar PDF')).toBeTruthy();
});

it('una cotización aprobada no ofrece duplicar y se muestra congelada', async () => {
  montar(
    cotizacionDePrueba({
      estado: 'aprobada',
      aprobada_en: '2026-10-01T14:00:00.000Z',
      duplicable: false,
    }),
  );
  await esperarCarga();
  expect(boton(/Duplicar como/)).toBeNull();
  expect(screen.getByText(/Aprobada por el cliente el 1 oct · congelada/)).toBeTruthy();
});

it('una cotización rechazada y una reemplazada explican qué hacer', async () => {
  montar(cotizacionDePrueba({ estado: 'rechazada', rechazada_en: '2026-10-01T14:00:00.000Z' }));
  await esperarCarga();
  expect(screen.getByText('Rechazada: duplica como v2 para corregir')).toBeTruthy();
  expect(boton('Duplicar como v2')).toBeTruthy();
});

it('"Marcar como enviada" se deshabilita con cambios sin guardar y explica por qué', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba());
  await esperarCarga();
  const enviar = () => boton('Marcar como enviada…') as HTMLButtonElement;
  expect(enviar().disabled).toBe(false);
  await usuario.type(screen.getByLabelText('Condiciones comerciales'), ' extra');
  expect(enviar().disabled).toBe(true);
  expect((boton('Importar horas de las tareas…') as HTMLButtonElement).disabled).toBe(true);
  await usuario.hover(enviar().parentElement as HTMLElement);
  expect((await screen.findAllByText('Guarda primero')).length).toBeGreaterThan(0);
});

it('"Marcar como enviada" pide confirmación y llama a la API', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/cotizaciones/5/enviar'
        ? respuesta(200, cotizacionDePrueba({ id: 5, version: 2 }))
        : undefined,
  });
  await esperarCarga();
  await usuario.click(boton('Marcar como enviada…') as HTMLButtonElement);
  expect(
    await screen.findByText(/la OT pasa a Cotizada y esta versión deja de ser editable/),
  ).toBeTruthy();
  const dialogo = screen.getByRole('alertdialog');
  await usuario.click(within(dialogo).getByRole('button', { name: 'Marcar como enviada' }));
  await waitFor(() =>
    expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta.endsWith('/enviar'))).toBe(true),
  );
  expect(await screen.findByText('Marcada como enviada · OT-0218 pasó a Cotizada')).toBeTruthy();
});

it('"Duplicar como v2" crea la versión y navega a ella', async () => {
  const usuario = userEvent.setup();
  const nueva = borradorDePrueba();
  const llamadas = montar(cotizacionDePrueba(), {
    otras: [nueva],
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/cotizaciones/4/duplicar'
        ? respuesta(201, nueva)
        : undefined,
  });
  await esperarCarga();
  await usuario.click(boton('Duplicar como v2') as HTMLButtonElement);
  await waitFor(() => expect(screen.getByTestId('ruta').textContent).toBe('/cotizaciones/5'));
  expect(llamadas.some((l) => l.metodo === 'POST' && l.ruta.endsWith('/duplicar'))).toBe(true);
  expect(await screen.findByRole('heading', { level: 1, name: 'COT-0218 v2' })).toBeTruthy();
});

it('"Eliminar borrador…" confirma, borra y vuelve a la OT', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'DELETE' && ruta === '/api/cotizaciones/5' ? respuesta(204) : undefined,
  });
  await esperarCarga();
  await usuario.click(boton('Eliminar borrador…') as HTMLButtonElement);
  await usuario.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Eliminar' }),
  );
  await waitFor(() => expect(screen.getByTestId('ruta').textContent).toBe('/ots/21'));
  expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(true);
});

it('en UF aparece el Valor UF y los montos van como "UF 12,50"', async () => {
  const lineas = [
    {
      id: 1,
      orden: 1,
      tipo: 'servicio' as const,
      descripcion: 'Licencia',
      cantidad: 1,
      unidad: 'un' as const,
      precio_unitario: 12.5,
      descuento_pct: 0,
      total: 12.5,
    },
  ];
  montar(
    borradorDePrueba({
      moneda: 'UF',
      valor_uf: 38000,
      aplica_iva: false,
      lineas,
      totales: { subtotal: 12.5, descuentos: 0, neto: 12.5, iva: 0, total: 12.5 },
    }),
  );
  await esperarCarga();
  expect(screen.getByLabelText('Valor UF')).toBeTruthy();
  expect(within(totales()).getAllByText('UF 12,50').length).toBeGreaterThan(0);
  // 12,5 UF × 38.000 = 475.000
  expect(within(totales()).getByText(/≈/).textContent).toContain('$475.000');
});

it('en CLP el Valor UF también se muestra, con su procedencia', async () => {
  montar(
    borradorDePrueba({
      valor_uf: 41098.15,
      valor_uf_fecha: '2026-10-05',
      valor_uf_fuente: 'boostr',
    }),
  );
  await esperarCarga();
  expect((screen.getByLabelText('Valor UF') as HTMLInputElement).value).toBe('41098.15');
  expect(screen.getByText('Del 5 oct 2026 · Boostr')).toBeTruthy();
});

it('con valor UF manual la ayuda dice "Ingresado a mano"; sin valor avisa que no se convertirán tarifas', async () => {
  montar(borradorDePrueba({ valor_uf: 41000, valor_uf_fecha: null, valor_uf_fuente: 'manual' }));
  await esperarCarga();
  expect(screen.getByText('Ingresado a mano')).toBeTruthy();
});

it('sin valor UF la ayuda avisa que las tarifas en UF no se podrán convertir', async () => {
  montar(borradorDePrueba());
  await esperarCarga();
  expect(
    screen.getByText('Sin valor: las tarifas en UF no se podrán convertir').className,
  ).toContain('text-alta');
});

it('"Usar UF del día" escribe el valor y al guardar lo envía en una cotización en CLP', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'PUT' && ruta === '/api/cotizaciones/5'
        ? respuesta(200, borradorDePrueba({ valor_uf: 41098.15 }))
        : undefined,
  });
  await esperarCarga();
  const boton = await screen.findByRole('button', { name: 'Usar UF del día' });
  await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(false));
  await usuario.click(boton);
  expect((screen.getByLabelText('Valor UF') as HTMLInputElement).value).toBe('41098.15');
  expect(screen.getByText('Del 5 oct 2026 · Boostr')).toBeTruthy();
  await waitFor(() => expect(guardar().disabled).toBe(false));
  await usuario.click(guardar());
  await waitFor(() => expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(true));
  expect((llamadas.find((l) => l.metodo === 'PUT')?.cuerpo as { valor_uf: number }).valor_uf).toBe(
    41098.15,
  );
});

it('"Usar UF del día" queda deshabilitado si no hay valor de la UF', async () => {
  montar(borradorDePrueba(), { uf: null });
  await esperarCarga();
  const boton = (await screen.findByRole('button', {
    name: 'Usar UF del día',
  })) as HTMLButtonElement;
  expect(boton.disabled).toBe(true);
});

it('con la UF desactualizada el botón sigue activo y la ayuda lo advierte', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba(), { uf: { ...UF_DEL_DIA, fecha: '2026-10-01', desactualizado: true } });
  await esperarCarga();
  const boton = await screen.findByRole('button', { name: 'Usar UF del día' });
  await waitFor(() => expect((boton as HTMLButtonElement).disabled).toBe(false));
  await usuario.click(boton);
  expect(screen.getByText('UF del 1 oct 2026: puede estar desactualizada')).toBeTruthy();
});

it('el cotizador no ofrece "Usar UF del día" en una cotización que no se edita', async () => {
  montar(cotizacionDePrueba());
  await esperarCarga();
  expect(boton('Usar UF del día')).toBeNull();
});

it('en CLP con tarifa del cliente en UF, "Agregar línea" usa el precio convertido', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(
    borradorDePrueba({
      valor_uf: 41098.15,
      valor_uf_fecha: '2026-10-05',
      valor_uf_fuente: 'boostr',
    }),
    { cliente: { ...CLIENTE, tarifas: [{ concepto: 'hora_normal', moneda: 'UF', valor: 0.8 }] } },
  );
  await esperarCarga();
  await screen.findByLabelText('Contacto');
  // Las tarifas llegan en consultas aparte: se espera a que resuelvan antes de agregar la línea.
  await waitFor(() => expect(llamadas.some((l) => l.ruta === '/api/clientes/1')).toBe(true));
  await new Promise((r) => setTimeout(r, 50));
  await usuario.click(screen.getByRole('button', { name: 'Agregar línea' }));
  const precio = screen.getByLabelText('Precio unitario de la línea 6') as HTMLInputElement;
  expect(precio.value).toBe('32879');
});

it('en UF con tarifa global en CLP, "Agregar línea" deja el precio convertido', async () => {
  const usuario = userEvent.setup();
  montar(
    borradorDePrueba({
      moneda: 'UF',
      valor_uf: 41098.15,
      valor_uf_fecha: '2026-10-05',
      valor_uf_fuente: 'boostr',
    }),
  );
  await esperarCarga();
  await screen.findByLabelText('Contacto');
  await new Promise((r) => setTimeout(r, 50));
  await usuario.click(screen.getByRole('button', { name: 'Agregar línea' }));
  const precio = screen.getByLabelText('Precio unitario de la línea 6') as HTMLInputElement;
  expect(precio.value).toBe('0.92');
});

it('bajo 768 px las líneas se muestran como tarjetas; desde 768 px, como tabla', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  montar(borradorDePrueba());
  await esperarCarga();
  expect(document.querySelector('[data-vista="tarjetas"]')).toBeTruthy();
  expect(document.querySelector('table')).toBeNull();
  expect(screen.getByLabelText('Cantidad de la línea 1')).toBeTruthy();
});

it('en escritorio las líneas van en una tabla', async () => {
  montar(borradorDePrueba());
  await esperarCarga();
  expect(document.querySelector('[data-vista="tabla"]')).toBeTruthy();
  expect(screen.getByRole('table')).toBeTruthy();
});

it('"Agregar línea" suma una fila con la tarifa de hora normal', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba());
  await esperarCarga();
  await screen.findByLabelText('Contacto');
  await usuario.click(screen.getByRole('button', { name: 'Agregar línea' }));
  const precio = screen.getByLabelText('Precio unitario de la línea 6') as HTMLInputElement;
  expect(precio.value).toBe('38000');
  // La descripción vacía impide guardar hasta completarla.
  expect(guardar().disabled).toBe(true);
  await usuario.type(screen.getByLabelText('Descripción de la línea 6'), 'Soporte adicional');
  await waitFor(() => expect(guardar().disabled).toBe(false));
  expect(within(totales()).getByText('$513.000')).toBeTruthy();
});

it('quitar una línea la elimina y recalcula', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba());
  await esperarCarga();
  await usuario.click(screen.getByRole('button', { name: 'Quitar la línea 5' }));
  expect(screen.queryByLabelText('Descripción de la línea 5')).toBeNull();
  // Sin la línea 5 (81.000): subtotal y neto quedan en 394.000, sin descuentos
  expect(within(totales()).getAllByText('$394.000')).toHaveLength(2);
});

it('sin líneas muestra el vacío con las tres acciones', async () => {
  montar(
    borradorDePrueba({
      lineas: [],
      totales: { subtotal: 0, descuentos: 0, neto: 0, iva: 0, total: 0 },
    }),
  );
  await esperarCarga();
  expect(screen.getByText('Sin líneas')).toBeTruthy();
  expect(boton('Importar horas de las tareas')).toBeTruthy();
  expect(boton('Aplicar plantilla')).toBeTruthy();
  expect(boton('Agregar línea')).toBeTruthy();
});

it('"Importar horas" muestra la tarifa global y las horas de cada origen y llama a la API', async () => {
  const usuario = userEvent.setup();
  const importada = borradorDePrueba({ actualizado_en: '2026-09-30T16:00:00.000Z' });
  const llamadas = montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/cotizaciones/5/importar-horas'
        ? respuesta(200, importada)
        : undefined,
  });
  await esperarCarga();
  await usuario.click(boton('Importar horas de las tareas…') as HTMLButtonElement);
  const dialogo = await screen.findByRole('dialog');
  expect(await within(dialogo).findByText('Tarifa global $38.000/h')).toBeTruthy();
  expect(within(dialogo).getByText(/10 h/)).toBeTruthy();
  await usuario.click(within(dialogo).getByRole('radio', { name: /Reales/ }));
  await usuario.click(within(dialogo).getByRole('button', { name: 'Importar' }));
  await waitFor(() => expect(llamadas.some((l) => l.ruta.endsWith('/importar-horas'))).toBe(true));
  expect(llamadas.find((l) => l.ruta.endsWith('/importar-horas'))?.cuerpo).toEqual({
    origen: 'reales',
  });
});

it('"Importar horas" ofrece las horas registradas con su total, la tarifa extendida y llama a la API', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/cotizaciones/5/importar-horas'
        ? respuesta(200, borradorDePrueba({ actualizado_en: '2026-09-30T16:00:00.000Z' }))
        : undefined,
  });
  await esperarCarga();
  await usuario.click(boton('Importar horas de las tareas…') as HTMLButtonElement);
  const dialogo = await screen.findByRole('dialog');
  await within(dialogo).findByText('Tarifa global $38.000/h');
  const registradas = within(dialogo).getByRole('radio', { name: /Registradas/ });
  expect(within(dialogo).getByText(/3 h/)).toBeTruthy();
  await usuario.click(registradas);
  expect(
    within(dialogo).getByText(
      'Las horas fuera de horario se cotizan a la tarifa de hora extendida ($45.000/h).',
    ),
  ).toBeTruthy();
  await usuario.click(within(dialogo).getByRole('button', { name: 'Importar' }));
  await waitFor(() => expect(llamadas.some((l) => l.ruta.endsWith('/importar-horas'))).toBe(true));
  expect(llamadas.find((l) => l.ruta.endsWith('/importar-horas'))?.cuerpo).toEqual({
    origen: 'registradas',
  });
});

it('"Importar horas" prefiere la tarifa del cliente', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba(), {
    cliente: { ...CLIENTE, tarifas: [{ concepto: 'hora_normal', moneda: 'CLP', valor: 40000 }] },
  });
  await esperarCarga();
  await usuario.click(boton('Importar horas de las tareas…') as HTMLButtonElement);
  expect(await screen.findByText('Tarifa del cliente $40.000/h')).toBeTruthy();
});

it('"Importar horas" muestra el precio convertido de una tarifa en UF y lo importa', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(
    borradorDePrueba({
      valor_uf: 41098.15,
      valor_uf_fecha: '2026-10-05',
      valor_uf_fuente: 'boostr',
    }),
    {
      cliente: { ...CLIENTE, tarifas: [{ concepto: 'hora_normal', moneda: 'UF', valor: 0.8 }] },
      manejador: ({ metodo, ruta }) =>
        metodo === 'POST' && ruta === '/api/cotizaciones/5/importar-horas'
          ? respuesta(200, borradorDePrueba())
          : undefined,
    },
  );
  await esperarCarga();
  await usuario.click(boton('Importar horas de las tareas…') as HTMLButtonElement);
  const dialogo = await screen.findByRole('dialog');
  expect(
    await within(dialogo).findByText(
      'Tarifa del cliente UF 0,80/h ≈ $32.879/h al valor UF $41.098,15',
    ),
  ).toBeTruthy();
  await usuario.click(within(dialogo).getByRole('button', { name: 'Importar' }));
  await waitFor(() => expect(llamadas.some((l) => l.ruta.endsWith('/importar-horas'))).toBe(true));
});

it('"Importar horas" se deshabilita sin valor UF cuando hay que convertir la tarifa', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba(), {
    cliente: { ...CLIENTE, tarifas: [{ concepto: 'hora_normal', moneda: 'UF', valor: 0.8 }] },
  });
  await esperarCarga();
  await usuario.click(boton('Importar horas de las tareas…') as HTMLButtonElement);
  const dialogo = await screen.findByRole('dialog');
  expect(
    await within(dialogo).findByText(
      'Indica el valor de la UF en Datos y guarda antes de importar',
    ),
  ).toBeTruthy();
  expect(
    (within(dialogo).getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('"Aplicar plantilla" lista las plantillas activas y aplica la elegida', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/cotizaciones/5/aplicar-plantilla'
        ? respuesta(200, borradorDePrueba({ actualizado_en: '2026-09-30T16:00:00.000Z' }))
        : undefined,
  });
  await esperarCarga();
  await usuario.click(boton('Aplicar plantilla…') as HTMLButtonElement);
  const dialogo = await screen.findByRole('dialog');
  expect(await within(dialogo).findByText('Soporte por horas')).toBeTruthy();
  expect(within(dialogo).getByText('1 línea: Diagnóstico · h')).toBeTruthy();
  const aplicar = within(dialogo).getByRole('button', { name: 'Aplicar' }) as HTMLButtonElement;
  expect(aplicar.disabled).toBe(true);
  await usuario.click(within(dialogo).getByRole('radio', { name: /Soporte por horas/ }));
  await usuario.click(aplicar);
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta.endsWith('/aplicar-plantilla'))).toBe(true),
  );
  expect(llamadas.find((l) => l.ruta.endsWith('/aplicar-plantilla'))?.cuerpo).toEqual({
    plantilla_id: 2,
  });
});

it('descargar pide el binario, registra el aviso y no necesita permiso de edición', async () => {
  const usuario = userEvent.setup();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const llamadas = montar(cotizacionDePrueba(), {
    rol: 'lectura',
    manejador: ({ ruta }) =>
      ruta === '/api/cotizaciones/4/descargar.pdf'
        ? new Response('%PDF-', {
            status: 200,
            headers: { 'Content-Disposition': 'attachment; filename="COT-0218_v1.pdf"' },
          })
        : undefined,
  });
  await esperarCarga();
  expect(screen.getByText('Solo lectura')).toBeTruthy();
  expect(boton(/Duplicar como/)).toBeNull();
  await usuario.click(boton('Descargar PDF') as HTMLButtonElement);
  await waitFor(() =>
    expect(llamadas.some((l) => l.ruta === '/api/cotizaciones/4/descargar.pdf')).toBe(true),
  );
  expect(await screen.findByText('Descarga registrada en el historial de la OT')).toBeTruthy();
  vi.restoreAllMocks();
});

it('un 409 de la API se muestra como aviso con su mensaje', async () => {
  const usuario = userEvent.setup();
  montar(borradorDePrueba(), {
    manejador: ({ metodo, ruta }) =>
      metodo === 'POST' && ruta === '/api/cotizaciones/5/enviar'
        ? respuesta(409, {
            error: {
              codigo: 'COTIZACION_NO_EDITABLE',
              mensaje: 'La cotización no es un borrador o no es la versión vigente',
            },
          })
        : undefined,
  });
  await esperarCarga();
  await usuario.click(boton('Marcar como enviada…') as HTMLButtonElement);
  await usuario.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Marcar como enviada',
    }),
  );
  expect(
    await screen.findByText('La cotización no es un borrador o no es la versión vigente'),
  ).toBeTruthy();
});

it('lista las versiones con la actual marcada y enlaces a cada una', async () => {
  montar(borradorDePrueba());
  await esperarCarga();
  const versiones = screen.getByRole('region', { name: 'Versiones' });
  const enlaces = within(versiones).getAllByRole('link');
  expect(enlaces).toHaveLength(2);
  expect(enlaces[0]?.getAttribute('aria-current')).toBe('page'); // v2, la más nueva
  expect(enlaces[1]?.getAttribute('href')).toBe('/cotizaciones/4');
  expect(within(versiones).getByText('Enviada')).toBeTruthy();
  expect(within(versiones).getByText('Borrador')).toBeTruthy();
});

it('encabezado: OT, ticket y estado con texto', async () => {
  montar(borradorDePrueba());
  await esperarCarga();
  expect(
    screen.getByRole('link', { name: /OT-0218 · Regularización de folios/ }).getAttribute('href'),
  ).toBe('/ots/21');
  expect(screen.getByRole('link', { name: 'TK-1048' }).getAttribute('href')).toBe('/tickets/7');
  expect(screen.getAllByText('Borrador').length).toBeGreaterThan(0);
  expect(document.title).toBe('COT-0218 v2 · Zydesk');
});

it('404: "Cotización no encontrada" con enlace a la lista', async () => {
  simularFetch();
  render(
    <TooltipProvider>
      <ConSesion yo={yoDePrueba()} ruta="/cotizaciones/99">
        <Routes>
          <Route path="/cotizaciones/:id" element={<CotizadorPage />} />
        </Routes>
      </ConSesion>
    </TooltipProvider>,
  );
  expect(await screen.findByText('Cotización no encontrada')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir a cotizaciones' }).getAttribute('href')).toBe(
    '/cotizaciones',
  );
});
