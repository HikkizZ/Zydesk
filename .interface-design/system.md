# Sistema visual v2 de Zydesk

Fuente: `docs/specs/fase-10.md` §3–§7 (ADR 0011, precisada por la 0033). Tokens en `apps/web/src/estilos/tema.css`; el contraste lo verifica `tema.test.ts`. Consultar antes de tocar cualquier pantalla.

## Dirección

Herramienta de trabajo para 10 personas, muchas horas al día: **sobria, densa, legible, sin decoración**. Paleta acero fría sobre blanco con **un solo acento** (azul tinta). El color significa algo (estado, prioridad, plazo) o es la acción principal; todo lo demás es escala de grises. La jerarquía se construye con tamaño (12/13/14/20 px), peso (400/500/600) y tinta (`tinta` → `tinta-2` → `tinta-3`), no con sombras ni fondos. Folios y montos en mono con cifras tabulares.

Qué no hacemos: sin sombras en reposo, sin degradados, sin ilustraciones, sin más de un acento, sin texto bajo 12 px (salvo `aria-hidden` y `data-letra="insignia"`), sin modo oscuro, sin `rounded-xl`/`2xl`, sin `tinta-4` como texto.

## Tokens

| Token (Tailwind)                         | Valor                                                         | Uso / ejemplo                                                       |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `lienzo`                                 | `#F7F8FA`                                                     | Fondo de página y menú lateral: `bg-lienzo`                         |
| `panel`                                  | `#FFFFFF`                                                     | Tarjetas, tablas, barra superior, diálogos, campos: `bg-panel`      |
| `panel-hundido`                          | `#F1F3F6`                                                     | Cabecera de tabla, chips, pista de franja: `bg-panel-hundido`       |
| `tinta`                                  | `#16191F`                                                     | Texto principal, títulos: `text-tinta`                              |
| `tinta-2`                                | `#4B5363`                                                     | Texto secundario (cliente, fechas, etiquetas): `text-tinta-2`       |
| `tinta-3`                                | `#626A7C`                                                     | Terciario (rótulos, cabeceras de tabla, migas, pie): `text-tinta-3` |
| `tinta-4`                                | `#9AA1AF`                                                     | **Solo decorativo** (íconos, glifos, deshabilitado)                 |
| `linea`                                  | `rgba(22,25,31,.08)`                                          | Bordes de tarjetas y filas: `border-linea`                          |
| `linea-suave`                            | `rgba(22,25,31,.05)`                                          | Separadores internos: `border-linea-suave`                          |
| `linea-fuerte`                           | `rgba(22,25,31,.16)`                                          | Contorno de tabla, popovers, línea de pestañas                      |
| `linea-campo`                            | `rgba(22,25,31,.48)`                                          | Borde de `input`/`textarea`/`select`/casillas (3,2:1)               |
| `acento` / `acento-suave`                | `#2F47C4` / `#EEF1FC`                                         | Botón principal, enlaces, foco, ítem activo / su fondo              |
| `plazo-ok` / `plazo-ok-suave`            | `#137A3A` / `#EAF6EE`                                         | Holgura, Resuelto, Facturable                                       |
| `plazo-atento` / `plazo-atento-suave`    | `#AD4F06` / `#FDF2E3`                                         | Bajo 25 %, prioridad Alta, En espera, nota interna                  |
| `plazo-vencido` / `plazo-vencido-suave`  | `#B42318` / `#FCECEA`                                         | Vencido, Urgente, errores, destructivo                              |
| `estado-nuevo`                           | `#5B6B9A`                                                     | Punto de Nuevo / Borrador                                           |
| `interna` / `interna-suave`              | `#5B3FA6` / `#EFEAFB`                                         | OT interna, horas internas                                          |
| `grafico-facturable` / `grafico-interna` | `#2F47C4` / `#AD4F06`                                         | Recharts (dos colores + etiquetas de texto)                         |
| `font-texto` / `font-mono`               | IBM Plex Sans / IBM Plex Mono                                 | Todo el texto (incluidos `h1`–`h3`) / folios, montos, `kbd`         |
| `text-tabla`                             | 13 px                                                         | Celdas de tabla, filas de lista, mensajes de actividad              |
| `rounded-sm` / `md` / `lg`               | 4 / 6 / 8 px                                                  | Chips y campos / botones, tarjetas, popovers / diálogos             |
| `shadow-flotante`                        | `0 8px 24px rgba(22,25,31,.12), 0 1px 2px rgba(22,25,31,.06)` | Solo flotantes                                                      |

