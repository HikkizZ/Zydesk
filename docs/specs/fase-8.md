# Fase 8 — Móvil · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §1 (revisión de seguridad al cierre) y §4 Fase 8 («Pulido móvil de Mi día, detalle de ticket, seguimiento con fotos y OT»); spec funcional §7 («"Mi día", el detalle de ticket, el seguimiento con fotos y la OT deben funcionar en celular para el personal en terreno»), §4.3 («"Subir fotos" abre la cámara en celular»), §5 pantallas **5**, **6** y **8**; ADR **0011** (objetivos táctiles ≥ 44 px, 40 px en escritorio con área ampliada; estado nunca solo por color; mobile-first en las cuatro pantallas de terreno; «el detalle de ticket y la OT apilan el panel derecho debajo del contenido; el redactor queda fijo al pie con la cámara a un toque»; test de contraste con `axe` en Playwright sobre 3 pantallas, **nunca implementado**), **0019** (barra inferior de 5 accesos y panel «Más»; «cada acceso de la barra y cada entrada del panel miden ≥ 44 px»; axe móvil a 390 × 844), **0009** (`<input type="file" accept="image/*" capture="environment" multiple>`; compresión en el cliente a 2000 px y calidad 0,8 con `browser-image-compression`; 20 MB por archivo, 10 por petición; MIME verificado por contenido, `image/heic` permitido; miniaturas = la misma imagen con `object-fit`), **0012** («capturas reales (`docs/manual-usuario/img/`) tomadas de la app con datos de semilla ficticios»; «las capturas envejecen; se renuevan por fase»; ayuda dentro de la app desde los mismos `.md`), 0018 (manuales en `docs/manuales/`), 0021, 0022 (tablero de solo lectura: no se toca), 0027 (puntos 22 «Mi día con cuadros 2×2 bajo 1024 px», 35, 42; §27 de la spec de la Fase 6: manuales importados con `?raw`, `remark-gfm`, «las capturas quedan para la Fase 8»), 0028 (punto 26: 390 px sin scroll horizontal en Reportes); `docs/CHANGELOG.md` «Pendientes de la Fase 6»: «Las capturas de pantalla de los manuales (`docs/manuales/img/`) y cómo llegan a la ayuda dentro de la app: Fase 8»; `preguntas-abiertas.md` 7 y 8; **auditoría real del 2026-10-05 a 375 × 812** (cuenta de Administración local, semillas; resumen en §3.1); diseño `docs/especificacion/diseno/` (**no contiene versiones móviles**: el HTML de referencia está hecho a 1440 px sin `@media`; lo móvil lo fijan ADR 0011/0019, la auditoría y esta spec).
>
> Rama `feat/fase-8-movil` desde `main` (Fases 0–7 integradas); PR a `main` al cerrar con CI verde (ADR 0020) tras la revisión de seguridad de PLAN §1. **Fase solo de `apps/web` y `docs/`**: no toca `apps/api`, `packages/shared`, `apps/bot`, migraciones ni `openapi.json` (`npm run api:openapi` debe dejar `git diff --exit-code docs/api/openapi.json` sin cambios). Todo lo construido (`Button` con `h-11 lg:h-10`, `Input` `h-11 lg:h-10` y `text-base md:text-sm`, `Textarea` `text-base md:text-sm`, `Sheet`, `Tabs`, `useVistaTarjetas`, `SubidaArchivos` con `prepararArchivo`, `Redactor` con `destino`, `ListaTareas`, `GaleriaArchivos`, `TarjetaConteo`, `MarkdownManual`, `manuales.ts`, `ConSesion`, `simularFetch`, `yoDePrueba`) **se reutiliza y se ajusta**; no se reescribe ninguna pantalla. Convenciones de `CLAUDE.md`: español, `camelCase` en TypeScript, cambios quirúrgicos (cada línea cambiada responde a un criterio de §3), sin `any`, sin `console.*`, procesos de desarrollo detenidos con `taskkill /PID <pid> /T /F`.

## 0. Alcance

**Entra**: (a) **base móvil** compartida: hook `useMediaQuery` (`useEsMovil` bajo 1024 px), `viewport-fit=cover` y área segura de iOS en la barra inferior, diálogos que no superan la altura de la pantalla, casillas con área táctil de 44 px (`CasillaTactil`), enlaces en línea con área ampliada, pie legal tocable; (b) **Mi día** (pantalla 8): objetivos táctiles de las listas y enlaces; (c) **detalle de ticket** (pantalla 5): bajo 1024 px el panel de datos (estado, prioridad, responsables, seguidores, cliente, categoría, fechas, OT vinculadas) pasa **arriba, plegado** (`<details>`), el resto se reordena (Descripción → Tareas → Actividad → redactor → Correo original → Archivos), fila de **atajos** a las secciones, y el **redactor se pliega** en una barra fija de una fila con «Escribir seguimiento» y cámara a un toque; (d) **OT** (pantalla 6): «Tipo y datos» plegado y al final bajo 1024 px, atajos a las secciones, etapa actual a la vista, enlaces del panel tocables, mismo redactor plegable; (e) **seguimiento con fotos** desde el celular: vista previa inmediata de cada foto (objeto local) mientras sube, estado por archivo (subiendo · lista · error con **Reintentar**), contador «2 de 3 fotos subidas», quitar antes de enviar, fotos HEIC no renderizables con ícono en vez de imagen rota, sin cambiar límites ni compresión (ADR 0009); (f) **auditoría automatizada** con Playwright + axe (`npm run test:movil`, Chromium, 320 / 375 / 1440 px) que mide desbordes, objetivos táctiles, tamaño de letra, posición de secciones y accesibilidad, y corre en CI; (g) **capturas de los manuales**: script reproducible `npm run docs:capturas` (Playwright, semillas) que deja PNG en `docs/manuales/img/<manual>/`, referencias `![alt](…)` en los `.md`, y el componente `img` de la ayuda que sirve esas imágenes desde el bundle (`import.meta.glob … ?url`); (h) manuales, CHANGELOG, README, `CLAUDE.md`, ADR 0029; revisión de seguridad acotada a lo que cambia (PLAN §1).

**No entra**: funciones de negocio nuevas (nada en la API, en `shared` ni en el bot); PWA, modo sin conexión, notificaciones push, instalación en pantalla de inicio (no las pide la spec; si el usuario las quiere, son una fase aparte); arrastrar en el Tablero (ADR 0022); optimizar Tablero, Tabla, Línea de tiempo, Cotizador, Reportes, Configuración o Clientes más allá de «usable» (ADR 0011; la auditoría solo exige **0 desbordes** en ellas, §3.2.1); progreso de subida en bytes (`fetch` no lo expone; §15.9); cancelar una subida en curso; edición o recorte de fotos; miniaturas generadas en el servidor (ADR 0009); modo oscuro; `prefers-reduced-motion` (no hay animaciones propias); captura de pantalla automática de Telegram (el manual del bot queda sin imágenes, §10.3); WebP o AVIF para las capturas (§15.12); pruebas en iOS Safari real o teclado virtual (quedan como verificación manual, §14.3).

## 1. Bloques y paralelismo

| Bloque                             | Contenido                                                                                                                                                                                                                                                                  | Depende de                                                                | Archivos que toca (exclusivos)                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **8A** Herramientas y base móvil   | Playwright + axe, `playwright.config.ts`, `e2e/auditoria.ts`, `e2e/movil.spec.ts` (primera versión, en rojo), `preview.proxy`, paso de CI; `useMediaQuery`/`useEsMovil`, `CasillaTactil`, `index.html`, `Layout`, `BarraInferior`, `Pie`, `dialog.tsx`, `alert-dialog.tsx` | —                                                                         | `package.json` (raíz), `package-lock.json`, `apps/web/package.json`, `apps/web/playwright.config.ts`, `apps/web/e2e/**`, `apps/web/vite.config.ts`, `apps/web/index.html`, `apps/web/src/lib/useMediaQuery.ts`, `apps/web/src/features/cotizador/useVistaTarjetas.ts`, `apps/web/src/components/dominio/CasillaTactil.tsx`, `apps/web/src/components/ui/{dialog,alert-dialog}.tsx`, `apps/web/src/app/layout/**`, `.github/workflows/ci.yml` |
| **8B** Mi día y listas compartidas | `features/mi-dia/**`, `ListaTareas`, `GaleriaArchivos`, `ActividadLista`, `Avatar`                                                                                                                                                                                         | 8A (`CasillaTactil`)                                                      | `apps/web/src/features/mi-dia/**`, `apps/web/src/components/dominio/{ListaTareas,ListaTareas.test,Avatar}.tsx`, `apps/web/src/features/tickets/components/{GaleriaArchivos,ActividadLista}.tsx`                                                                                                                                                                                                                                              |
| **8C** Detalle de ticket           | `TicketDetallePage`, `PanelTicket`, `AtajosSecciones` (nuevo, compartido con 8D: lo crea 8C)                                                                                                                                                                               | 8A (`useEsMovil`); 8E solo para el último paso (§6.5)                     | `apps/web/src/features/tickets/pages/TicketDetallePage*.tsx`, `apps/web/src/features/tickets/components/PanelTicket.tsx`, `apps/web/src/components/dominio/AtajosSecciones*.tsx`                                                                                                                                                                                                                                                             |
| **8D** OT                          | `OtDetallePage`, `DatosOt`, `PanelOt`, `AccionesOt`, `Etapas`                                                                                                                                                                                                              | 8A; 8C (`AtajosSecciones`); 8E solo para el último paso (§7.5)            | `apps/web/src/features/ots/**`, `apps/web/src/components/dominio/Etapas*.tsx`                                                                                                                                                                                                                                                                                                                                                                |
| **8E** Fotos y redactor plegable   | `SubidaArchivos`, `Redactor`, `RedactorPlegable` (nuevo)                                                                                                                                                                                                                   | 8A (`CasillaTactil`, `useEsMovil`)                                        | `apps/web/src/components/dominio/{SubidaArchivos,SubidaArchivos.test,Redactor,Redactor.test,RedactorPlegable,RedactorPlegable.test}.tsx`, `apps/web/src/test/archivos.ts` (nuevo)                                                                                                                                                                                                                                                            |
| **8F** Capturas y ayuda            | `features/ayuda/**` (componente `img`, resolución de rutas), `e2e/capturas.ts`, `docs/manuales/img/**`, referencias en los `.md`                                                                                                                                           | 8A (Playwright); las capturas se toman **al final**, con 8B–8E integrados | `apps/web/src/features/ayuda/**`, `apps/web/e2e/capturas.ts`, `docs/manuales/**`                                                                                                                                                                                                                                                                                                                                                             |
| **8G** Documentación y cierre      | CHANGELOG, README, `CLAUDE.md`, ADR 0029, `docs/decisiones/README.md`, texto de los manuales                                                                                                                                                                               | todo                                                                      | `docs/CHANGELOG.md`, `docs/decisiones/**`, `README.md`, `CLAUDE.md` (y `docs/manuales/*.md` en coordinación con 8F)                                                                                                                                                                                                                                                                                                                          |

