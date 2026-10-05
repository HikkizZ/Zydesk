import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { soloLocal, soloSemillas } from './guardas.js';
import { idDeOt, idDeTicket, ingresar, type UsuarioSemilla } from './sesion.js';

// Capturas de los manuales (spec fase 8 §10). Se ejecuta a mano: `npm run db:reiniciar` y luego
// `npm run docs:capturas`. Solo semillas: aborta si hay un usuario que no lo es. Ningún diálogo se
// confirma y nada se envía; las vistas previas se descartan. Sobrescribe los PNG existentes.

const aqui = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.resolve(aqui, '../../../docs/manuales/img');
const fixture = (nombre: string) => path.resolve(aqui, 'fixtures', nombre);
const CORREO_EML = path.resolve(aqui, '../../api/test/fixtures/correo.eml');

type Manual = 'primeros-pasos' | 'tecnico' | 'coordinacion' | 'administracion';
type Captura = {
  manual: Manual;
  archivo: string; // sin extensión; el sufijo `-movil` decide el proyecto
  cuenta: UsuarioSemilla | null;
  ruta: (page: Page) => Promise<string>;
  preparar?: (page: Page) => Promise<void>;
  // Qué se fotografía: la ventana (por defecto), la página completa o un elemento (diálogos, tarjetas).
  modo?: 'completa' | ((page: Page) => Locator);
  limpiar?: (page: Page) => Promise<void>;
};

const fija = (ruta: string) => async () => ruta;
const ticket = (codigo: string) => async (page: Page) =>
  `/tickets/${await idDeTicket(page, codigo)}`;
const ot = (codigo: string) => async (page: Page) => `/ots/${await idDeOt(page, codigo)}`;
const dialogo = (page: Page) => page.getByRole('dialog');
const TICKET = 'TK-1048';
let versionTemporal: number | null = null; // v2 de COT-0218 creada para la captura del cotizador

async function abrirRedactor(page: Page) {
  const plegado = page.getByRole('button', { name: 'Escribir seguimiento' });
  if (await plegado.isVisible()) await plegado.click();
}

