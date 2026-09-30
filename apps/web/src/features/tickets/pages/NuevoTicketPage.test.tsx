import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CategoriaSalidaDatos } from '@zydesk/shared';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { respuesta, simularFetch } from '@/test/fetch';
import { ConSesion, yoDePrueba } from '@/test/sesion';
import { USUARIOS_PRUEBA } from '@/test/tickets';
import { NuevoTicketPage } from './NuevoTicketPage';

// Radix Select usa estas APIs del DOM que jsdom no trae.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});
afterEach(() => vi.unstubAllGlobals());

const PLAZO = { valor: 1, unidad: 'dias' as const };
const CATEGORIA: CategoriaSalidaDatos = {
  id: 4,
  nombre: 'ERP / Facturación',
  responsable_defecto_id: null,
  responsable_defecto: null,
  plazo_respuesta: { valor: 4, unidad: 'horas' },
  plazo_resolucion: {
    urgente: PLAZO,
    alta: PLAZO,
    media: { valor: 2, unidad: 'dias' },
    baja: PLAZO,
  },
  activo: true,
  creado_en: '2026-09-01T12:00:00.000Z',
  actualizado_en: '2026-09-01T12:00:00.000Z',
};

const ARCHIVO = {
  id: 91,
  nombre_original: 'correo.eml',
  tipo_mime: 'message/rfc822',
  tamano: 1200,
  categoria: 'correo',
  url: '/api/archivos/91',
  es_imagen: false,
  subido_por: { id: 1, nombre: 'Diego Muñoz' },
  subido_en: '2026-09-30T12:00:00.000Z',
  origen_correo: false,
};

const CORREO = {
  origen: 'eml',
  de: 'Paula Herrera <pherrera@ejemplo.test>',
  para: 'soporte@zydesk.local',
  fecha: '2026-09-28T19:58:00.000Z',
  asunto: 'Error al emitir facturas desde el ERP',
  cuerpo_texto: 'Hola, no puedo emitir facturas.',
  adjuntos: [
    { indice: 0, nombre: 'captura.png', tamano: 70, tipo_mime: 'image/png', permitido: true },
  ],
  solicitante_sugerido: { nombre: 'Paula Herrera', correo: 'pherrera@ejemplo.test' },
};

function montar() {
  const llamadas = simularFetch(({ metodo, ruta }) => {
    if (metodo === 'GET' && ruta.startsWith('/api/usuarios'))
      return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'GET' && ruta.startsWith('/api/clientes')) return respuesta(200, []);
    if (metodo === 'GET' && ruta.startsWith('/api/categorias')) return respuesta(200, [CATEGORIA]);
    if (metodo === 'POST' && ruta === '/api/archivos') return respuesta(201, [ARCHIVO]);
    if (metodo === 'POST' && ruta === '/api/correos/parsear') return respuesta(200, CORREO);
    if (metodo === 'POST' && ruta === '/api/plazos/calcular')
      return respuesta(200, { hasta: '2026-10-02T20:00:00.000Z', horas_habiles: 18 });
    if (metodo === 'POST' && ruta === '/api/tickets')
      return respuesta(201, { id: 55, codigo: 'TK-1052' });
    return undefined;
  });
  render(
    <ConSesion
      yo={yoDePrueba({ departamento: { id: 1, nombre: 'Terreno' } })}
      ruta="/tickets/nuevo"
    >
      <TooltipProvider>
        <NuevoTicketPage />
      </TooltipProvider>
    </ConSesion>,
  );
  return llamadas;
}

const valor = (etiqueta: string) => (screen.getByLabelText(etiqueta) as HTMLInputElement).value;

async function adjuntarCorreo(usuario: ReturnType<typeof userEvent.setup>) {
  const archivo = new File(['x'], 'correo.eml', { type: 'message/rfc822' });
  await usuario.upload(screen.getByLabelText('Elegir correo'), archivo);
  await usuario.click(await screen.findByRole('button', { name: 'Usar en el formulario' }));
}