**En paralelo sin conflicto**: tras 8A, **8B, 8C, 8D y 8E** a la vez (archivos disjuntos; 8D espera a que 8C publique `AtajosSecciones`, un componente de 30 líneas que 8C hace primero). 8C y 8D terminan con un paso de dos líneas que reemplaza su envoltorio `sticky` por `RedactorPlegable` (§6.5, §7.5): se hace cuando 8E está en `main` de la rama; hasta entonces, las páginas conservan el envoltorio actual y sus tests siguen verdes. 8F puede escribir el componente `img` y sus tests desde el principio; las capturas se toman después de 8B–8E. Orden general en §13.

### 1.1 Base de test por bloque

Esta fase **no toca la API**: ningún bloque usa Postgres en sus tests unitarios (`vitest` de `apps/web` es jsdom). La suite Playwright (§9) sí necesita API + Postgres con semillas; corre contra `zydesk` de desarrollo (`npm run db:reiniciar` antes) y en CI contra la base del workflow. No hay sufijos de BD que coordinar.

### 1.2 Orden de bloqueo de filas

No aplica: no hay escrituras nuevas. Las subidas de fotos y los mensajes siguen usando `POST /api/archivos` y `POST /api/tickets/:id/mensajes` / `POST /api/ots/:id/mensajes` tal como están.

## 2. Versiones nuevas (solo `devDependencies`)

- **`@playwright/test`** (Apache-2.0) en la raíz del monorepo, última `1.x`; solo el navegador **Chromium** (`npx playwright install chromium`; en CI `--with-deps`). Motivo en §15.1; pregunta §16.1. Se anota la versión exacta en §18.
- **`@axe-core/playwright`** (MPL-2.0; solo en desarrollo y CI, no se distribuye) última `4.x`. Cumple la promesa de ADR 0011 y 0019 (axe sobre las pantallas móviles).
- Sin paquetes nuevos en `dependencies` de `apps/web`: `browser-image-compression` ya está; no se agrega ninguna librería de carrusel, lightbox ni gestos. Sin componentes shadcn nuevos (`details`/`summary` nativos para plegar, como ya hace `AyudaPage`). Si al implementar hace falta otro paquete, **detente y pregunta**.

## 3. Definiciones y criterios medibles (valen para toda la fase)

### 3.1 Punto de partida (auditoría 2026-10-05, 375 × 812, semillas)

| Pantalla      | Alto total | Desborde | Hallazgos                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/mi-dia`     | 880 px     | no       | Enlace del asunto en Vencidos 302 × 24; pie «Términos de uso» 103 × 18 y «Privacidad» 65 × 18; casillas de «Tus tareas» 20 × 20.                                                                                                                                                                                                                                       |
| `/tickets/14` | 4 490 px   | no       | Orden: título · acciones · Descripción · Correo · Archivos · Tareas (casillas 20 × 20) · Actividad · redactor completo `sticky` (340 px de alto; enlace «Horas» 37 × 18) · **panel de datos desde ~3 100 px** (estado, prioridad, responsables, cliente 103 × 18) · OT vinculadas a 4 107 px. Iniciales de avatar a 8–10 px (decorativas).                             |
| `/ots/6`      | 5 918 px   | no       | Orden: título · enlace TK 59 × 18 · acciones · **«Tipo y datos» de 404 a 1 549 px** (casilla 20 × 20) · Tareas (inputs de horas 64 × 36) · Fotos y archivos · Actividad · redactor · Cotización a 4 340 · Aprobación 4 617 · Facturación 4 771 · Ticket de origen (enlace 20 px) · Horas («Ver en la planilla» 20 px) · Datos · Historial. 28 de 78 controles < 44 px. |

No se probó: cámara real, teclado virtual sobre el redactor fijo, iOS Safari.

### 3.2 Criterios (medidos por `e2e/movil.spec.ts`, §9; los de jsdom en cada sección)

Un **control interactivo** es todo elemento visible que coincide con `a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=checkbox], [role=switch], [role=tab], [role=option], [role=menuitem], [role=link], label[for]`, descartando los que tienen la clase `sr-only`, `aria-hidden="true"` o caja de 0 × 0. Su **área táctil** es la caja de **él mismo o de su `label` envolvente más cercano** (lo que sea mayor en cada eje): así una casilla de 20 px dentro de un `label` de 44 × 44 cumple.

1. **Desbordes**: en **320 × 568**, **375 × 812** y **1440 × 900**, `document.documentElement.scrollWidth === clientWidth` y ningún elemento visible con `getBoundingClientRect().right > innerWidth + 1` en: `/mi-dia`, `/tickets/:id` (TK-1048), `/ots/:id` (OT-0218), el panel «Más» abierto, el diálogo «Cambiar estado» y el diálogo «Cerrar OT…» abiertos; y, **solo a 375 px y solo desbordes**, `/tickets`, `/tickets/tabla`, `/tickets/linea-de-tiempo`, `/ots`, `/horas`, `/reportes`, `/avisos`, `/clientes`, `/configuracion/equipo`, `/ayuda/primeros-pasos` (ADR 0011: «usable»; se admite scroll horizontal **interno** de un contenedor con `overflow-x-auto`, no del documento).
2. **Objetivos táctiles** (bajo 1024 px): todo control interactivo de las tres pantallas de terreno, del panel «Más» y de los dos diálogos tiene área táctil **≥ 44 × 44 px**, salvo las **excepciones declaradas en el DOM** con `data-objetivo`:
   - `data-objetivo="en-linea"`: enlace dentro de una frase (párrafo o `<p>` de ayuda). Debe medir **≥ 24 px de alto** (WCAG 2.5.8) con `py-1 -my-1` o equivalente, sin romper la línea. Instancias permitidas: «Horas» en el texto de ayuda del redactor; «Ver todos» no es excepción (pasa a bloque, §5). Máximo **3** instancias por pantalla.
   - `data-objetivo="cubre-tarjeta"`: enlace cuyo pseudo-elemento `after:absolute after:inset-0` cubre la tarjeta entera (`TarjetaTicketBreve`). Playwright verifica que un clic en el relleno de la tarjeta (10 px bajo el borde superior) navega al detalle.
   - Decorativos sin interacción (avatares, pills, íconos) no son controles y no se miden.
     El test lista cada control que falla con su selector, su caja y la pantalla; **0 fallos**.
3. **Letra**: ningún elemento con texto propio visible tiene `font-size` computado **< 12 px**, salvo los que están dentro de `[aria-hidden="true"]` (iniciales de `Avatar`) o llevan `data-letra="insignia"` (contador de no leídos `InsigniaAvisos`, 10 px, con `aria-label`). Las etiquetas «en seguimiento del 29 sep» y los tamaños de archivo pasan de `text-[11px]` a `text-xs` (12 px).
4. **Posición vertical a 375 px** (coordenada `y` del documento = `boundingBox().y + scrollY`, con las semillas y la cuenta `crojas`):
   - Ticket TK-1048: `summary` «Datos del ticket» ≤ **600 px**; encabezado «Tareas» ≤ **1 500 px**; alto total del documento ≤ **4 000 px** (con el panel plegado y el redactor plegado).
   - OT OT-0218: encabezado «Tareas» ≤ **750 px** (Etapas y atajos antes); alto total ≤ **4 900 px** (con «Tipo y datos» plegado); cada atajo de la fila «En esta OT» lleva su sección a la vista: tras el clic, el `top` del encabezado destino queda entre **0 y 120 px** del borde superior de la ventana.
   - Mi día: sin cambio de orden; alto ≤ 1 000 px con las semillas de `crojas`.
5. **Diálogos** a **375 × 667**: `DialogContent` y `AlertDialogContent` miden ≤ `innerHeight − 32` px y tienen scroll interno; el botón de confirmar es alcanzable sin que la página de fondo se desplace.
6. **Barra inferior**: a 375 px, `nav[aria-label="Principal (móvil)"]` mide ≥ 56 px de alto, sus cinco accesos ≥ 44 px (ADR 0019) y `padding-bottom` computado = `env(safe-area-inset-bottom)` (en Chromium de escritorio vale 0; se afirma la **clase** `pb-[env(safe-area-inset-bottom)]` y, en jsdom, su presencia).
7. **Fotos** (Playwright, `sdiaz`, OT-0218 y TK-1048, a 375 px): el `input` de cámara existe con `accept="image/*"`, `capture="environment"` y `multiple`; al fijarle tres JPG de prueba (`e2e/fixtures/foto-{1,2,3}.jpg`, 1600 × 1200, ~150 KB cada uno), aparecen **tres vistas previas** (`img[src^="blob:"]`) antes de 1 s, el contador llega a «3 de 3 fotos subidas» antes de 15 s, al pulsar «Registrar seguimiento» el mensaje queda en Actividad con tres imágenes y cada `archivo.tamano` devuelto por la API es **≤ 600 KB** (compresión de ADR 0009 aplicada). «Quitar» sobre una vista previa la saca de la lista y llama a `DELETE /api/archivos/:id`.
8. **Accesibilidad**: `axe` (`wcag2a`, `wcag2aa`) sin violaciones `serious` ni `critical` en `/mi-dia`, `/tickets/:id`, `/ots/:id` a 375 y 1440 px y en el panel «Más» abierto a 375 px (ADR 0011 y 0019). Las violaciones `moderate`/`minor` se listan en el informe y se anotan en ADR 0029 si no se corrigen.
9. **Escritorio intacto** (1440 px): no hay `details` plegable en las dos páginas de detalle (`useEsMovil()` falso → se renderiza el panel plano), el `aside` del panel está a la derecha (`boundingBox().x ≥ 1 000`), el redactor es estático (no `sticky`) y la fila de atajos no se monta. jsdom: sin `matchMedia` estos componentes se comportan como escritorio, y los tests actuales de `TicketDetallePage`, `OtDetallePage` y `MiDiaPage` **siguen verdes sin cambios** salvo los que se amplían en esta spec.
10. **Capturas**: cada PNG de `docs/manuales/img/` pesa ≤ **350 KB**; la carpeta completa ≤ **10 MB**; toda `![alt](ruta)` de los manuales tiene `alt` no vacío y apunta a un archivo existente (test jsdom sobre los `.md` crudos, §10.4); la ayuda renderiza cada imagen con `src` del bundle y `loading="lazy"`.

## 4. Base móvil (bloque 8A)

### 4.1 `useMediaQuery` y `useEsMovil` (`apps/web/src/lib/useMediaQuery.ts`)

```ts
export function useMediaQuery(consulta: string): boolean; // useSyncExternalStore; sin matchMedia (jsdom) → false
export const CONSULTA_MOVIL = '(max-width: 1023.98px)'; // bajo `lg`, el mismo corte que la barra inferior (ADR 0019)
export const useEsMovil = () => useMediaQuery(CONSULTA_MOVIL);
```

`useVistaTarjetas` (cotizador y Mi día, 767,98 px) pasa a `return useMediaQuery('(max-width: 767.98px)')` sin cambiar su contrato ni su archivo. Test `useMediaQuery.test.ts`: sin `matchMedia` → `false`; con `matchMedia` simulado (`matches: true` + `addEventListener`) → `true` y reacciona al evento `change`. **Los tests que necesiten «móvil» en jsdom** usan el helper `simularMovil()` de `src/test/pantalla.ts` (nuevo, 8A): instala `window.matchMedia` que responde `matches` según la consulta (`max-width: 1023.98px` → `true`; `767.98px` → según parámetro) y lo retira en `afterEach`.

### 4.2 `CasillaTactil` (`components/dominio/CasillaTactil.tsx`)

Envuelve el `Checkbox` de shadcn en un `<label>` de **44 × 44 px** (`inline-flex size-11 shrink-0 items-center justify-center lg:size-9`) con `htmlFor` al `id` de la casilla; la casilla visible sigue en `size-5` (20 px). Props: `id`, `checked`, `disabled`, `onCheckedChange`, `aria-label` (obligatorio cuando no hay texto visible asociado; se pasa al `Checkbox`, no al `label`). Lo usan: `ListaTareas` (8B), `ListaTareasMiDia` (8B), `DatosOt` «Descuenta de la bolsa» (8D) y `Redactor` «Copiar al ticket» (8E). Las casillas de formularios de Configuración y del cotizador **no cambian** (fuera de las pantallas de terreno). Test: el `label` mide (clases) 44 y el clic en el `label` dispara `onCheckedChange`.

### 4.3 Área segura, diálogos, pie y enlaces en línea

- `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`.
- `BarraInferior`: `nav` gana `pb-[env(safe-area-inset-bottom)]`; `Layout` `main` pasa de `pb-24` a `pb-[calc(6rem+env(safe-area-inset-bottom))]` bajo `lg` para que el pie no quede bajo la barra en iPhone.
- `dialog.tsx` y `alert-dialog.tsx`: el `Content` gana `max-h-[calc(100dvh-2rem)] overflow-y-auto` (una clase; sin cambiar tamaños en escritorio). `sheet.tsx` no cambia (ya tiene 85 dvh y scroll).
- `Pie`: los dos enlaces pasan a `inline-flex min-h-11 items-center lg:min-h-0` (el pie tiene espacio; no es texto corrido).
- **Enlace en línea**: clase utilitaria documentada en `CLAUDE.md` §2, no un componente: `relative inline-block py-1 -my-1` + `data-objetivo="en-linea"`. Solo para enlaces dentro de una frase; cualquier otro enlace se vuelve bloque o botón de ≥ 44 px.
- `InsigniaAvisos` gana `data-letra="insignia"` (sin cambio visual).

## 5. Mi día (bloque 8B, pantalla 8)

Orden, cuadros 2 × 2 y secciones **no cambian** (ADR 0027.22). Cambios:

1. `ListaTareasMiDia`: casilla con `CasillaTactil`; la fila pasa a `min-h-14` bajo `lg` (`lg:min-h-11`) para que el texto y la fecha no queden a 20 px del borde táctil.
2. `TarjetaTicketBreve`: el enlace del asunto gana `data-objetivo="cubre-tarjeta"`; sin otro cambio (el `after:inset-0` ya cubre la tarjeta).
3. «Ver todos» (menciones) y «Revisar» (por aprobar) ya son `Button size="sm"` o enlace: «Ver todos» pasa a `Button asChild variant="link"` con `min-h-11 px-0 lg:min-h-0` (bloque, no excepción).
4. `TarjetaConteo` sin cambios (94 px de alto medidos).

Tests jsdom (`MiDiaPage.test.tsx`, ampliado): la casilla de «Tus tareas» está dentro de un `label` con `htmlFor`; pulsar el `label` llama a `PATCH /api/tareas/:id` con `{ hecha: true }`; el enlace del asunto tiene `data-objetivo="cubre-tarjeta"`; «Ver todos» no tiene `data-objetivo`.

## 6. Detalle de ticket (bloque 8C, pantalla 5)

### 6.1 Orden bajo 1024 px

```
header (código, asunto, pills, Cambiar estado / Editar / Convertir)      ← sin cambios
AtajosSecciones  «Datos · Descripción · Tareas · Actividad · Archivos»   ← nuevo, solo móvil
[aviso de cerrado/archivado, si corresponde]
Datos del ticket  <details> plegado: summary = «Datos del ticket · Viña Santa Clara · 2 responsables»
Descripción
Tareas
Actividad (pestañas)
RedactorPlegable (fijo al pie, §8.3)                                      ← 8E
Correo original (si hay)
Archivos del ticket
```

En `lg` y más: **idéntico a hoy** (dos columnas, panel a la derecha plano, redactor estático bajo la actividad, sin atajos ni `details`).

**Cómo**: el contenedor `div.mt-4.grid` pasa a ser el padre directo de **todas** las secciones (se elimina el `div.flex.min-w-0.flex-col.gap-4` intermedio): `grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start`; cada sección de la columna principal lleva `min-w-0 lg:col-start-1`; el panel lleva `lg:col-start-2 lg:row-start-1 lg:row-span-12`. Bajo `lg` el orden se fija con `order-N lg:order-none` en cada hijo: aviso de cerrado `order-1`, panel `order-2`, Descripción `order-3`, Tareas `order-4`, Actividad `order-5`, redactor `order-6`, Correo `order-7`, Archivos `order-8`. El orden del DOM **no** cambia (escritorio y lectores de pantalla leen como hoy); es solo visual bajo `lg`. Decisión §15.4.

### 6.2 `AtajosSecciones` (`components/dominio/AtajosSecciones.tsx`, lo crea 8C, lo usa 8D)

`nav aria-label={etiqueta}` (`«En este ticket»` / `«En esta OT»`), `lg:hidden`, `flex gap-2 overflow-x-auto pb-1 -mx-6 px-6`; un `<a href="#id">` por sección con `inline-flex min-h-11 shrink-0 items-center rounded-full border border-borde bg-superficie px-3 text-sm` (chip ≥ 44 px). Props: `secciones: { id: string; etiqueta: string }[]`. Cada sección destino lleva `id` y `scroll-mt-4` (el `header` no es fijo, así que basta). Solo se renderiza cuando `useEsMovil()` (no se monta en escritorio). Test jsdom: con `simularMovil()` hay un `nav` con N enlaces en el orden dado y `href="#tareas"`; sin móvil no se monta.

### 6.3 Panel de datos plegado (`PanelTicket`)

`PanelTicket` gana la prop `plegable?: boolean` (la página pasa `useEsMovil()`). Con `plegable`:

- Se envuelve en `<details className="rounded-lg border border-borde bg-superficie">` **cerrado por defecto**, con `<summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 font-titulo text-base font-semibold">` que muestra: «Datos del ticket», `·`, nombre del cliente (o «Sin cliente»), `·`, `Avatares` de los responsables (o «Sin responsable» en `text-alta`). Un ícono `ChevronDown` rota con `group-open:rotate-180` (estado también en texto: el `summary` lleva `aria-label` «Datos del ticket, plegado/desplegado» no; el `details` nativo expone `open` y basta).
- El contenido es el panel actual completo (estado con «Cambiar», prioridad, responsables, seguidores, solicitante, cliente, categoría, fechas, horas estimadas, primera respuesta y la sección **OT vinculadas** con «Crear otra OT»).
- El estado abierto/cerrado **no** va a la URL ni a `localStorage` (al recargar vuelve plegado; decisión §15.5).
- El enlace al cliente (`Viña Santa Clara`, 103 × 18) pasa a `inline-flex min-h-11 items-center lg:min-h-0` (bloque dentro de su `dd`); los botones «Cambiar», «Editar» de responsables/seguidores ya son `Button size="sm"` (44 px en móvil).