Pares de texto verificados (≥ 4,5:1 por `tema.test.ts`): `tinta`, `tinta-2`, `tinta-3`, `acento`, `plazo-*`, `estado-nuevo` e `interna` sobre `panel`, `lienzo`, `panel-hundido` (`tinta`, `tinta-2`, `tinta-3` y `acento` también sobre `acento-suave`; cada color de plazo/interna también sobre su fondo suave); blanco sobre `acento` 7,45; `linea-campo` sobre `panel` 3,16 (≥ 3, no es texto).

Durante la fase siguen vigentes los **alias de transición** de los nombres antiguos (`fondo`, `superficie*`, `borde*`, `urgente*`, `alta*`, `media*`, `baja*`, `en-espera*`, `resuelto*`, `interna-fondo`, `nota-interna*`, `font-titulo`). No usarlos en código nuevo; se eliminan en F10-T16.

## Tipografía

`html` sigue en 16 px (los `rem` de Tailwind y las alturas de 44 px dependen de ello). Texto corrido `text-sm` (14 px), metadatos `text-xs` (12 px), tablas y listas `text-tabla` (13 px). Títulos: `h1` `text-xl font-semibold` (20 px), `h2` 14 px/600, `h3` 13 px/500. Nada sobre 20 px. Pesos 400/500/600 (700 disponible para `h1` si hiciera falta). Folios, montos y horas en celdas: `font-mono` (o `data-mono`) con `tabular-nums` (la base ya lo aplica).

## Profundidad

Solo borde de 1 px: toda superficie estática es `bg-panel border border-linea` (`linea-fuerte` en tablas y composer). **Sombra (`shadow-flotante`) únicamente** en `dialog`, `alert-dialog`, `popover`, `dropdown-menu`, `select` (contenido), `command` (popover), `sheet`, `sonner` y la barra `sticky` de `RedactorPlegable` (hacia arriba).

## Espaciado y densidad

Base 4 px (4/8/12/16/20/24/28). Página `p-4 lg:p-7`; entre secciones 24 px; dentro de tarjeta 16 px (12 px en listas densas). Filas de tabla y lista 44 px (≥ 48 px bajo `lg`); cabecera de tabla 36 px; botón `default` `h-11 lg:h-8`; `sm` `h-11 lg:h-7`; campos `h-11 lg:h-9`; ítems del menú lateral 32 px, grupos separados 20 px. Íconos `size-4` trazo 1,5 (18 px en menú y barra inferior; 12 px en chips, `aria-hidden`).

## Patrones (clases de referencia)