const CAPTURAS: Captura[] = [
  // primeros-pasos
  { manual: 'primeros-pasos', archivo: 'ingresar', cuenta: null, ruta: fija('/ingresar') },
  { manual: 'primeros-pasos', archivo: 'mi-dia', cuenta: 'crojas', ruta: fija('/mi-dia') },
  { manual: 'primeros-pasos', archivo: 'mi-dia-movil', cuenta: 'crojas', ruta: fija('/mi-dia') },
  { manual: 'primeros-pasos', archivo: 'avisos', cuenta: 'crojas', ruta: fija('/avisos') },
  {
    manual: 'primeros-pasos',
    archivo: 'avisos-preferencias-movil',
    cuenta: 'crojas',
    ruta: fija('/avisos'),
    preparar: async (page) => {
      await page.getByRole('tab', { name: 'Preferencias' }).click();
      await expect(page.getByRole('table', { name: 'Preferencias de avisos' })).toBeVisible();
    },
  },
  {
    manual: 'primeros-pasos',
    archivo: 'perfil',
    cuenta: 'crojas',
    ruta: fija('/perfil'),
    // Solo «Tus datos»: la lista de sesiones muestra el navegador de Playwright y la IP local.
    modo: (page) =>
      page
        .getByRole('heading', { name: 'Tus datos' })
        .locator('xpath=ancestor::*[contains(@class,"rounded")][1]'),
  },
  {
    manual: 'primeros-pasos',
    archivo: 'menu-mas-movil',
    cuenta: 'crojas',
    ruta: fija('/mi-dia'),
    preparar: async (page) => {
      await page.getByRole('button', { name: 'Más' }).click();
      await expect(dialogo(page)).toBeVisible();
    },
  },
  {
    manual: 'primeros-pasos',
    archivo: 'ayuda',
    cuenta: 'crojas',
    ruta: fija('/ayuda/primeros-pasos'),
  },

  // tecnico
  { manual: 'tecnico', archivo: 'nuevo-ticket', cuenta: 'sdiaz', ruta: fija('/tickets/nuevo') },
  {
    manual: 'tecnico',
    archivo: 'adjuntar-correo',
    cuenta: 'sdiaz',
    ruta: fija('/tickets/nuevo'),
    preparar: async (page) => {
      await page.getByLabel('Elegir correo').setInputFiles(CORREO_EML);
      await expect(page.getByRole('button', { name: 'Usar en el formulario' })).toBeVisible();
    },
  },
  {
    manual: 'tecnico',
    archivo: 'detalle-ticket',
    cuenta: 'sdiaz',
    ruta: ticket(TICKET),
    modo: 'completa',
  },
  { manual: 'tecnico', archivo: 'detalle-ticket-movil', cuenta: 'sdiaz', ruta: ticket(TICKET) },
  {
    manual: 'tecnico',
    archivo: 'datos-ticket-movil',
    cuenta: 'sdiaz',
    ruta: ticket(TICKET),
    preparar: async (page) => {
      const resumen = page.locator('summary', { hasText: 'Datos del ticket' });
      await resumen.click();
      await resumen.scrollIntoViewIfNeeded();
    },
  },
  {
    manual: 'tecnico',
    archivo: 'redactor-fotos-movil',
    cuenta: 'sdiaz',
    ruta: ticket(TICKET),
    preparar: async (page) => {
      await abrirRedactor(page);
      const redactor = page.locator('section[aria-label="Redactor"]');
      await redactor
        .locator('input[type="file"][capture]')
        .setInputFiles([fixture('foto-1.jpg'), fixture('foto-2.jpg')]);
      await expect(page.locator('img[src^="blob:"]')).toHaveCount(2);
      await expect(redactor.getByRole('button', { name: /^Quitar/ })).toHaveCount(2, {
        timeout: 15_000,
      });
      await redactor.scrollIntoViewIfNeeded();
    },
    // Las fotos subidas quedan pendientes en el servidor hasta descartarlas: se descartan.
    limpiar: async (page) => {
      await page
        .locator('section[aria-label="Redactor"]')
        .getByRole('button', { name: 'Cancelar' })
        .click();
      await page.getByRole('button', { name: 'Descartar' }).click();
    },
  },
  {
    manual: 'tecnico',
    archivo: 'tareas',
    cuenta: 'sdiaz',
    ruta: ticket(TICKET),
    modo: (page) => page.locator('section[aria-label="Tareas"]'),
  },
  {
    manual: 'tecnico',
    archivo: 'cambiar-estado',
    cuenta: 'sdiaz',
    ruta: ticket(TICKET),
    preparar: async (page) => {
      await page.getByRole('button', { name: 'Cambiar estado' }).first().click();
      await expect(dialogo(page)).toBeVisible();
    },
    modo: dialogo,
  },
  {
    manual: 'tecnico',
    archivo: 'convertir-en-ot',
    cuenta: 'sdiaz',
    ruta: ticket('TK-1035'),
    preparar: async (page) => {
      await page.getByRole('button', { name: 'Convertir en OT' }).first().click();
      await expect(dialogo(page)).toBeVisible();
    },
    modo: dialogo,
  },
  { manual: 'tecnico', archivo: 'ot', cuenta: 'sdiaz', ruta: ot('OT-0218'), modo: 'completa' },
  { manual: 'tecnico', archivo: 'ot-movil', cuenta: 'sdiaz', ruta: ot('OT-0218') },
  {
    manual: 'tecnico',
    archivo: 'ot-atajos-movil',
    cuenta: 'sdiaz',
    ruta: ot('OT-0218'),
    preparar: async (page) => {
      await page
        .getByRole('navigation', { name: 'En esta OT' })
        .getByRole('link', { name: 'Fotos' })
        .click();
      await page.waitForTimeout(500);
    },
  },
  {
    manual: 'tecnico',
    archivo: 'fotos-y-archivos',
    cuenta: 'sdiaz',
    ruta: ot('OT-0218'),
    modo: (page) => page.locator('#fotos'),
  },
  { manual: 'tecnico', archivo: 'horas', cuenta: 'sdiaz', ruta: fija('/horas') },
  { manual: 'tecnico', archivo: 'horas-movil', cuenta: 'sdiaz', ruta: fija('/horas') },
  {
    manual: 'tecnico',
    archivo: 'cotizador',
    cuenta: 'crojas',
    ruta: async (page) => {
      // COT-0218 v1 se sembró sin valor_uf: se duplica como v2 (la API toma la UF del día) para mostrar la UF
      // y su procedencia. Es la única captura que escribe, y solo en la base de las semillas.
      const r = await page.request.get(`/api/ots/${await idDeOt(page, 'OT-0218')}`);
      const { cotizacion } = (await r.json()) as { cotizacion: { id: number } };
      const d = await page.request.post(`/api/cotizaciones/${cotizacion.id}/duplicar`, {
        headers: { 'X-Requested-With': 'Zydesk' },
      });
      expect(d.status()).toBe(201);
      const v2 = (await d.json()) as { id: number };
      versionTemporal = v2.id;
      return `/cotizaciones/${v2.id}`;
    },
    // La v2 en borrador deshabilitaría «Registrar aprobación del cliente» de OT-0218 en capturas posteriores.
    limpiar: async (page) => {
      const d = await page.request.delete(`/api/cotizaciones/${versionTemporal}`, {
        headers: { 'X-Requested-With': 'Zydesk' },
      });
      expect(d.status()).toBe(204);
      versionTemporal = null;
    },
  },
  { manual: 'tecnico', archivo: 'tablero', cuenta: 'crojas', ruta: fija('/tickets') },
  { manual: 'tecnico', archivo: 'tabla', cuenta: 'crojas', ruta: fija('/tickets/tabla') },
  {
    manual: 'tecnico',
    archivo: 'linea-de-tiempo',
    cuenta: 'crojas',
    ruta: fija('/tickets/linea-de-tiempo'),
  },

  // coordinacion
  {
    manual: 'coordinacion',
    archivo: 'aprobacion-cliente',
    cuenta: 'crojas',
    ruta: ot('OT-0218'),
    preparar: async (page) => {
      await page.getByRole('button', { name: /^Registrar aprobación del cliente/ }).click();
      await expect(dialogo(page)).toBeVisible();
    },
    modo: dialogo,
  },
  {
    manual: 'coordinacion',
    archivo: 'cerrar-ot',
    cuenta: 'crojas',
    // OT-0218 está cotizada; la OT en ejecución de las semillas es OT-0217.
    ruta: ot('OT-0217'),
    preparar: async (page) => {
      await page
        .getByRole('button', { name: /^Cerrar OT/ })
        .first()
        .click();
      await expect(dialogo(page)).toBeVisible();
    },
    modo: dialogo,
  },
  {
    manual: 'coordinacion',
    archivo: 'facturar',
    cuenta: 'crojas',
    ruta: ot('OT-0216'),
    preparar: async (page) => {
      await page.getByRole('button', { name: /^Marcar facturada/ }).click();
      await expect(dialogo(page)).toBeVisible();
    },
    modo: dialogo,
  },
  { manual: 'coordinacion', archivo: 'lista-ot', cuenta: 'crojas', ruta: fija('/ots') },
  { manual: 'coordinacion', archivo: 'reportes', cuenta: 'crojas', ruta: fija('/reportes') },

  // administracion (escritorio). No hay captura de Telegram: la tarjeta solo existe con el bot configurado.
  ...(
    [
      ['equipo', 'equipo'],
      ['departamentos', 'departamentos'],
      ['categorias', 'categorias'],
      ['numeracion-y-marca', 'numeracion'],
      ['tarifas', 'tarifas'],
      ['plantillas', 'plantillas'],
    ] as const
  ).map(([archivo, pestana]): Captura => ({
    manual: 'administracion',
    archivo,
    cuenta: 'hikki',
    ruta: fija(`/configuracion/${pestana}`),
  })),
];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, baseURL }) => {
  soloLocal(baseURL!);
  const contexto = await browser.newContext({ baseURL });
  const page = await contexto.newPage();
  await ingresar(page, 'hikki');
  const r = await page.request.get('/api/usuarios');
  expect(r.status()).toBe(200);
  soloSemillas((await r.json()) as { correo: string }[]);
  await contexto.close();
});

for (const c of CAPTURAS) {
  test(`${c.manual}/${c.archivo}`, async ({ page }, info) => {
    const esMovil = c.archivo.endsWith('-movil');
    test.skip(
      esMovil !== (info.project.name === 'movil-375'),
      'el sufijo -movil decide el proyecto',
    );

    if (c.cuenta) await ingresar(page, c.cuenta);
    await page.goto(await c.ruta(page));
    await page.waitForLoadState('networkidle');
    if (!c.preparar) await page.evaluate(() => window.scrollTo(0, 0));
    await c.preparar?.(page);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    // El cursor y el foco no deben quedar a la vista.
    await page.mouse.move(0, 0);

    const archivo = path.join(IMG, c.manual, `${c.archivo}.png`);
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    const opciones = { path: archivo, type: 'png', animations: 'disabled', scale: 'css' } as const;
    if (typeof c.modo === 'function') await c.modo(page).screenshot(opciones);
    else await page.screenshot({ ...opciones, fullPage: c.modo === 'completa' });

    await c.limpiar?.(page);
  });
}