Sin `plegable` (escritorio y jsdom por defecto): se renderiza exactamente como hoy.

Tests jsdom (`TicketDetallePage.test.tsx`, ampliado): con `simularMovil()`, existe `details` cuyo `summary` contiene «Datos del ticket» y el nombre del cliente y está cerrado (`open` ausente); dentro hay el botón «Cambiar» y la sección «OT vinculadas»; el `nav` «En este ticket» lista Datos, Descripción, Tareas, Actividad, Archivos (Correo solo si `t.correo`); sin `simularMovil()` no hay `details` ni `nav` y el test actual del panel sigue igual.

### 6.4 Tareas (`ListaTareas`, bloque 8B, compartido con la OT)

- Casilla con `CasillaTactil` (`id` = `tarea-${t.id}`); el botón «Quitar» ya mide 44 (`icon-sm`).
- Formulario de alta bajo `sm`: campos a ancho completo apilados (`w-full sm:w-44`, etc.) y «Agregar» a ancho completo (`w-full sm:w-auto`), para no dejar un `Input` de 36 px de ancho a 320 px.
- Inputs de horas (`CampoHoras`): `h-11 w-20 lg:h-9 lg:w-[72px]`; la cabecera «Est. / Real / Reg.» sigue solo en `sm` y más.
- Test (`ListaTareas.test.tsx`): la casilla está dentro de un `label[for]`; el input de horas estimadas tiene las clases `h-11` y `lg:h-9`.

### 6.5 Último paso de 8C (cuando 8E esté listo)

Reemplazar el `div.sticky.bottom-14…` por `<RedactorPlegable ticketId={t.id} />` (mismas props que hoy recibe `Redactor`). `RedactorPlegable` trae su propio envoltorio (§8.3). El test de la página comprueba que, sin móvil, el redactor completo sigue presente (`section[aria-label="Redactor"]`).

## 7. Orden de trabajo (bloque 8D, pantalla 6)

### 7.1 Orden bajo 1024 px

```
header (código, título, tipo, etapa, facturación, Ticket TK-1048, responsable, término) + AccionesOt   ← enlace TK ≥ 44 px
AtajosSecciones «Etapas · Tareas · Fotos · Actividad · Cotización · Aprobación · Horas · Datos»
Etapas (con la etapa actual a la vista)
Tareas (con horas)
Fotos y archivos
Actividad
RedactorPlegable                                                        ← 8E
Panel: Cotización / Costo interno · Aprobación · Facturación · Ticket de origen · Horas · Datos · Historial
Tipo y datos  <details> plegado (abierto por defecto solo en Borrador)
```

En `lg`: idéntico a hoy («Tipo y datos» segundo, plano; panel a la derecha). Misma técnica que §6.1: grid aplanado, `lg:col-start-1` / panel `lg:col-start-2 lg:row-start-1 lg:row-span-12`, y bajo `lg` `order-N`: Etapas 1, Tareas 2, Fotos 3, Actividad 4, redactor 5, panel 6, «Tipo y datos» `order-last`. El panel de la OT se queda debajo del contenido (ADR 0011) porque lo que el técnico hace en terreno es tareas, fotos y seguimiento; lo comercial se alcanza en un toque por los atajos (decisión §15.6).

