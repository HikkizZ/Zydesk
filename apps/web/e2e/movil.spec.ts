import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  altoDocumento,
  axe,
  desbordes,
  letraChica,
  objetivosChicos,
  posicionY,
} from './auditoria.js';
import { idDeOt, idDeTicket, ingresar, type UsuarioSemilla } from './sesion.js';

// Auditoría móvil (spec fase-8 §3.2 y §9.3). Etiquetas: `@desborde` corre en 320, 375 y 1440 px;
// `@escritorio` solo a 1440 px; `@axe` a 375 y 1440 px; sin etiqueta, solo a 375 px.
// Cada test afirma `toEqual([])` sobre una lista para que el informe muestre qué falla.

const FOTOS = [1, 2, 3].map((n) =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), `fixtures/foto-${n}.jpg`),
);

type Pantalla = {
  nombre: string;
  usuario: UsuarioSemilla;
  ruta: (page: Page) => Promise<string>;
};

const MI_DIA: Pantalla = { nombre: 'Mi día', usuario: 'crojas', ruta: async () => '/mi-dia' };
const TICKET: Pantalla = {
  nombre: 'Ticket TK-1048',
  usuario: 'crojas',
  ruta: async (page) => `/tickets/${await idDeTicket(page, 'TK-1048')}`,
};
const OT: Pantalla = {
  nombre: 'OT-0218',
  usuario: 'sdiaz',
  ruta: async (page) => `/ots/${await idDeOt(page, 'OT-0218')}`,
};

async function abrir(page: Page, p: Pantalla, usuario: UsuarioSemilla = p.usuario) {
  await ingresar(page, usuario);
  await page.goto(await p.ruta(page));
  await page.waitForLoadState('networkidle');
}

const esMovil = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024;

