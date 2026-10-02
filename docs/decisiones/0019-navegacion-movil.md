# ADR 0019 — Navegación móvil: acceso "Más" con panel de menú

**Estado**: aceptada · 2026-09-30 · precisa a ADR 0011 (responsive); no cambia sus decisiones de fondo · precisada por ADR 0027 (Fase 6)

## Contexto

ADR 0011 fija bajo 1024 px una barra inferior con 4 accesos (Mi día, Tickets, Avisos, Nuevo) y oculta el menú lateral. Al implementar la Fase 1 quedó sin camino en celular todo lo demás: **Perfil** (y con él cerrar sesión, sesiones activas y cambiar contraseña), Clientes, OT, Cotizador, Horas, Reportes y Configuración; solo se llega escribiendo la URL. La spec §7 exige que Mi día, detalle de ticket, seguimiento con fotos y OT funcionen en celular, y ADR 0011 exige controles reales, objetivos ≥ 44 px y estado nunca solo por color. `menu.ts` ya declara todas las entradas con `grupo` y `permiso?`.

## Opciones consideradas

- **Quinto acceso "Más" en la barra que abre un panel (hoja) con el resto del menú.** Reutiliza la barra y `MENU`; un solo lugar de navegación; el panel es un diálogo Radix (foco, Escape y scroll resueltos).
- Cabecera móvil con botón de menú. Suma una segunda zona de navegación y quita alto útil en las cuatro pantallas de terreno.
- Quinto acceso "Perfil" solamente. Resuelve cerrar sesión pero deja Clientes, OT, Horas y Reportes sin camino.
- `DropdownMenu` en el quinto acceso. Los ítems son `menuitem`, no enlaces; incómodo al tacto con 10 entradas.

## Decisión

**Barra inferior** (`BarraInferior.tsx`, bajo `lg`): cinco accesos de igual ancho y ≥ 44 px de alto (se mantiene `min-h-14`): **Mi día**, **Tickets**, **Avisos**, **Nuevo** (enlaces `NavLink`, activo con fondo + `aria-current="page"`) y **Más** (`<button>` con ícono `Menu` de lucide y etiqueta de texto; es el `SheetTrigger`, por lo que lleva `aria-haspopup="dialog"` y `aria-expanded`). "Más" se pinta activo cuando la ruta actual no es de los otros cuatro accesos.

**Panel** (`PanelMenuMovil.tsx`, en `app/layout/`): componente shadcn **`Sheet`** (Radix Dialog; se genera ahora, ya previsto en ADR 0011) con `side="bottom"`, alto máximo 85 dvh y scroll interno, título visible "Menú" (`SheetTitle`) y botón de cierre. Contenido, de arriba abajo:
1. Enlace a **/perfil** con `Avatar`, nombre y etiqueta de rol (igual que al pie del menú lateral).
2. Los grupos **Tickets · Trabajo · Administración** con las entradas de `MENU` que tienen `grupo`, filtradas con la misma regla que `MenuLateral` (`!permiso || tienePermiso(rol, permiso)`; la función `visible` se saca a `menu.ts` para no duplicarla). Cada entrada es `NavLink` con ícono + texto, `min-h-11` (44 px).
3. Botón **Cerrar sesión** (variante secundaria, ancho completo): llama a `salir()` del `SesionProvider` y navega a `/ingresar`, como en `PerfilPage`.

**Apertura y cierre**: estado `abierto` local en `BarraInferior`. Se cierra al elegir cualquier enlace del panel (`onClick` → `setAbierto(false)`), con **Escape**, tocando el fondo oscurecido o el botón de cierre. Radix aporta foco atrapado dentro del panel, foco inicial en el primer elemento enfocable, retorno del foco al botón "Más" al cerrar, `aria-modal` y bloqueo del scroll del fondo. En escritorio (`lg`) el panel no se monta: el menú lateral sigue siendo la única navegación.

Sin cambios en `MenuLateral`, en las rutas ni en la Fase 8 del PLAN (que sigue siendo pulido de las cuatro pantallas de terreno; este ADR se implementa en Fase 1).

## Criterios de aceptación (tests)

- `BarraInferior.test.tsx` (vitest + Testing Library, con `ConSesion`): (a) hay 4 enlaces y un botón "Más" con `aria-haspopup="dialog"` y `aria-expanded="false"`; (b) al pulsar "Más" aparece un `role="dialog"` con nombre "Menú" y `aria-expanded="true"`; (c) admin ve Configuración dentro del panel, técnico no; ambos ven Tablero, Tabla, Línea de tiempo, Órdenes de trabajo, Cotizador, Horas, Reportes y Clientes; (d) el panel muestra el enlace "Perfil" con el nombre y la etiqueta del rol; (e) pulsar un enlace del panel lo cierra; (f) **Escape** cierra el panel y el foco vuelve al botón "Más"; (g) "Cerrar sesión" llama a `salir` y navega a `/ingresar`.
- `MenuLateral.test.tsx` sigue verde (la extracción de `visible` no cambia su salida).
- Playwright con `axe` (ADR 0011): la pantalla móvil (390 × 844) con el panel abierto se suma a las pantallas auditadas sin violaciones; cada acceso de la barra y cada entrada del panel miden ≥ 44 px de alto (`boundingBox`).

## Consecuencias

- Todas las rutas del menú quedan alcanzables en celular con la misma matriz de permisos que en escritorio; cerrar sesión está a dos toques.
- Se agrega `sheet.tsx` a `components/ui` (sin dependencias nuevas: Radix Dialog ya está en `radix-ui`).
- La barra pasa de 4 a 5 accesos (~78 px de ancho cada uno a 390 px); las etiquetas se mantienen en `text-xs` y en una sola línea.