### 7.2 «Tipo y datos» (`DatosOt`)

Gana `plegable?: boolean` (la página pasa `useEsMovil()`). Con `plegable`, la tarjeta se envuelve en `<details open={ot.etapa === 'borrador'}>` (**sin control React** del `open`: el atributo inicial lo fija la etapa y después manda el usuario) con `summary` «Tipo y datos · Facturable · Viña Santa Clara» (tipo y cliente/solicitante actuales; `min-h-11`). El formulario interior no cambia; la casilla «Descuenta de la bolsa» usa `CasillaTactil`. Test: con `simularMovil()` y `etapa: 'en_ejecucion'` el `details` está cerrado y el `summary` muestra el tipo; con `etapa: 'borrador'` está abierto; sin móvil no hay `details`.

### 7.3 Etapas, header y panel

- `Etapas`: al montar y al cambiar `ot.etapa`, el `li[aria-current="step"]` hace `scrollIntoView({ inline: 'center', block: 'nearest' })` dentro del `ol` (guardado con `?.` como en las páginas; jsdom no lo implementa). Test: con `scrollIntoView` espiado, se llama una vez con `inline: 'center'`.
- Header: el enlace `TK-1048` pasa a `inline-flex min-h-11 items-center lg:min-h-0` (no es texto corrido). «Sin responsable técnico» y «Termina …» son texto.
- `PanelOt`: cada `Tarjeta` del panel gana `id` (`cotizacion`, `aprobacion`, `facturacion`, `ticket-origen`, `horas`, `datos`, `historial`) y `scroll-mt-4`; los enlaces «Abrir cotizador», el código del ticket de origen y «Ver en la planilla» pasan a `Button asChild variant="link"` con `min-h-11 px-0 lg:min-h-0` (bloque); el botón «Ver historial completo» ya es `Button`.
- `AccionesOt`: sin cambios (botones de 44 px; `flex-wrap`).

### 7.4 Fotos y archivos (`GaleriaOt`, `GaleriaArchivos`)

- `GaleriaArchivos` (8B): etiqueta y tamaño en `text-xs`; las imágenes que el navegador **no puede decodificar** (HEIC en Chromium/Firefox) muestran el cuadro de documento (ícono + nombre + tamaño) mediante `onError` del `img` (`useState` por ítem: `fallo` → render de documento). Test: disparar `error` en el `img` cambia el ítem al modo documento con el nombre visible.
- `ActividadLista` (8B): mismo `onError`; la miniatura pasa de `size-16` a `size-20` bajo `lg` (`lg:size-16`), ≥ 44 px en ambos casos.
- `GaleriaOt`: «Subir fotos» / «Subir archivo» ya son botones de 44 px; con el nuevo `SubidaArchivos` (§8.1) las fotos subidas desde la galería muestran vista previa y estado igual que en el redactor.

### 7.5 Último paso de 8D

Reemplazar el envoltorio `sticky` por `<RedactorPlegable destino={{ tipo: 'ot', id: ot.id }} copiaAlTicket codigoTicket={ot.ticket.codigo} sinHoras={…} />`.

## 8. Seguimiento con fotos (bloque 8E)

### 8.1 `SubidaArchivos`

Comportamiento que **se conserva**: dos pasos de ADR 0009 (sube al elegir, asocia al enviar), compresión en `prepararArchivo` (2000 px, 0,8; HEIC/GIF/SVG sin tocar), tope de 10, mensajes de error por código, `input` de cámara con `accept="image/*" capture="environment" multiple`, `input` de archivos sin `capture`, `quitar` con `DELETE` y tolerancia al 404, zona de arrastre en escritorio.

Cambios:

1. **Estado por archivo** en lugar de dos listas (`subiendo` / `errores`): `items: ItemSubida[]` con `{ clave, nombre, estado: 'subiendo' | 'error', mensaje?, archivo: File, previa?: string }`. Los ya subidos siguen llegando por `archivos` (prop controlada). Al terminar bien, el ítem se quita de `items` y aparece en `archivos` (sin parpadeo: se hace en el mismo `onChange`).
2. **Vista previa inmediata**: para `archivo.type.startsWith('image/')` se crea `previa = URL.createObjectURL(archivo)` al encolar y se **revoca** (`URL.revokeObjectURL`) al quitar el ítem o al desmontar (`useEffect` de limpieza). HEIC: la vista previa fallará en Chromium → `onError` muestra el cuadro genérico con el nombre (igual que §7.4).
3. **Lista unificada** (`ul`, `aria-live="polite"` sobre el contador, no sobre toda la lista): cada fila muestra miniatura `size-16` (vista previa local o `archivo.url` del servidor), nombre truncado, y a la derecha: `Loader2` + «Subiendo…» · **«Reintentar»** (`Button size="sm" variant="outline"`, vuelve a `procesar([archivo])` con el mismo `File`) + «Quitar» (saca el ítem fallido sin llamar a la API) · **«Quitar»** (`icon-sm`, 44 px) para los ya subidos. El mensaje de error va bajo el nombre en `text-sm text-urgente` con `role="alert"`.
4. **Contador**: `<p aria-live="polite">` «2 de 3 fotos subidas» mientras hay ítems en curso (cuenta por lote: `total = archivos.length + items.length`), «Fotos listas» no se muestra (desaparece el contador). Con un solo archivo: «Subiendo 1 archivo…».
5. **Modo compacto en móvil**: los botones «Fotos» / «Archivo» pasan a `size="default"` bajo `lg` (ya miden 44 por `h-11`); sin cambio en escritorio.
6. Prop nueva `abrirCamaraAlMontar?: boolean`: si es `true`, en el primer `useEffect` hace `entradaCamara.current?.click()` (la usa `RedactorPlegable` cuando se abre con el botón de cámara, §8.3). En jsdom `click()` sobre un `input[type=file]` no abre nada; el test espía `HTMLInputElement.prototype.click`.

Tests (`SubidaArchivos.test.tsx`, ampliado; `src/test/archivos.ts` aporta `archivoDePrueba(nombre, tipo, bytes)` y un `simularFetch` que responde `POST /api/archivos` con `ArchivoDatos[]` y, opcionalmente, falla la N-ésima): (a) atributos del `input` de cámara; (b) al elegir dos imágenes aparecen dos `img[src^="blob:"]` (se simula `URL.createObjectURL` → `blob:prueba-N`) y el contador «0 de 2 fotos subidas» → «2 de 2 fotos subidas» → desaparece; (c) la segunda subida falla con `ARCHIVO_NO_PERMITIDO` → fila con «Tipo de archivo no permitido.» y botón «Reintentar»; pulsarlo repite el `POST` y la fila pasa a subida; (d) «Quitar» sobre un fallido no llama a `DELETE`; sobre uno subido sí; (e) `revokeObjectURL` se llama al quitar y al desmontar; (f) `abrirCamaraAlMontar` llama a `click()` del `input[capture]` una vez; (g) `prepararArchivo` no se invoca para HEIC (ya cubierto; se mantiene).

### 8.2 `Redactor`

- «Copiar al ticket» usa `CasillaTactil`.
- El enlace «Horas» del texto de ayuda lleva la clase de enlace en línea y `data-objetivo="en-linea"` (única excepción de ese tipo en las dos pantallas).
- Props nuevas: `autoEnfocar?: boolean` (hace `focus()` en el `textarea` al montar y `scrollIntoView({ block: 'center' })`, guardado con `?.`), `abrirCamaraAlMontar?: boolean` (se pasa a `SubidaArchivos`), `onCancelar?: () => void` (muestra un botón «Cancelar» `variant="ghost"` junto al de enviar; al pulsarlo con texto o archivos pendientes pide confirmación con `AlertDialog` «¿Descartar el seguimiento?» —los archivos ya subidos se quitan con `quitarArchivoPendiente` uno a uno, mejor esfuerzo—; sin nada escrito, cierra directo). `onEnviado` ya existe.
- Bajo `lg` el `textarea` crece a `rows={4}`; en escritorio sigue en 3.

### 8.3 `RedactorPlegable` (`components/dominio/RedactorPlegable.tsx`)

Props: las de `Redactor`. Comportamiento:

- **Escritorio** (`!useEsMovil()`): renderiza `<Redactor {...props} />` tal cual, sin envoltorio (lo que hoy hace `lg:static`).
- **Móvil**, estado `plegado` (inicial):
  ```
  <div class="sticky bottom-14 z-[5] -mx-6 border-t bg-fondo px-6 py-2 shadow-… pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
    <div role="group" aria-label="Redactor" class="flex gap-2">
      <Button class="flex-1 justify-start" variant="outline" onClick=abrir()>  <MessageSquarePlus/> Escribir seguimiento </Button>
      <Button size="icon" variant="outline" aria-label="Tomar foto" onClick=abrir({ camara: true })> <Camera/> </Button>
    </div>
  </div>
  ```
  Alto total ≈ 60 px (frente a 340 px hoy). «Escribir seguimiento» abre el redactor; «Tomar foto» lo abre **y** dispara la cámara (`abrirCamaraAlMontar`): la cámara queda a un toque (ADR 0011).
- **Móvil**, estado `abierto`: la barra fija desaparece y en su lugar (misma posición del DOM, **estático**, no `sticky`) se renderiza `<Redactor {...props} autoEnfocar abrirCamaraAlMontar={camara} onCancelar={cerrar} onEnviado={() => { cerrar(); props.onEnviado?.() }} />` dentro de un `div` con `scroll-mt-4`. Estático porque un `textarea` fijo al pie con el teclado virtual de iOS se tapa o salta (decisión §15.8); al abrirse, `autoEnfocar` lo centra en pantalla y el teclado lo sigue.
- Tras enviar, vuelve a `plegado` y la página hace lo de siempre (invalidar y `scrollIntoView` del último mensaje).
- El modo (Seguimiento / Nota interna) se elige dentro del redactor abierto, como hoy; la barra plegada no lo expone (decisión §15.8).

Tests (`RedactorPlegable.test.tsx`): sin móvil → `section[aria-label="Redactor"]` presente y ningún botón «Escribir seguimiento»; con `simularMovil()` → barra con «Escribir seguimiento» y «Tomar foto», sin `textarea`; pulsar «Escribir seguimiento» monta el `textarea` con foco y la barra desaparece; pulsar «Tomar foto» monta el redactor y llama a `click()` del `input[capture]`; «Cancelar» sin texto vuelve a la barra; con texto abre «¿Descartar el seguimiento?» y «Descartar» vuelve a la barra; tras `POST …/mensajes` exitoso vuelve a la barra y se llama `onEnviado`.