for (const p of [MI_DIA, TICKET, OT]) {
  test.describe(p.nombre, () => {
    test.beforeEach(async ({ page }) => abrir(page, p));

    test('@desborde sin desbordes', async ({ page }) => {
      const d = await desbordes(page);
      expect(d.documento, 'desborde del documento (px)').toBeLessThanOrEqual(0);
      expect(d.elementos).toEqual([]);
    });

    test('objetivos táctiles de 44 px', async ({ page }) => {
      expect(await objetivosChicos(page)).toEqual([]);
    });

    test('letra de 12 px o más', async ({ page }) => {
      expect(await letraChica(page)).toEqual([]);
    });

    test('@axe sin violaciones serias ni críticas', async ({ page }) => {
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('Mi día: tarjetas', () => {
  test('el relleno de la tarjeta navega al detalle', async ({ page }) => {
    await abrir(page, MI_DIA);
    const tarjeta = page.locator('article:has(a[data-objetivo="cubre-tarjeta"])').first();
    await tarjeta.click({ position: { x: 12, y: 10 }, timeout: 3_000 });
    await expect(page).toHaveURL(/\/tickets\/\d+/);
  });

  // La spec fijó 1 000 px a partir de una auditoría con la cuenta de Administración (880 px, sin
  // tareas ni menciones). Con `crojas` las cuatro secciones traen datos (1 vence hoy, 1 mención,
  // 3 tareas, 1 detenido) y la página mide ~1 212 px: el tope pasa a 1 300 px (ADR 0029).
  test('alto del documento ≤ 1 300 px', async ({ page }) => {
    await abrir(page, MI_DIA);
    expect(await altoDocumento(page)).toBeLessThanOrEqual(1300);
  });
});

test.describe('Ticket TK-1048: posiciones a 375 px', () => {
  test.beforeEach(async ({ page }) => abrir(page, TICKET));

  test('«Datos del ticket» a la vista', async ({ page }) => {
    const y = await posicionY(page, page.locator('summary', { hasText: 'Datos del ticket' }));
    expect(y).toBeLessThanOrEqual(600);
  });

  test('«Tareas» temprano', async ({ page }) => {
    const y = await posicionY(page, page.locator('section[aria-label="Tareas"] h3'));
    expect(y).toBeLessThanOrEqual(1500);
  });

  test('alto del documento ≤ 4 000 px', async ({ page }) => {
    expect(await altoDocumento(page)).toBeLessThanOrEqual(4000);
  });
});

test.describe('OT-0218: posiciones y atajos a 375 px', () => {
  test.beforeEach(async ({ page }) => abrir(page, OT, 'crojas'));

  test('«Tareas» temprano', async ({ page }) => {
    const y = await posicionY(page, page.locator('section[aria-label="Tareas"] h3'));
    expect(y).toBeLessThanOrEqual(750);
  });

  test('alto del documento ≤ 4 900 px', async ({ page }) => {
    expect(await altoDocumento(page)).toBeLessThanOrEqual(4900);
  });

  test('cada atajo lleva su sección a la vista', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'En esta OT' });
    await expect(nav).toBeVisible({ timeout: 3_000 });
    const enlaces = nav.getByRole('link');
    const n = await enlaces.count();
    expect(n).toBeGreaterThan(0);
    const fallos: string[] = [];
    for (let i = 0; i < n; i++) {
      const enlace = enlaces.nth(i);
      const href = (await enlace.getAttribute('href')) ?? '';
      await enlace.click();
      const top = await page
        .locator(`[id="${href.replace(/^#/, '')}"]`)
        .first()
        .evaluate((el) => el.getBoundingClientRect().top, undefined, { timeout: 3_000 });
      if (top < 0 || top > 120) fallos.push(`${href}: top ${Math.round(top)} px`);
    }
    expect(fallos).toEqual([]);
  });
});

test.describe('Barra inferior y panel «Más»', () => {
  test.beforeEach(async ({ page }) => abrir(page, MI_DIA));

  test('la barra mide ≥ 56 px, accesos ≥ 44 px y área segura', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Principal (móvil)' });
    const caja = await nav.boundingBox();
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(56);
    expect(await nav.getAttribute('class')).toContain('pb-[env(safe-area-inset-bottom)]');
    const chicos = await objetivosChicos(page, 'nav[aria-label="Principal (móvil)"]');
    expect(chicos).toEqual([]);
  });

  test('@desborde panel «Más» sin desbordes', async ({ page }) => {
    test.skip(!esMovil(page), 'la barra inferior solo existe bajo 1024 px');
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const d = await desbordes(page);
    expect(d.documento).toBeLessThanOrEqual(0);
    expect(d.elementos).toEqual([]);
  });

  test('objetivos táctiles del panel «Más»', async ({ page }) => {
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await objetivosChicos(page, '[role="dialog"]')).toEqual([]);
  });

  test('@axe panel «Más» sin violaciones serias ni críticas', async ({ page }) => {
    test.skip(!esMovil(page), 'la barra inferior solo existe bajo 1024 px');
    await page.getByRole('button', { name: 'Más' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
});

type Dialogo = { nombre: string; pantalla: Pantalla; abrir: (page: Page) => Promise<void> };
const DIALOGOS: Dialogo[] = [
  {
    nombre: 'Cambiar estado',
    pantalla: TICKET,
    abrir: (page) => page.getByRole('button', { name: 'Cambiar estado' }).first().click(),
  },
  {
    nombre: 'Cerrar OT…',
    // OT-0218 está «cotizada» en las semillas; OT-0217 está en ejecución y es de crojas.
    pantalla: {
      nombre: 'OT-0217',
      usuario: 'crojas',
      ruta: async (page) => `/ots/${await idDeOt(page, 'OT-0217')}`,
    },
    abrir: (page) =>
      page
        .getByRole('button', { name: /^Cerrar OT/ })
        .first()
        .click(),
  },
];

for (const d of DIALOGOS) {
  test.describe(`Diálogo «${d.nombre}»`, () => {
    test.beforeEach(async ({ page }) => {
      await abrir(page, d.pantalla);
      await d.abrir(page);
      await expect(page.getByRole('dialog')).toBeVisible();
    });

    test('@desborde sin desbordes', async ({ page }) => {
      const m = await desbordes(page);
      expect(m.documento).toBeLessThanOrEqual(0);
      expect(m.elementos).toEqual([]);
    });

    test('objetivos táctiles de 44 px', async ({ page }) => {
      expect(await objetivosChicos(page, '[role="dialog"]')).toEqual([]);
    });

    test('cabe en 375 × 667 con scroll interno', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      const dialogo = page.getByRole('dialog');
      // El diálogo se reajusta (max-h en dvh) un instante después de cambiar el viewport.
      await expect
        .poll(async () => (await dialogo.boundingBox())?.height ?? 0, {
          message: 'alto del diálogo',
        })
        .toBeLessThanOrEqual(667 - 32);
      const confirmar = dialogo.getByRole('button').last();
      await confirmar.scrollIntoViewIfNeeded();
      const b = await confirmar.boundingBox();
      expect((b?.y ?? 0) + (b?.height ?? 0), 'botón dentro de la ventana').toBeLessThanOrEqual(667);
      expect(await page.evaluate(() => window.scrollY), 'la página de fondo no se mueve').toBe(0);
    });
  });
}

test.describe('Fotos desde el celular (sdiaz)', () => {
  // Cada test publica mensajes en el mismo ticket / OT: en paralelo, la actividad de uno desplaza el
  // redactor del otro mientras Playwright hace clic. Se ejecutan de a uno.
  test.describe.configure({ mode: 'serial' });

  const casos = [
    { nombre: 'OT-0218', pantalla: OT },
    { nombre: 'TK-1048', pantalla: { ...TICKET, usuario: 'sdiaz' as UsuarioSemilla } },
  ];

  async function abrirRedactor(page: Page) {
    const plegado = page.getByRole('button', { name: 'Escribir seguimiento' });
    if (await plegado.isVisible()) await plegado.click();
    return page.locator('section[aria-label="Redactor"] input[type="file"][capture]');
  }

  for (const c of casos) {
    test(`tres fotos con vista previa, compresión y envío en ${c.nombre}`, async ({ page }) => {
      await abrir(page, c.pantalla);
      const camara = await abrirRedactor(page);
      await expect(camara).toHaveAttribute('accept', 'image/*');
      await expect(camara).toHaveAttribute('capture', 'environment');
      await expect(camara).toHaveAttribute('multiple', '');

      const actividad = page.locator('section[aria-label="Actividad"]');
      const antes = await actividad.locator('img').count();
      const tamanos: number[] = [];
      page.on('response', async (r) => {
        if (r.request().method() !== 'POST' || !/\/api\/archivos$/.test(r.url()) || !r.ok()) return;
        const cuerpo = (await r.json()) as { tamano: number }[];
        tamanos.push(...cuerpo.map((a) => a.tamano));
      });

      await camara.setInputFiles(FOTOS);
      await expect(page.locator('img[src^="blob:"]')).toHaveCount(3, { timeout: 1_000 });
      await expect.poll(() => tamanos.length, { timeout: 15_000 }).toBe(3);
      expect(
        tamanos.filter((t) => t > 600 * 1024),
        'archivos > 600 KB',
      ).toEqual([]);

      await page.getByLabel('Texto del mensaje').fill('Prueba de fotos desde el celular');
      await page.getByRole('button', { name: 'Registrar seguimiento' }).click();
      await expect(actividad.locator('img')).toHaveCount(antes + 3, { timeout: 10_000 });
    });

    test(`«Quitar» saca la foto y llama a DELETE en ${c.nombre}`, async ({ page }) => {
      await abrir(page, c.pantalla);
      const camara = await abrirRedactor(page);
      await camara.setInputFiles(FOTOS[0]!);
      // Solo dentro del redactor: las tareas tienen sus propios «Quitar tarea: …».
      const quitar = page
        .locator('section[aria-label="Redactor"]')
        .getByRole('button', { name: /^Quitar/ });
      await expect(quitar).toHaveCount(1, { timeout: 15_000 });
      const borrado = page.waitForResponse(
        (r) => r.request().method() === 'DELETE' && /\/api\/archivos\/\d+$/.test(r.url()),
        { timeout: 5_000 },
      );
      await quitar.click();
      await borrado;
      await expect(quitar).toHaveCount(0);
    });
  }
});

test.describe('Escritorio intacto', () => {
  test('@escritorio ticket: panel a la derecha, sin plegables ni atajos, redactor estático', async ({
    page,
  }) => {
    await abrir(page, TICKET);
    await expect(page.locator('main details')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'En este ticket' })).toHaveCount(0);
    const aside = await page.locator('aside').first().boundingBox();
    expect(aside?.x ?? 0).toBeGreaterThanOrEqual(1000);
    expect(await redactorSticky(page)).toBe(false);
  });

  test('@escritorio OT: panel a la derecha, sin plegables ni atajos, redactor estático', async ({
    page,
  }) => {
    await abrir(page, OT);
    await expect(page.locator('main details')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'En esta OT' })).toHaveCount(0);
    const aside = await page.locator('aside[aria-label="Datos de la OT"]').boundingBox();
    expect(aside?.x ?? 0).toBeGreaterThanOrEqual(1000);
    expect(await redactorSticky(page)).toBe(false);
  });
});