- **Menú lateral**: `bg-lienzo border-r border-linea p-3` (232 px). Ítem `relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-tinta-2 hover:bg-panel-hundido hover:text-tinta`; activo `bg-acento-suave text-acento before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-acento`. Rótulo de grupo `px-2.5 pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-[0.08em] text-tinta-3` con `aria-hidden`.
- **Barra superior y migas**: `h-12 bg-panel border-b border-linea px-4 lg:px-7 flex items-center gap-4`; migas `text-xs text-tinta-3`, separador `ChevronRight size-3 text-tinta-4 aria-hidden`, última `text-tinta-2` con `aria-current="page"`.
- **Cabecera de página**: `h1 text-xl font-semibold`, contador `ml-2 rounded-sm border border-linea bg-panel px-1.5 text-xs font-medium text-tinta-2 tabular-nums`, subtítulo `text-xs text-tinta-3`, acciones a la derecha; `mb-6`.
- **Línea de indicadores**: `flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-linea-fuerte pb-4 text-sm text-tinta-2`; cifra `font-medium text-tinta tabular-nums`; separador `md:border-l md:border-linea-fuerte md:pl-5`; bajo `md` grilla de 2 columnas, celdas interactivas ≥ 44 px.
- **Tabla densa**: contenedor `rounded-md border border-linea-fuerte bg-panel overflow-x-auto`; `th` `h-9 bg-panel-hundido px-2.5 text-xs font-normal text-tinta-3 border-b border-linea-fuerte`; `tr` `h-11 border-b border-linea hover:bg-lienzo`; `td` `px-2.5 text-tabla align-middle`; seleccionada `bg-acento-suave`.
- **Lista de filas**: `min-h-11` (≥ 48 px bajo `lg`), `border-b border-linea-suave`, sin tarjetas.
- **Tarjeta**: `rounded-md border border-linea bg-panel p-4`.
- **Panel de propiedades (`dl`)**: filas separadas 12 px, `dt` `text-xs text-tinta-2`, `dd` `text-sm text-tinta`.
- **Pill de estado (`Estado`)**: punto de 6 px + texto `text-xs text-tinta-2`, sin fondo, `whitespace-nowrap`.
- **Chip de metadato (`Chip`)**: `inline-flex h-5 items-center gap-1 rounded-sm bg-panel-hundido px-1.5 text-xs text-tinta-2`; tono acento `bg-acento-suave text-acento`; tonos suaves para estados con fondo.
- **Franja de plazo hábil**: texto `text-xs tabular-nums` (`tinta-2`, `plazo-atento` bajo 25 %, `plazo-vencido` si vencido) y línea `h-[3px] max-w-[120px] rounded-[1px] bg-panel-hundido` con relleno `bg-plazo-ok|atento|vencido` (`bg-tinta-4` si resuelto); decorativa (`aria-hidden`).
- **Composer/redactor**: `rounded-md border border-linea-fuerte bg-panel overflow-hidden`; nota interna con cuerpo `bg-plazo-atento-suave`; pie `bg-lienzo border-t border-linea px-3 py-2`.
- **Diálogo**: `bg-panel border border-linea-fuerte rounded-lg shadow-flotante`, velo `bg-tinta/25`, cabecera `px-5 py-4 border-b border-linea` (título `text-sm font-semibold`), cuerpo `p-5`, pie `border-t border-linea px-5 py-4`; `max-h-[calc(100dvh-2rem)] overflow-y-auto`.
- **Formulario**: `Label` `text-xs font-medium text-tinta-2` encima del campo (6 px); campo `h-11 lg:h-9 rounded-sm border-linea-campo bg-panel px-2.5 text-base md:text-sm`; inválido `border-plazo-vencido`.
- **Estado vacío**: `py-14 text-center text-tinta-3`, ícono 24 px, `h3` 13 px/500, acción `variant="link"`.
- **Mensaje de error**: `role="alert" rounded-md border border-plazo-vencido/40 bg-plazo-vencido-suave p-3 text-sm text-plazo-vencido`.

## Accesibilidad

Resumen de ADR 0029: objetivos ≥ 44 × 44 px bajo 1024 px (excepciones solo `data-objetivo="en-linea"`, máximo 3 por pantalla); casillas con `CasillaTactil`; letra ≥ 12 px; estado y prioridad nunca solo por color (texto + punto o glifo); `label` en todo campo. Foco: `outline` de 2 px `acento` con `outline-offset` 2 px en todo elemento enfocable (base en `tema.css`); el anillo de 3 px solo en enlaces que cubren tarjetas. Contraste AA por `tema.test.ts` y axe en `npm run test:movil`.

## Móvil (bajo `lg`, 1024 px)

Menú lateral → barra inferior de 5 accesos y panel «Más» (ADR 0019); barra superior solo con migas (dos últimos niveles) y sin slot de acción; relleno de página 16 px; filas ≥ 48 px; botones y campos 44 px; indicadores en grilla de 2 columnas; plegar o reordenar con `useEsMovil` y `order-N lg:order-none`, nunca duplicando secciones.