## 9. Auditoría automatizada (bloque 8A; `apps/web/e2e/`)

### 9.1 Configuración

- `apps/web/playwright.config.ts`: `testDir: 'e2e'`, `projects`: `movil-320` (viewport 320 × 568), `movil-375` (375 × 812, `isMobile: true`, `hasTouch: true`), `escritorio` (1440 × 900), todos Chromium; `timeout` 30 s por test; `retries: 0` local y `1` en CI; `reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/informe' }]]` (`e2e/informe/` y `test-results/` en `.gitignore`); `use.baseURL = 'http://localhost:4173'`.
- `webServer` (dos entradas; `reuseExistingServer: !process.env.CI`): `npm run start -w @zydesk/api` (espera `http://localhost:3010/api/salud`) y `npm run preview -w @zydesk/web -- --port 4173 --strictPort` (espera `http://localhost:4173`). `vite.config.ts` gana `preview: { port: 4173, proxy: { '/api': 'http://localhost:3010' } }` (mismo destino que `server.proxy`). La API se arranca con el `.env` de la raíz (`API_PUERTO=3010` por defecto); el script **no lee ni imprime** variables.
- Scripts: raíz `"test:movil": "npm run test:movil -w @zydesk/web"`, `"docs:capturas": "npm run docs:capturas -w @zydesk/web"`; web `"test:movil": "playwright test --project movil-320 --project movil-375 --project escritorio"`, `"docs:capturas": "playwright test e2e/capturas.ts --project escritorio --project movil-375"` (el archivo de capturas se excluye de `test:movil` con `testIgnore`). `npm test` **no** incluye Playwright (sigue siendo jsdom + API + bot).
- **Sesión**: `e2e/sesion.ts` → `ingresar(page, usuario)` hace `POST /api/auth/ingresar` por `page.request` con el correo de la semilla (`crojas@…`, `sdiaz@…`, los mismos que `desarrollo.test.ts`) y `process.env.SEMILLA_PASSWORD` (leída de `.env` con `dotenv` ya presente como dependencia transitiva; si no existe `dotenv`, se lee el archivo con `fs` y una expresión regular, sin agregar paquete), y guarda la cookie en el contexto. Nunca se registra la contraseña (ni en el informe HTML: `trace: 'off'`, `video: 'off'`, `screenshot: 'only-on-failure'`).
- **Localización de entidades**: `idDeTicket(page, 'TK-1048')` y `idDeOt(page, 'OT-0218')` por `GET /api/tickets?q=1048` / `GET /api/ots?q=0218` (los ids de las semillas no son estables).

### 9.2 `e2e/auditoria.ts` (helpers puros sobre `page.evaluate`)

- `desbordes(page) → { documento: number; elementos: string[] }` (§3.2.1).
- `objetivosChicos(page) → { selector, ancho, alto }[]` aplicando la definición de control interactivo, el `label` envolvente y las excepciones `data-objetivo` (§3.2.2).
- `letraChica(page) → { selector, px }[]` (§3.2.3).
- `posicionY(page, selector) → number` y `altoDocumento(page)`.
- `selectorDe(el)`: `tag#id` o `tag[aria-label]` o `tag.clase.clase` + texto recortado a 30 caracteres, para informes legibles.
- `axe(page)` → `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()` filtrando `impact in ['serious', 'critical']`.

### 9.3 `e2e/movil.spec.ts`

Un `describe` por pantalla; cada test afirma `toEqual([])` sobre las listas (así el informe muestra qué falla). Casos: Mi día (`crojas`: Vencen hoy, Por aprobar, Te mencionaron, Tus tareas), TK-1048 (`crojas`), OT-0218 (`sdiaz`: técnico, sin montos), panel «Más» abierto, diálogos «Cambiar estado» (ticket) y «Cerrar OT…» (`crojas`, OT-0218 en ejecución), flujo de fotos de §3.2.7 (`sdiaz`, sobre OT-0218 **y** sobre TK-1048; al final borra nada: los mensajes quedan en la base de desarrollo, como cualquier prueba manual; en CI la base es efímera), posiciones de §3.2.4, atajos de la OT, escritorio intacto (§3.2.9), desbordes de las pantallas «usables» a 375 px, axe (§3.2.8). Los proyectos `movil-320` y `escritorio` ejecutan solo los tests etiquetados con `@desborde` / `@escritorio` (`grep` por proyecto en la config).

En **F8-T1** la suite se escribe completa y queda **en rojo** en lo que hoy falla (28 controles, letra de 11 px, posiciones); el criterio de la tarea es que corra de punta a punta e informe esos fallos. En **F8-T9** debe quedar verde.

### 9.4 CI (`.github/workflows/ci.yml`)

Al job `verificar`, después de «Build» y antes de «OpenAPI sin cambios»:

```yaml
- name: Navegador para Playwright
  run: npx playwright install --with-deps chromium
- name: Semillas para las pruebas móviles
  run: npm run db:migrar && npm run db:sembrar
- name: Pruebas móviles (Playwright)
  run: npm run test:movil
- uses: actions/upload-artifact@<sha> # v4; solo si falla
  if: failure()
  with: { name: informe-playwright, path: apps/web/e2e/informe, retention-days: 7 }
```

`actions/upload-artifact` se fija por SHA de commit como las demás acciones (ADR 0020). El `.env` de CI ya trae `SEMILLA_PASSWORD`. Presupuesto: ≤ 4 min extra (instalación de Chromium ~1 min, suite ≤ 2 min); se anota la cifra real en §18. Si el paso resulta inestable (`retries: 1` no basta), se detiene y se pregunta (no se marca `continue-on-error` sin decisión del usuario; pregunta §16.9).

## 10. Capturas de los manuales y ayuda con imágenes (bloque 8F)

### 10.1 Dónde viven y cómo se nombran

`docs/manuales/img/<manual>/<slug>[-movil].png` con `<manual>` ∈ `primeros-pasos`, `tecnico`, `coordinacion`, `administracion` (el manual del bot no lleva capturas: son pantallas de Telegram, §0). PNG a **DPR 1** (`deviceScaleFactor: 1`), sin recorte de la ventana salvo cuando se indica `clip` (diálogos). Escritorio 1440 × 900 (`fullPage: false`, salvo las pantallas largas marcadas `completa`); móvil 375 × 812 `fullPage: false`. Peso: ≤ 350 KB por archivo (si una supera, se reduce a `clip` o `fullPage: false`; no se recomprime con herramientas externas), ≤ 10 MB la carpeta (§3.2.10).

### 10.2 Lista de capturas (script `e2e/capturas.ts`; ~32 archivos)

| Manual         | Archivo                                                                                                                        | Cuenta   | Pantalla / estado                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| primeros-pasos | `ingresar.png`                                                                                                                 | —        | `/ingresar` vacío                                                                                 |
|                | `mi-dia.png`, `mi-dia-movil.png`                                                                                               | `crojas` | `/mi-dia`                                                                                         |
|                | `avisos.png`, `avisos-preferencias-movil.png`                                                                                  | `crojas` | `/avisos`; móvil con la pestaña Preferencias                                                      |
|                | `perfil.png`                                                                                                                   | `crojas` | `/perfil`                                                                                         |
|                | `menu-mas-movil.png`                                                                                                           | `crojas` | `/mi-dia` con el panel «Más» abierto                                                              |
|                | `ayuda.png`                                                                                                                    | `crojas` | `/ayuda/primeros-pasos`                                                                           |
| tecnico        | `nuevo-ticket.png`, `adjuntar-correo.png`                                                                                      | `sdiaz`  | `/tickets/nuevo`; con el `.eml` de `apps/api/test/fixtures/correo.eml` cargado en la vista previa |
|                | `detalle-ticket.png` (completa), `detalle-ticket-movil.png`                                                                    | `sdiaz`  | TK-1048; móvil con «Datos del ticket» plegado                                                     |
|                | `datos-ticket-movil.png`                                                                                                       | `sdiaz`  | TK-1048 móvil con «Datos del ticket» desplegado                                                   |
|                | `redactor-fotos-movil.png`                                                                                                     | `sdiaz`  | TK-1048 móvil, redactor abierto con dos vistas previas de `e2e/fixtures/` (sin enviar)            |
|                | `tareas.png`, `cambiar-estado.png` (clip del diálogo)                                                                          | `sdiaz`  | TK-1048                                                                                           |
|                | `convertir-en-ot.png` (clip)                                                                                                   | `sdiaz`  | TK-1035 (sin OT) con el diálogo abierto, sin confirmar                                            |
|                | `ot.png` (completa), `ot-movil.png`, `ot-atajos-movil.png`                                                                     | `sdiaz`  | OT-0218; móvil arriba; móvil tras pulsar el atajo «Fotos»                                         |
|                | `fotos-y-archivos.png`                                                                                                         | `sdiaz`  | OT-0218, tarjeta Fotos y archivos                                                                 |
|                | `horas.png`, `horas-movil.png`                                                                                                 | `sdiaz`  | `/horas` semana actual; móvil por día                                                             |
|                | `cotizador.png`                                                                                                                | `crojas` | COT-0218 v1                                                                                       |
|                | `tablero.png`, `tabla.png`, `linea-de-tiempo.png`                                                                              | `crojas` | `/tickets`, `/tickets/tabla`, `/tickets/linea-de-tiempo`                                          |
| coordinacion   | `aprobacion-cliente.png` (clip), `cerrar-ot.png` (clip)                                                                        | `crojas` | OT-0218 con cada diálogo abierto, sin confirmar                                                   |
|                | `facturar.png` (clip), `lista-ot.png`                                                                                          | `crojas` | OT por facturar con el diálogo; `/ots`                                                            |
|                | `reportes.png`                                                                                                                 | `crojas` | `/reportes` «Últimos 30 días»                                                                     |
| administracion | `equipo.png`, `departamentos.png`, `categorias.png`, `numeracion-y-marca.png`, `tarifas.png`, `plantillas.png`, `telegram.png` | `hikki`  | pestañas de `/configuracion/*`                                                                    |

Reglas: **solo semillas** (`npm run db:reiniciar` antes de capturar; el script aborta si `GET /api/salud` reporta `entorno !== 'desarrollo'` o si existe algún usuario que no es de las semillas: consulta `GET /api/usuarios` y compara con la lista fija de 11 correos); ningún diálogo se confirma; nada se envía; las vistas previas se descartan con «Cancelar» → «Descartar». Las capturas dependen de la fecha (Mi día, vencimientos): se aceptan y se renuevan por fase (ADR 0012). El script se ejecuta **a mano** (`npm run docs:capturas`), no en CI; sobrescribe los archivos existentes; el PR muestra el diff binario.

### 10.3 Referencias en los manuales

