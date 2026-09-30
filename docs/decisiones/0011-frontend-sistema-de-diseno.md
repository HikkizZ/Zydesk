# ADR 0011 — Frontend: sistema de diseño, accesibilidad, responsive y estado

**Estado**: aceptada · 2026-09-29 · precisada por ADR 0019 (navegación móvil) y por ADR 0022 (tablero de solo lectura, sin dnd-kit)

## Contexto

Diseño a 1440 px, sobrio y denso; tokens de la sección 7 de la spec (colores, Bricolage Grotesque / IBM Plex Sans / IBM Plex Mono, radios 6–12 px). Accesibilidad: controles reales, objetivos táctiles ≥ 44 px, contraste ≥ 4,5:1, estado y prioridad nunca solo por color. "Mi día", detalle de ticket, seguimiento con fotos y OT deben funcionar en celular.

## Opciones consideradas

- Tailwind v4 + shadcn/ui (Radix) — tokens en CSS, primitivas accesibles (diálogos, menús, combobox, tabs) copiadas al repo y adaptadas; sin runtime de CSS-in-JS.
- MUI / Mantine — rápido pero pelea con la estética propia del diseño.
- CSS a mano — control total, pero rehacer diálogos y menús accesibles no aporta.

## Decisión

**Tokens** (`apps/web/src/estilos/tema.css`, `@theme` de Tailwind v4), nombres en español según la spec: `--color-fondo #F3F1EC`, `--color-superficie`, `--color-superficie-suave`, `--color-tinta`, `--color-tinta-2`, `--color-borde`, `--color-acento #2F47C4`, y pares texto/fondo/punto para `urgente`, `alta`, `media`, `baja`, `en-espera`, `resuelto` (= facturable), `interna`, `nota-interna`; `--font-titulo` (Bricolage Grotesque), `--font-texto` (IBM Plex Sans), `--font-mono` (IBM Plex Mono); `--radius-sm 6px / md 8px / lg 12px`. Las fuentes se **autoalojan** con `@fontsource` (sin llamadas a Google desde una app interna). Sin modo oscuro (no lo pide la spec).

**Componentes**: shadcn/ui inicializado con los tokens anteriores; se generan solo los que se usan (button, input, select, dialog, dropdown-menu, tabs, popover, combobox, checkbox, switch, toast, tooltip, sheet). Sobre ellos, componentes propios de dominio: `Pill` de estado/prioridad/tipo (siempre **texto + punto/ícono**), `Avatar` con iniciales, `Codigo` (mono), `Monto`, `FechaRelativa`, `Redactor` (Seguimiento/Nota interna con cambio de fondo), `SubidaFotos`. Íconos `lucide-react` (trazo fino).

**Accesibilidad**: altura mínima de controles interactivos 44 px en móvil (40 px en escritorio con área táctil ampliada), `label` para todo campo, foco visible con `outline` de acento, `aria-live` para toasts, Kanban con dnd-kit **más** un menú "Cambiar estado" en cada tarjeta (teclado y móvil). Un test de contraste de los tokens con `axe` en Playwright sobre 3 pantallas.

**Responsive**: mobile-first en las cuatro pantallas exigidas; el resto es "usable pero no optimizado" (scroll horizontal en Kanban, Tabla y Línea de tiempo). Menú lateral → barra inferior con 4 accesos (Mi día, Tickets, Avisos, Nuevo) bajo 1024 px. El detalle de ticket y la OT apilan el panel derecho debajo del contenido; el redactor queda fijo al pie con la cámara a un toque.

**Estado**: TanStack Query para todo lo que viene del servidor (claves por recurso: `['tickets', filtros]`, `['ticket', id]`, `['ticket', id, 'actividad']`), invalidación tras cada mutación, `staleTime` 30 s y refetch al volver a la pestaña (suficiente "tiempo real" para 10 personas; sin websockets). React Hook Form + `zodResolver` con esquemas de `shared`. Estado de UI (pestaña, filtros) en la URL (`searchParams`) para que los enlaces sean compartibles. Sin Redux/Zustand.

**Rutas** (React Router 7, `createBrowserRouter`): `/ingresar`, `/mi-dia`, `/avisos`, `/tickets` (tablero) · `/tickets/tabla` · `/tickets/linea-de-tiempo` · `/tickets/nuevo` · `/tickets/:id`, `/ots` · `/ots/:id`, `/cotizaciones/:id`, `/horas`, `/reportes`, `/clientes` · `/clientes/:id`, `/configuracion/:pestana`. Guardas por permiso con la matriz de `shared`.

**Gráficos**: Recharts con los dos colores de reportes (`#2F47C4` facturables, `#D98A1C` internas) y etiquetas de texto en cada barra (no solo leyenda por color).

## Consecuencias

- Todos los colores pasan por tokens: cambiar la paleta es editar un archivo.
- shadcn copia código al repo: se asume mantenerlo nosotros (a cambio de no depender de versiones).
- Sin websockets ni SSE: los avisos se refrescan cada 60 s con `refetchInterval`; se acepta el retraso.