async function redactorSticky(page: Page): Promise<boolean> {
  return page.locator('section[aria-label="Redactor"]').evaluate((el) => {
    for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).position === 'sticky') return true;
    }
    return false;
  });
}

// ADR 0011: las demás pantallas solo deben ser «usables» (0 desbordes del documento a 375 px).
const USABLES = [
  '/tickets',
  '/tickets/tabla',
  '/tickets/linea-de-tiempo',
  '/ots',
  '/horas',
  '/reportes',
  '/avisos',
  '/clientes',
  '/configuracion/equipo',
  '/ayuda/primeros-pasos',
];

test.describe('Pantallas usables a 375 px', () => {
  for (const ruta of USABLES) {
    test(`sin desborde del documento en ${ruta}`, async ({ page }) => {
      await ingresar(page, 'hikki');
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      const d = await desbordes(page);
      expect(d.documento, 'desborde del documento (px)').toBeLessThanOrEqual(0);
    });
  }
});

// ---- Fase 10 (spec §9): pantallas nuevas en axe, desborde y objetivos táctiles ----

const NUEVAS: { nombre: string; ruta: string; usuario: UsuarioSemilla }[] = [
  { nombre: 'Tabla de tickets', ruta: '/tickets/tabla', usuario: 'hikki' },
  { nombre: 'Tablero de tickets', ruta: '/tickets', usuario: 'hikki' },
  { nombre: 'OT', ruta: '/ots', usuario: 'hikki' },
  { nombre: 'Reportes', ruta: '/reportes', usuario: 'hikki' },
  { nombre: 'Equipo', ruta: '/configuracion/equipo', usuario: 'hikki' },
  { nombre: 'Avisos', ruta: '/avisos', usuario: 'hikki' },
  { nombre: 'Clientes', ruta: '/clientes', usuario: 'hikki' },
];