Markdown estándar con ruta **relativa al archivo `.md`** (así GitHub las renderiza): en `usuario/01-tecnico.md` → `![Detalle de un ticket en el celular, con los datos plegados](../img/tecnico/detalle-ticket-movil.png)`; en `administracion.md` → `![Equipo y permisos](img/administracion/equipo.png)`. Una imagen por subsección como máximo, debajo del párrafo que la explica, con `alt` que describe lo que se ve (no «captura»). Las secciones que ganan imagen son las de la tabla de §10.2; además el texto de los manuales se actualiza (8G): «En el celular» de `00-primeros-pasos.md` (barra inferior, Más, **datos del ticket plegados, barra «Escribir seguimiento» con cámara, atajos**), «Archivos y fotos» y «La orden de trabajo» de `01-tecnico.md` (vista previa, reintentar, HEIC se guarda pero no se previsualiza en todos los navegadores), «Ayuda» (ahora con imágenes). `04-bot-telegram.md` no cambia.

### 10.4 Cómo las sirve `/ayuda` (`features/ayuda/`)

Los manuales entran al bundle con `?raw` (Fase 6 §27.1), así que las imágenes necesitan otra vía. **Decisión: también al bundle, como assets de Vite** (decisión §15.11):

```ts
// features/ayuda/imagenes.ts
const IMAGENES = import.meta.glob('../../../../../docs/manuales/img/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
// clave: ruta relativa al módulo; valor: URL con hash en /assets (o data: si Vite la inlinea; se fija build.assetsInlineLimit: 0 para que nunca lo haga con PNG de cientos de KB)

export function resolverImagen(manual: Manual, src: string | undefined): string | null;
// src relativo al .md (`../img/tecnico/x.png` desde `usuario/`, `img/administracion/x.png` desde la raíz) → se normaliza con la carpeta del manual
// (`manual.carpeta`: 'usuario' | '') a `img/<manual>/<slug>.png` y se busca la clave que termina en `/docs/manuales/img/<manual>/<slug>.png`.
// Devuelve null si: src ausente, absoluto (`http:`, `https:`, `data:`, `/`), con `..` que salga de `docs/manuales`, o no está en el bundle.
```

- `manuales.ts`: `Manual` gana `carpeta: 'usuario' | ''` (`administracion.md` está en la raíz de `docs/manuales/`).
- `MarkdownManual`: componente `img`: `src` resuelto → `<img src loading="lazy" alt className="my-3 max-w-full rounded-md border border-borde" />` envuelto en `<figure>` si el `alt` es largo? No: solo `img` (simple). Sin resolución → `<span role="img" aria-label={alt} className="my-3 block rounded-md border border-dashed px-3 py-2 text-sm text-tinta-2">Imagen no disponible: {alt}</span>` (nunca un `img` roto ni una URL externa).
- `react-markdown` ya no renderiza HTML crudo (por defecto), así que `<img>` en HTML dentro del `.md` no pasa; solo la sintaxis `![]()`.
- `vite.config.ts`: `build: { assetsInlineLimit: 0 }` (8A lo deja listo; afecta también a otros assets: hoy no hay ninguno por debajo de 4 KB que importe inlinear; se anota).
- Tests jsdom (`imagenes.test.ts`, `MarkdownManual.test.tsx` ampliado): `resolverImagen(tecnico, '../img/tecnico/detalle-ticket.png')` devuelve una cadena no vacía cuando el archivo existe (el glob de Vitest resuelve de verdad contra `docs/manuales/img/`; el test crea nada: usa una imagen real del PR); `https://…` → `null`; `../../x.png` → `null`; el render de `![Detalle](../img/tecnico/detalle-ticket.png)` produce `img[alt="Detalle"][loading="lazy"]` con `src` no vacío; `![Falta](../img/tecnico/no-existe.png)` produce el `span` «Imagen no disponible: Falta» y ningún `img`.
- **Test de integridad de los manuales** (`manuales.test.ts`, ampliado): para cada `![alt](ruta)` de los cinco `.md` (expresión regular sobre el texto crudo, fuera de bloques de código), `alt` no vacío, `ruta` relativa y `resolverImagen` ≠ `null`; cada archivo de `docs/manuales/img/` (listado con `import.meta.glob` de nuevo) está referenciado por algún manual (sin huérfanos); peso ≤ 350 KB por archivo (`fs.statSync` en el test, que corre en Node).
- Pendiente de la Fase 9 (ya anotado en CHANGELOG): el `Dockerfile` de `web` copia `docs/manuales/` **completo, incluida `img/`**, a la etapa de build.

## 11. Seguridad (foco acotado; revisión completa en F8-T12)

Superficie nueva o cambiada: (1) vistas previas con `blob:` URLs (se revocan; no se envían a ningún sitio); (2) `onError` de imágenes (sin cambio de origen: `archivo.url` sigue siendo `/api/archivos/:id` con sesión e `inline` solo para `image/*` y PDF, ADR 0009); (3) imágenes de la ayuda **solo desde el bundle** (`resolverImagen` rechaza absolutas, `data:`, protocolos y rutas que salen de `docs/manuales`; test); (4) capturas **solo con semillas** (guardas del script en §10.2; revisión visual del PR: ninguna captura con correo, nombre o cliente fuera de las semillas); (5) Playwright y axe como `devDependencies` fijadas a versión exacta (`save-exact`) y Chromium instalado por `npx playwright install` (no se descarga nada en tiempo de ejecución de la app); (6) el helper de sesión de e2e lee `SEMILLA_PASSWORD` del `.env` y no la escribe en informes, trazas ni `console`; `trace`/`video` apagados; (7) `AlertDialog` «¿Descartar el seguimiento?» borra archivos pendientes **propios** (`DELETE /api/archivos/:id` ya exige que el pendiente sea del actor; 404 tolerado); (8) sin cambios de CSP, cabeceras ni cookies (nginx y helmet quedan como están; `blob:` no necesita `img-src` porque la web no aplica CSP hoy; si en la Fase 9 se agrega CSP a nginx, debe incluir `img-src 'self' blob:`; se anota en §12 para la guía de despliegue).

Pruebas de seguridad obligatorias (jsdom + Playwright): `resolverImagen` con `https://evil/x.png`, `//evil/x.png`, `data:image/png;base64,…`, `../../../.env`, `img/../../README.md` → `null`; el redactor nunca renderiza `texto` como HTML (ya cubierto con `<img src=x onerror>` en `TicketDetallePage.test.tsx`; se mantiene); el script de capturas aborta con un usuario no sembrado (test unitario de la guarda `soloSemillas(usuarios)`); `e2e/informe/` y `test-results/` ignorados por git; `grep -r "SEMILLA_PASSWORD" apps/web/e2e` solo aparece en `sesion.ts` leyendo `process.env`.

## 12. Documentación (bloque 8G)

- `docs/manuales/usuario/00-primeros-pasos.md`: «En el celular» ampliado (§10.3) con `menu-mas-movil.png` y `mi-dia-movil.png`; «Ayuda» menciona las imágenes.
- `docs/manuales/usuario/01-tecnico.md`: «Archivos y fotos» (vista previa, contador, reintentar, quitar; HEIC), «El detalle del ticket» (datos plegados y atajos en el celular; `detalle-ticket-movil.png`, `datos-ticket-movil.png`, `redactor-fotos-movil.png`), «La orden de trabajo» (`ot-movil.png`, «Tipo y datos» plegado), más las capturas de escritorio de §10.2.
- `docs/manuales/usuario/02-coordinacion.md` y `docs/manuales/administracion.md`: solo capturas (sin cambios de texto salvo una frase en administración §12 «Espacio en disco»: las fotos del celular pesan ~0,5 MB tras la compresión).
- `README.md`: scripts `npm run test:movil` (requiere `npx playwright install chromium` una vez y la API con semillas) y `npm run docs:capturas`; carpeta `docs/manuales/img/`.
- `CLAUDE.md`: §3 Tests gana «Playwright (`npm run test:movil`) mide lo que jsdom no puede: desbordes, objetivos táctiles, letra, posiciones y axe; no forma parte de `npm test`»; §2 gana la regla de objetivos táctiles (`CasillaTactil`, enlace en línea con `data-objetivo="en-linea"`, `useEsMovil` para plegar, nunca duplicar secciones por breakpoint) y «las imágenes de los manuales viven en `docs/manuales/img/<manual>/` y entran al bundle por `features/ayuda/imagenes.ts`; se generan con `npm run docs:capturas` sobre semillas»; §6 Comandos con los dos scripts.
- `docs/CHANGELOG.md`: Fase 8 en «Añadido» (lo de §0) y «Cambiado» (orden móvil del detalle y la OT, redactor plegable, `assetsInlineLimit: 0`); quitar el pendiente de la Fase 6 sobre capturas; en «Pendientes para la guía de despliegue» agregar `img/` al `Dockerfile` de `web` y `img-src 'self' blob:` si se agrega CSP; «Pendientes de la Fase 8»: iOS Safari/teclado virtual verificados a mano, sin PWA ni sin conexión, progreso en bytes.
- `docs/decisiones/0029-precisiones-de-la-fase-8.md` con §15–§17 y `docs/decisiones/README.md`; `preguntas-abiertas.md` no se edita.
- `docs/api/openapi.json`: sin cambios (se verifica).

## 13. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit convencional en español, sin `Co-Authored-By`)