it('el panel de correo rellena asunto, solicitante y descripción', async () => {
  const usuario = userEvent.setup();
  montar();
  await adjuntarCorreo(usuario);

  expect(valor('Asunto')).toBe('Error al emitir facturas desde el ERP');
  expect(valor('Nombre del solicitante')).toBe('Paula Herrera');
  expect(valor('Correo del solicitante')).toBe('pherrera@ejemplo.test');
  expect(valor('Descripción')).toBe('Hola, no puedo emitir facturas.');
  expect(screen.getByText('correo.eml')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Quitar' })).toBeTruthy();
});

it('pide confirmación antes de reemplazar un asunto ya escrito', async () => {
  const usuario = userEvent.setup();
  montar();
  await usuario.type(screen.getByLabelText('Asunto'), 'Mi asunto');
  await adjuntarCorreo(usuario);
  await usuario.click(await screen.findByRole('button', { name: 'Conservar' }));
  expect(valor('Asunto')).toBe('Mi asunto');
  expect(valor('Correo del solicitante')).toBe('pherrera@ejemplo.test');
});

it('la vista previa del plazo usa el departamento del principal', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  expect(screen.getByText(/Sin fecha límite \(elige responsable y categoría/)).toBeTruthy();

  await usuario.click(screen.getByRole('combobox', { name: 'Categoría' }));
  await usuario.click(await screen.findByRole('option', { name: 'ERP / Facturación' }));

  await screen.findByText(/Se calculará: vence el/);
  const calculo = llamadas.find((l) => l.ruta === '/api/plazos/calcular');
  expect(calculo?.cuerpo).toMatchObject({
    departamento_id: 1,
    plazo: { valor: 2, unidad: 'dias' },
  });
  expect(screen.getByText(/2 días hábiles desde ahora/)).toBeTruthy();
});

it('crea el ticket con la referencia al correo y los adjuntos elegidos', async () => {
  const usuario = userEvent.setup();
  const llamadas = montar();
  await adjuntarCorreo(usuario);
  await usuario.click(screen.getByRole('button', { name: 'Crear ticket' }));

  await waitFor(() => expect(llamadas.some((l) => l.ruta === '/api/tickets')).toBe(true));
  const envio = llamadas.find((l) => l.ruta === '/api/tickets');
  expect(envio?.cuerpo).toMatchObject({
    asunto: 'Error al emitir facturas desde el ERP',
    prioridad: 'media',
    responsable_principal_id: 1,
    correo: { archivo_id: 91, adjuntos_indices: [0] },
  });
});

it('muestra los errores de validación del servidor en el campo', async () => {
  const usuario = userEvent.setup();
  simularFetch(({ metodo, ruta }) => {
    if (metodo === 'GET' && ruta.startsWith('/api/usuarios'))
      return respuesta(200, USUARIOS_PRUEBA);
    if (metodo === 'GET') return respuesta(200, []);
    if (metodo === 'POST' && ruta === '/api/tickets')
      return respuesta(400, {
        error: {
          codigo: 'VALIDACION',
          mensaje: 'Datos inválidos',
          detalles: { cliente_id: ['Cliente no disponible'] },
        },
      });
    return undefined;
  });
  render(
    <ConSesion yo={yoDePrueba()} ruta="/tickets/nuevo">
      <TooltipProvider>
        <NuevoTicketPage />
      </TooltipProvider>
    </ConSesion>,
  );
  await usuario.type(screen.getByLabelText('Asunto'), 'Prueba');
  await usuario.click(screen.getByRole('button', { name: 'Crear ticket' }));
  expect(await screen.findByText('Cliente no disponible')).toBeTruthy();
});

it('quien solo lee ve "sin permiso"', () => {
  simularFetch();
  render(
    <ConSesion yo={yoDePrueba({ rol: 'lectura' })} ruta="/tickets/nuevo">
      <NuevoTicketPage />
    </ConSesion>,
  );
  expect(screen.getByText('No tienes permiso para ver esta sección')).toBeTruthy();
});