async function sinDesbordes(page: Page) {
  const d = await desbordes(page);
  expect(d.documento, 'desborde del documento (px)').toBeLessThanOrEqual(0);
  expect(d.elementos).toEqual([]);
}

for (const n of NUEVAS) {
  test.describe(`Rediseño: ${n.nombre} (${n.ruta})`, () => {
    test.beforeEach(async ({ page }) => {
      await ingresar(page, n.usuario);
      await page.goto(n.ruta);
      await page.waitForLoadState('networkidle');
    });

    test('@desborde sin desbordes', async ({ page }) => sinDesbordes(page));

    test('@axe sin violaciones serias ni críticas', async ({ page }) => {
      expect(await axe(page)).toEqual([]);
    });
  });
}

for (const ruta of ['/tickets/tabla', '/ots', '/avisos']) {
  test(`objetivos táctiles de 44 px en ${ruta}`, async ({ page }) => {
    await ingresar(page, 'hikki');
    await page.goto(ruta);
    await page.waitForLoadState('networkidle');
    expect(await objetivosChicos(page)).toEqual([]);
  });
}

test.describe('Rediseño: /ingresar (sin sesión)', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/ingresar');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /Ingresar/ }).first()).toBeVisible();
  });

  test('@desborde sin desbordes', async ({ page }) => sinDesbordes(page));

  test('@axe sin violaciones serias ni críticas', async ({ page }) => {
    expect(await axe(page)).toEqual([]);
  });
});