| Tarea                                       | Bloque | Crea/edita                                                                                                                                                                                                               | Criterio de aceptación                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F8-T1 Playwright y auditoría en rojo**    | 8A     | `package.json` (raíz y web), `playwright.config.ts`, `vite.config.ts` (`preview`, `assetsInlineLimit`), `e2e/{sesion,auditoria,movil.spec}.ts`, `e2e/fixtures/foto-{1,2,3}.jpg`, `.gitignore`, `ci.yml`                  | `npm run test:movil` levanta API y `preview`, ingresa como `crojas`/`sdiaz`, corre las tres pantallas en los tres proyectos y **falla listando** los 28 controles, los textos de 11 px y las posiciones de §3.1 (informe HTML en `e2e/informe`); `npm test` no cambia de duración; CI ejecuta el paso (en rojo, en la rama). |
| **F8-T2 Base móvil**                        | 8A     | `lib/useMediaQuery.ts` (+ test), `test/pantalla.ts`, `useVistaTarjetas.ts`, `CasillaTactil.tsx` (+ test), `index.html`, `Layout.tsx`, `BarraInferior.tsx`, `Pie.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `InsigniaAvisos` | §4 completo; `BarraInferior.test.tsx` y `MenuLateral.test.tsx` siguen verdes; en Playwright los dos diálogos cumplen §3.2.5 y el pie §3.2.2.                                                                                                                                                                                 |
| **F8-T3 Mi día y listas**                   | 8B     | `features/mi-dia/**`, `ListaTareas.tsx` (+ test), `GaleriaArchivos.tsx`, `ActividadLista.tsx`                                                                                                                            | §5, §6.4, §7.4 (galería y actividad); `MiDiaPage.test.tsx` ampliado; Playwright: `/mi-dia` sin objetivos chicos ni letra chica a 375 px.                                                                                                                                                                                     |
| **F8-T4 Fotos**                             | 8E     | `SubidaArchivos.tsx` (+ test), `test/archivos.ts`                                                                                                                                                                        | §8.1 con los siete casos de test; `GaleriaOt` y `NuevoTicketPage` (usan `SubidaArchivos`) siguen verdes sin cambios.                                                                                                                                                                                                         |
| **F8-T5 Redactor plegable**                 | 8E     | `Redactor.tsx` (+ test), `RedactorPlegable.tsx` (+ test)                                                                                                                                                                 | §8.2 y §8.3 con sus tests; `Redactor.test.tsx` actual sigue verde.                                                                                                                                                                                                                                                           |
| **F8-T6 Detalle de ticket móvil**           | 8C     | `AtajosSecciones.tsx` (+ test), `TicketDetallePage.tsx` (+ test), `PanelTicket.tsx`                                                                                                                                      | §6.1–§6.3 con tests; en Playwright a 375 px: `summary` ≤ 600 px, «Tareas» ≤ 1 500 px, 0 objetivos chicos salvo la excepción «Horas»; a 1440 px §3.2.9. (El envoltorio `sticky` queda hasta F8-T8.)                                                                                                                           |
| **F8-T7 OT móvil**                          | 8D     | `OtDetallePage.tsx` (+ test), `DatosOt.tsx`, `PanelOt.tsx`, `Etapas.tsx` (+ test)                                                                                                                                        | §7.1–§7.4 con tests; Playwright a 375 px: «Tareas» ≤ 750 px, atajos dentro de [0, 120] px, 0 objetivos chicos; 1440 px intacto.                                                                                                                                                                                              |
| **F8-T8 Integración del redactor**          | 8C+8D  | dos líneas en cada página de detalle y sus tests                                                                                                                                                                         | §6.5 y §7.5; Playwright: alto total TK-1048 ≤ 4 000 px y OT-0218 ≤ 4 900 px; flujo de fotos de §3.2.7 verde en ticket y OT.                                                                                                                                                                                                  |
| **F8-T9 Auditoría verde**                   | 8A     | lo que haga falta dentro de los archivos de 8A–8E                                                                                                                                                                        | `npm run test:movil` **verde** en los tres proyectos, incluidos axe y las pantallas «usables» a 375 px; cada excepción `data-objetivo` inventariada en ADR 0029 (≤ 3 por pantalla); CI verde en la rama con la duración anotada.                                                                                             |
| **F8-T10 Ayuda con imágenes**               | 8F     | `features/ayuda/{imagenes,imagenes.test,manuales,MarkdownManual,MarkdownManual.test,manuales.test}.ts(x)`, una imagen provisional `docs/manuales/img/tecnico/detalle-ticket.png`                                         | §10.4 con sus tests y los de §11; `/ayuda` en el navegador muestra la imagen a 1440 y 375 px sin desborde.                                                                                                                                                                                                                   |
| **F8-T11 Capturas y manuales**              | 8F     | `e2e/capturas.ts`, `docs/manuales/img/**`, los cinco `.md`                                                                                                                                                               | `npm run docs:capturas` sobre `npm run db:reiniciar` genera las ~32 capturas de §10.2 (≤ 350 KB c/u, ≤ 10 MB total); el test de integridad pasa (sin huérfanos, `alt` presente); los manuales renderizan en GitHub y en `/ayuda`; texto de §12 actualizado.                                                                  |
| **F8-T12 Revisión de seguridad de la fase** | —      | correcciones con test                                                                                                                                                                                                    | PLAN §1: Fable con `sentry-security-review` y Opus con `/security-review` sobre el diff completo, con foco en §11 (blob URLs, `onError`, `resolverImagen`, script de capturas, secretos en e2e/CI, devDependencies). Cada hallazgo confirmado se corrige con un test; nada se mergea con hallazgos abiertos.                 |
| **F8-T13 Documentación y cierre**           | 8G     | §12, `docs/decisiones/0029-precisiones-de-la-fase-8.md`, `docs/decisiones/README.md`, `CLAUDE.md`, `README.md`, `docs/CHANGELOG.md`                                                                                      | Criterios de §14 desde un clon limpio; PR a `main` con CI verde, con confirmación del usuario.                                                                                                                                                                                                                               |

## 14. Criterios de aceptación de la fase (verificación final, en este orden)

### 14.1 Automática

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                 → 0 errores
npm run db:migrar                                                                  → 14 migraciones (sin cambios)
npm test                                                                           → verde (shared, api, web, bot); web: todos los tests nuevos de §4–§10
npm run api:openapi && git diff --exit-code docs/api/openapi.json                  → sin diff
npm run db:reiniciar                                                               → semillas de la Fase 7 (18 tickets, 7 OT, 5 cotizaciones)
npx playwright install chromium && npm run test:movil                              → verde: movil-320, movil-375, escritorio; informe sin fallos
git diff --stat main -- apps/api packages/shared apps/bot                          → vacío
du -sh docs/manuales/img                                                           → ≤ 10 MB; ningún archivo > 350 KB
GitHub Actions: workflow CI verde en la rama y en el PR; paso «Pruebas móviles» ≤ 4 min (anotar)
```

### 14.2 En el navegador (375 × 812 **y** 1440 × 900, `npm run dev`, `crojas` y `sdiaz`)

- **375 px**: `/mi-dia` sin scroll horizontal, casillas de «Tus tareas» marcables tocando a la derecha de la casilla (dentro del `label`), pie tocable. `/tickets/<TK-1048>`: atajos bajo el título; «Datos del ticket · Viña Santa Clara · [avatares]» plegado a la vista sin hacer scroll; al desplegar aparecen estado con «Cambiar», prioridad, responsables, cliente y «OT vinculadas»; Descripción → Tareas → Actividad; al pie la barra «Escribir seguimiento» + cámara; «Escribir seguimiento» abre el redactor centrado con foco; «Tomar foto» abre el selector de la cámara (en escritorio, el selector de archivos); elegir dos JPG muestra dos vistas previas al instante y «0 de 2 fotos subidas» → «2 de 2»; «Quitar» en una; «Registrar seguimiento» deja el mensaje con una imagen en Actividad y la barra vuelve a plegarse; tras hacer scroll al final se ven Correo original y Archivos del ticket. `/ots/<OT-0218>` (`sdiaz`): atajos; Etapas con «En ejecución» a la vista; Tareas con casillas de 44 px e inputs de horas de 44 px; «Fotos y archivos» con «Subir fotos»; Actividad; barra del redactor; panel (Cotización sin montos para `sdiaz`, Aprobación, Facturación, Ticket de origen con enlace de 44 px, Horas con «Ver en la planilla» de 44 px, Datos, Historial); al final «Tipo y datos · Facturable · Viña Santa Clara» plegado; el atajo «Cotización» lleva al panel. «Cambiar estado» y «Cerrar OT…» caben en 375 × 667 con scroll interno. `/ayuda/tecnico` muestra las capturas sin desborde.
- **1440 px**: las tres pantallas se ven **como en la Fase 7** (panel a la derecha, redactor estático completo, «Tipo y datos» segundo, sin atajos ni plegables); `/ayuda` con imágenes y el índice a la derecha.
- Detener `npm run dev` con `taskkill /PID <pid> /T /F` y comprobar que no queda ningún `node.exe` de `tickets-app`.

### 14.3 Manual, en un teléfono real (el usuario; se anota en ADR 0029, no bloquea el PR)

Android Chrome e iOS Safari: «Tomar foto» abre la cámara trasera; varias fotos seguidas suman a la lista; el teclado virtual no tapa el `textarea` abierto; la barra inferior no queda bajo el indicador de inicio de iPhone; una foto de 8–12 MP sube en ≤ 10 s por 4G y queda ≤ 600 KB. Lo que falle se anota como pendiente de la Fase 8 en el CHANGELOG (o se corrige si es un cambio de una línea).

## 15. Decisiones tomadas en esta spec (con justificación)

1. **Playwright + axe entran como herramienta de verificación, fuera de `npm test`**: ADR 0011 y 0019 prometieron axe en Playwright y nunca se instaló; jsdom no mide cajas, scroll ni `font-size` computado, y los criterios de esta fase son geométricos. Solo Chromium (el único motor que Playwright trae sin licencia extra y el de Android); iOS Safari queda manual (§14.3). PLAN §2 lo preveía («Playwright opcional para flujos críticos»). Pregunta §16.1.
2. **Excepciones de objetivo táctil declaradas en el DOM (`data-objetivo`)**, no en una lista del script: así jsdom puede comprobar que un enlace concreto está marcado, el script no necesita selectores frágiles y cada excepción queda a la vista en el código y en ADR 0029. Máximo 3 por pantalla; «en línea» exige 24 px (WCAG 2.5.8), que es el umbral que la auditoría ya detectó como incumplido (18 px).
3. **Área táctil = control o su `label` envolvente** (`CasillaTactil`): agrandar la casilla visible a 44 px rompería la densidad del diseño; el `label` de 44 × 44 es el patrón estándar y deja la casilla de 20 px como en el diseño.
4. **Reordenar con `order` bajo `lg` y grid aplanado, sin duplicar secciones**: renderizar dos veces el panel o el formulario (uno `lg:hidden`, otro `hidden lg:block`) duplicaría formularios, ids y diálogos; `order` cambia solo lo visual y deja el DOM (y el orden de lectura) como en escritorio. El costo es un `div` menos y una clase por sección.
5. **Panel del ticket arriba y plegado (`<details>` nativo, cerrado, sin persistencia)**: la auditoría muestra estado, responsables y cliente a 3 100 px; el `summary` resume lo que más se consulta (cliente y responsables) y el `details` nativo es accesible sin JavaScript, igual que el índice de `/ayuda`. Cerrado por defecto porque en terreno se entra a leer la actividad y escribir; no se persiste para no sumar estado de UI que la URL no refleja (ADR 0011). **Precisa ADR 0011** («apilan el panel derecho debajo»). Pregunta §16.2.
6. **En la OT el panel sigue debajo, «Tipo y datos» va al final plegado y hay atajos**: el formulario de 1 150 px es lo que empuja todo; en terreno se usa Tareas, Fotos y Actividad; lo comercial lo hace Coordinación, normalmente en escritorio, y con los atajos está a un toque. Abierto en Borrador porque es la etapa en que se llena. Pregunta §16.3.
7. **Atajos como `nav` de chips solo en móvil**, no una barra fija ni pestañas: no quita alto útil (ADR 0019), no agrega estado a la URL y funciona con anclas nativas; la página de Mi día ya usa el mismo gesto (`TarjetaConteo` → `scrollIntoView`).
8. **Redactor plegable en una barra de 60 px con cámara a un toque, que al abrirse se vuelve estático**: cumple ADR 0011 («fijo al pie con la cámara a un toque») y libera ~280 px de pantalla; el redactor abierto se vuelve estático porque un `textarea` dentro de un contenedor `sticky`/`fixed` bajo el teclado virtual de iOS se desplaza mal (la barra plegada no tiene campos y no sufre eso). El modo Seguimiento/Nota se elige dentro porque la barra no tiene espacio para tres controles de 44 px y el seguimiento es el caso de terreno. Pregunta §16.4.
9. **Vista previa local, estado por archivo y «Reintentar», sin progreso en bytes ni cancelar**: `fetch` no expone progreso de subida; cambiar a `XMLHttpRequest` para una barra de progreso de archivos de ~500 KB no se justifica; lo que sí falta en terreno con mala señal es ver la foto al instante y reintentar sin volver a sacarla. Pregunta §16.5.
10. **HEIC: se sigue aceptando (ADR 0009) y la web muestra un cuadro genérico cuando el navegador no lo decodifica**: iOS entrega JPEG desde la cámara y suele convertir HEIC al subir desde la galería; cuando llega un HEIC, Chromium no lo pinta y hoy queda una imagen rota. Convertir en el servidor es ADR nueva (no entra). Pregunta §16.6.
11. **Imágenes de los manuales al bundle con `import.meta.glob … ?url`**, misma vía que los `.md` con `?raw`: una sola fuente (el repo), sin copia a `public/`, sin ruta en la API, sin lectura de disco en producción; Vite les pone hash y las sirve nginx como el resto de `assets/`. `assetsInlineLimit: 0` evita que un PNG se inlinee en base64 dentro del JS. El `img` solo acepta rutas relativas resueltas dentro de `docs/manuales/img/`: ninguna imagen externa entra a la app por un `.md`. Pregunta §16.7.
12. **Capturas por script, PNG a DPR 1, ≤ 350 KB**: reproducibles con semillas y renovables por fase (ADR 0012); PNG porque GitHub, `/ayuda` y cualquier editor lo muestran igual y la UI plana comprime bien; DPR 1 porque a DPR 2 cuadruplica el peso sin aportar en un manual. Pregunta §16.8.
13. **La suite móvil corre en el mismo job de CI, bloqueante**: un paso aparte con `continue-on-error` se ignora; si resulta inestable se decide con el usuario (§16.9).
14. **`useEsMovil` con `matchMedia` en vez de clases Tailwind para los plegables y atajos**: `details`/`summary` no pueden «forzarse abiertos» con CSS de forma fiable y los atajos no deben existir en el DOM de escritorio; un hook de 10 líneas (ya existía el patrón en `useVistaTarjetas`) es más simple que duplicar marcado.
15. **Sin tocar API, `shared` ni bot**: todo lo que pide el PLAN para la Fase 8 es de presentación; mantenerla solo en `apps/web` y `docs/` acota la revisión de seguridad y el riesgo del PR.

## 16. Preguntas para el usuario

1. **[No bloquea · recomendación: sí]** ¿Agregar **Playwright (Chromium) y axe** como `devDependencies` con un paso de CI (≈ +4 min)? Es la única forma de medir cajas, scroll y letra automáticamente y cumple lo prometido en ADR 0011/0019. Alternativa si no: F8-T1 y F8-T9 se reemplazan por la misma auditoría ejecutada a mano en el panel del navegador (el script de §9.2 se deja en `e2e/auditoria.ts` para pegarlo en la consola) y los criterios de §3.2 se verifican manualmente y se anotan en ADR 0029; las capturas de §10 se toman a mano.
2. **[No bloquea · recomendación: arriba y plegado]** En el detalle del ticket en celular, ¿el panel de datos va **arriba plegado** (decisión §15.5) o se deja debajo como dice ADR 0011 y solo se agregan los atajos? Con atajos solos, el estado sigue a 3 000 px pero a un toque.
3. **[No bloquea · recomendación: al final plegado]** En la OT en celular, ¿«Tipo y datos» va **al final plegado** (abierto en Borrador) o se queda segundo pero plegado? Al final deja Tareas a ~700 px; segundo plegado las deja a ~500 px pero el formulario sigue interrumpiendo el flujo cuando se despliega.
4. **[No bloquea · recomendación: barra plegada con cámara]** ¿Redactor **plegado en una barra** con «Escribir seguimiento» + cámara (decisión §15.8), o mantener el redactor completo fijo al pie (340 px) y solo arreglar los objetivos? Alternativa intermedia: barra plegada sin botón de cámara (la cámara queda a dos toques).
5. **[No bloquea · recomendación: sin progreso en bytes]** ¿Basta con vista previa + estado por foto + contador + «Reintentar», o quieres barra de progreso por archivo (exige pasar `subirArchivos` a `XMLHttpRequest`, ~40 líneas y un test más)?
6. **[No bloquea · recomendación: mantener `capture` y el cuadro genérico para HEIC]** ¿Mantener «Fotos» = cámara directa (`capture="environment"`, ADR 0009) y «Archivo» = galería/archivos, o cambiar «Fotos» a `accept="image/*"` sin `capture` para que el sistema ofrezca cámara **o** galería? Lo segundo contradice ADR 0009 y en Android agrega un paso; lo primero deja la galería en «Archivo».
7. **[No bloquea · recomendación: al bundle]** ¿Imágenes de los manuales **dentro del bundle** (decisión §15.11) o servidas por nginx desde `/manuales/img/` copiando la carpeta en el `Dockerfile` (ruta estática nueva, sin hash, y una regla más de nginx en la Fase 9)?
8. **[No bloquea · recomendación: sí, ~32 capturas, también de las 4 pantallas móviles]** ¿Incluir capturas **móviles** además de las de escritorio, y la lista de §10.2 tal cual? Puedes recortarla (p. ej. solo las de `primeros-pasos` y `tecnico`) y el resto queda para otra fase.
9. **[No bloquea · recomendación: bloqueante en el mismo job]** Si el paso de Playwright en CI resulta inestable, ¿prefieres un job aparte no bloqueante o quitarlo de CI y dejarlo solo local? Se decide únicamente si ocurre.
10. **[No bloquea · recomendación: no en esta fase]** ¿Quieres algo de lo excluido en §0 (PWA/instalable, sin conexión, notificaciones push, recorte de fotos)? Cada uno es una ADR y una fase aparte; propongo anotarlos en ADR 0029 como mejoras.

No hay preguntas bloqueantes: todo se implementa con la recomendación si no hay respuesta, y cada alternativa es un cambio local (una prop, un `order`, un script).

### Respuestas (2026-10-05)

Ninguna pregunta bloquea, así que, según la regla acordada con el usuario, las diez se resuelven con la recomendación: 1 Playwright (Chromium) + axe con paso en CI; 2 panel del ticket arriba y plegado; 3 «Tipo y datos» de la OT al final, plegado (abierto en Borrador); 4 redactor plegable con cámara a un toque; 5 sin progreso en bytes; 6 se mantiene `capture` y HEIC como documento; 7 imágenes de manuales en el bundle; 8 las ~32 capturas, con 4 móviles; 9 paso de Playwright bloqueante en el mismo job; 10 PWA, sin conexión, push y recorte de fotos quedan fuera. El usuario puede cambiar cualquiera antes de que se implemente su bloque.

## 17. Cambios de ADR propuestos (no se editan las ADR; registrar en ADR 0029 «Precisiones de la Fase 8» al cerrar)

- **ADR 0011**: bajo 1024 px el detalle del ticket muestra el panel de datos **arriba y plegado** (`details`), reordena las secciones (Descripción → Tareas → Actividad → redactor → Correo → Archivos) y la OT deja «Tipo y datos» **al final plegado** (abierto en Borrador), con el panel debajo como estaba; ambas páginas llevan una fila de atajos solo en móvil; «el redactor queda fijo al pie con la cámara a un toque» se cumple con `RedactorPlegable` (barra de una fila; el redactor abierto es estático); objetivos táctiles ≥ 44 px con excepciones declaradas `data-objetivo="en-linea"` (≥ 24 px, ≤ 3 por pantalla) y `cubre-tarjeta`; letra ≥ 12 px salvo decorativos `aria-hidden` e insignias; `CasillaTactil` como patrón de casilla; `viewport-fit=cover` y área segura; diálogos con `max-h-[calc(100dvh-2rem)]`; **el test de axe en Playwright se implementa por fin** (`npm run test:movil`, Chromium, 320/375/1440, fuera de `npm test`).
- **ADR 0019**: la barra inferior gana `pb-[env(safe-area-inset-bottom)]`; la promesa «Playwright con axe … cada acceso ≥ 44 px» queda cubierta por `e2e/movil.spec.ts`.
- **ADR 0009**: sin cambios de límites ni compresión; en la web: vista previa local con `blob:` revocada al quitar/desmontar, estado por archivo con «Reintentar», contador accesible, HEIC aceptado pero mostrado como documento cuando el navegador no lo decodifica; `capture="environment"` se mantiene en «Fotos» y la galería va por «Archivo».
- **ADR 0012 / 0018 / 0027 (§27)**: capturas en `docs/manuales/img/<manual>/<slug>[-movil].png` (PNG, DPR 1, ≤ 350 KB, ≤ 10 MB en total), generadas con `npm run docs:capturas` sobre semillas y renovadas por fase; referencias relativas en los `.md`; la ayuda las sirve desde el bundle (`import.meta.glob … ?url`, `assetsInlineLimit: 0`), solo rutas internas; el manual del bot no lleva capturas; `Manual.carpeta`.
- **ADR 0020**: CI gana el paso «Pruebas móviles (Playwright)» con Chromium instalado en el job y `upload-artifact` del informe solo al fallar (acción fijada por SHA); `@playwright/test` y `@axe-core/playwright` como `devDependencies` exactas; `e2e/informe/` y `test-results/` ignorados.
- **ADR 0001 / 0010**: ninguna ruta, esquema ni paquete de API o `shared` cambia en esta fase.
- **Spec funcional §7 / PLAN §4 Fase 8**: «funcionar en celular» queda definido por los criterios medibles de §3.2 (0 desbordes a 320/375, objetivos ≥ 44 con excepciones declaradas, letra ≥ 12, posiciones máximas, diálogos dentro de la pantalla, axe sin `serious`/`critical`, flujo de fotos con vista previa y compresión ≤ 600 KB).
- **Infraestructura**: `lib/useMediaQuery.ts` (`useEsMovil`, `useVistaTarjetas` delega); `components/dominio/{CasillaTactil,AtajosSecciones,RedactorPlegable}.tsx`; `vite.config.ts` con `preview.proxy` y `assetsInlineLimit: 0`; `src/test/{pantalla,archivos}.ts`.

## 18. Estado de avance

_(se completa al implementar: versiones exactas de `@playwright/test` y `@axe-core/playwright`, duración del paso de CI, excepciones `data-objetivo` inventariadas, resultado de la prueba manual de §14.3, desviaciones respecto de esta spec y respuestas a §16)_