test.describe('Rediseño: diálogo «Convertir en OT»', () => {
  test.beforeEach(async ({ page }) => {
    await ingresar(page, 'hikki');
    // Un ticket abierto y sin OT: se busca en las semillas (los ids no son estables).
    const r = await page.request.get('/api/tickets?por_pagina=50');
    const { datos } = (await r.json()) as { datos: { id: number }[] };
    let abierto = false;
    for (const t of datos) {
      const d = (await (await page.request.get(`/api/tickets/${t.id}`)).json()) as {
        cerrado_en: string | null;
        ots: { etapa: string }[];
      };
      if (d.cerrado_en === null && d.ots.every((o) => o.etapa === 'cancelada')) {
        await page.goto(`/tickets/${t.id}`);
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Convertir en OT' }).first().click();
        abierto = true;
        break;
      }
    }
    expect(abierto, 'hay un ticket abierto sin OT en las semillas').toBe(true);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('@desborde sin desbordes', async ({ page }) => sinDesbordes(page));

  test('@axe sin violaciones serias ni críticas', async ({ page }) => {
    expect(await axe(page)).toEqual([]);
  });

  test('objetivos táctiles de 44 px', async ({ page }) => {
    expect(await objetivosChicos(page, '[role="dialog"]')).toEqual([]);
  });
});

test.describe('Rediseño: selector con búsqueda abierto (/tickets/nuevo)', () => {
  test.beforeEach(async ({ page }) => {
    await ingresar(page, 'hikki');
    await page.goto('/tickets/nuevo');
    await page.waitForLoadState('networkidle');
    await page.getByRole('combobox', { name: /^Categoría/ }).click();
    await expect(page.locator('[data-slot=popover-content]')).toBeVisible();
  });

  test('@desborde sin desbordes', async ({ page }) => sinDesbordes(page));

  test('@axe sin violaciones serias ni críticas', async ({ page }) => {
    expect(await axe(page)).toEqual([]);
  });
});

test.describe('Rediseño: franja de plazo y menú lateral', () => {
  test('la franja de plazo hábil', async ({ page }) => {
    await ingresar(page, 'crojas');
    await page.goto('/tickets/tabla');
    await page.waitForLoadState('networkidle');
    const fila = page.getByRole('row').filter({ hasText: 'TK-1048' }).first();
    const franja = fila.locator('[data-tono]').first();
    await expect(franja).toBeVisible();
    expect((await franja.innerText()).trim()).toMatch(/^(Quedan|Vence|Vencido|Resuelto)/);

    await page.goto(`/tickets/${await idDeTicket(page, 'TK-1048')}`);
    await page.waitForLoadState('networkidle');
    const ancha = page
      .locator('[data-tono]')
      .filter({ hasText: /^Resolución:/ })
      .first();
    await expect(ancha).toBeVisible();
  });

  test('@escritorio menú lateral claro', async ({ page }) => {
    await ingresar(page, 'crojas');
    await page.goto('/mi-dia');
    await page.waitForLoadState('networkidle');
    const nav = page.locator('nav[aria-label="Principal"]');
    const fondoNav = await nav.evaluate((el) => getComputedStyle(el).backgroundColor);
    const fondoBody = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fondoNav).toBe(fondoBody);
    const activo = nav.locator('a[aria-current="page"]');
    await expect(activo).toHaveCount(1);
    expect(await activo.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(47, 71, 196)');
    expect(await activo.evaluate((el) => getComputedStyle(el, '::before').width)).toBe('2px');
  });

  test('@escritorio sin sombras en reposo', async ({ page }) => {
    await ingresar(page, 'crojas');
    await page.goto('/tickets/tabla');
    await page.waitForLoadState('networkidle');
    const conSombra = await page.evaluate(() => {
      const EXCEPTO =
        '[role=dialog], [data-slot=popover-content], [data-slot=dropdown-menu-content], [data-slot=select-content], [data-slot=sheet-content]';
      const lista: string[] = [];
      for (const el of document.body.querySelectorAll('*')) {
        if (el.closest(EXCEPTO)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        if (st.boxShadow !== 'none') {
          lista.push(
            `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 3).join('.')}`,
          );
        }
      }
      return lista.slice(0, 30);
    });
    expect(conSombra).toEqual([]);
  });
});
