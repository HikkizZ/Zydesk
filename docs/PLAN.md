# Zydesk — Plan de implementación

> Nombre visible: **Zydesk** (configurable). Dominio: `desk.zytech.dev`. "Trazo" era el nombre provisorio del diseño.

> Fuentes: especificación funcional [`especificacion/contexto-app-trazo.md`](especificacion/contexto-app-trazo.md), diseño de referencia [`especificacion/diseno/`](especificacion/diseno/) y decisiones de arquitectura [`decisiones/`](decisiones/README.md).
> Si el plan y una ADR se contradicen, manda la ADR. Si la spec y el diseño se contradicen, se pregunta (ver [`decisiones/preguntas-abiertas.md`](decisiones/preguntas-abiertas.md)).

---

## 1. Forma de trabajo (roles de modelos)

| Rol | Modelo | Responsabilidad |
|---|---|---|
| Planificador / orquestador | **Opus 5.5** | Este plan, dividir cada fase en especificaciones de tarea, coordinar, verificar que los criterios de aceptación se cumplan. |
| Arquitecto / diseño | **Fable 5.1** | ADRs, decisiones de diseño, modelo de datos, contratos de API por fase, revisión de diseño al cierre de cada fase. Resuelve dudas de diseño que surjan al programar. |
| Programador | **Sonnet 5.5** | Implementa cada especificación de tarea con sus tests. No toma decisiones de diseño: si algo no está especificado, se detiene y pregunta. |

**Ciclo por fase**

```
1. Fable   → contrato de la fase (entidades, endpoints, pantallas, reglas)   → docs/specs/fase-N.md
2. Opus    → divide en tareas pequeñas con criterios de aceptación verificables
3. Sonnet  → implementa tarea por tarea: test primero → código → tests verdes
4. Opus    → verifica criterios, corre tests, prueba la app en el navegador
5. Fable   → revisión de diseño (consistencia con ADRs y con el diseño visual)
6. Usuario → revisa la demo de la fase y aprueba antes de pasar a la siguiente
```

**Revisión de seguridad al cierre de cada fase** (desde la Fase 3, antes del PR):

```
a. Fable  → revisa el diff completo de la fase con la skill security-review (.claude/skills)
b. Opus   → en paralelo, segunda revisión con /security-review de Claude Code
c. Opus   → valida cada hallazgo (reproducible con test o petición) y descarta falsos positivos
d. Sonnet → corrige cada hallazgo confirmado con un test que lo demuestre
e. Fable  → confirma solo lo corregido
```

Cada fase termina con: tests pasando, migraciones aplicadas desde cero, semillas de ejemplo cargadas, manual de usuario actualizado para lo construido.

---

## 2. Stack

Detalle y justificación en [ADR 0001](decisiones/0001-stack-y-monorepo.md).

| Capa | Tecnología |
|---|---|
| Monorepo | npm workspaces · TypeScript en todo |
| Backend (`apps/api`) | Node 22 · Express 5 · TypeORM 0.3 (solo migraciones, sin `synchronize`) · PostgreSQL 16 |
| Validación / contratos | Zod 4 en `packages/shared` (usado por API y web) · OpenAPI generado con `zod-openapi` + Scalar en `/api/docs` |
| Autenticación | Solo correo + contraseña (sin Microsoft: la organización no permite registro de aplicación) · sesión opaca en Postgres + cookie `__Host-` httpOnly · argon2id · límite de intentos · RBAC con la matriz de la spec · segundo factor con Cloudflare Access |
| Tareas programadas / cola | pg-boss (sobre Postgres, sin Redis): archivado 7 días, vencimientos, resumen diario 08:30, reintentos de correo |
| Fechas | date-fns v4 + `@date-fns/tz` · zona America/Santiago · motor de horas hábiles propio en `shared` |
| Correos | `mailparser` (.eml) · `@kenjiuno/msgreader` (.msg) · **sin correo saliente en v1** (canal `correo` previsto, no implementado) |
| Documentos | exceljs (.xlsx) · pdfmake (PDF) |
| Archivos | Disco local (volumen Docker) tras interfaz `Storage` |
| Frontend (`apps/web`) | React 19 · Vite · React Router 7 · TanStack Query · React Hook Form + Zod · Tailwind v4 (tokens de la spec) · shadcn/ui (Radix) · dnd-kit (Kanban) · Recharts (reportes) · fuentes autoalojadas (@fontsource) |
| Tests | Vitest · Supertest · Postgres real en Docker para tests de integración · Playwright opcional para flujos críticos |
| Despliegue | Docker Compose: `postgres`, `api`, `web` (nginx con build estático + proxy `/api`) · staging en el VPS Nexus detrás del nginx-proxy + Cloudflare Tunnel existentes |
| Bot (`apps/bot`, Fase 6) | grammY · long polling · solo habla con la API por la red interna de Docker |

---

## 3. Estructura de carpetas

```
tickets-app/
├── apps/
│   ├── api/                          # Backend Express
│   │   ├── src/
│   │   │   ├── app.ts                # Express: middlewares, rutas, errores
│   │   │   ├── server.ts             # Arranque HTTP + pg-boss
│   │   │   ├── config/               # env (validado con Zod), db, logger
│   │   │   ├── core/                 # Transversal
│   │   │   │   ├── auth/             # sesiones, límite de intentos, middleware requiere(permiso)
│   │   │   │   ├── historial/        # enTransaccion, registrarCambios, registrarEvento
│   │   │   │   ├── numeracion/       # TK correlativo o aleatorio (configurable), OT correlativa
│   │   │   │   ├── errores/          # errores de dominio → {error:{codigo,mensaje}}
│   │   │   │   └── http/             # validar(), ruta() + OpenAPI, paginación
│   │   │   ├── modulos/              # Un módulo por recurso
│   │   │   │   ├── usuarios/         #   *.entity.ts · *.service.ts · *.routes.ts · *.test.ts
│   │   │   │   ├── departamentos/
│   │   │   │   ├── clientes/
│   │   │   │   ├── categorias/
│   │   │   │   ├── tickets/
│   │   │   │   ├── tareas/
│   │   │   │   ├── mensajes/         # seguimientos y notas internas
│   │   │   │   ├── ots/
│   │   │   │   ├── cotizaciones/
│   │   │   │   ├── archivos/
│   │   │   │   ├── horas/
│   │   │   │   ├── avisos/
│   │   │   │   ├── reportes/
│   │   │   │   └── configuracion/
│   │   │   ├── avisos/               # despachador + canales (app, telegram; correo previsto)
│   │   │   ├── jobs/                 # archivado, vencimientos, resumen diario, limpieza
│   │   │   ├── integraciones/        # storage, parser de correo, xlsx, pdf
│   │   │   └── database/
│   │   │       ├── migraciones/
│   │   │       └── semillas/         # datos de ejemplo del diseño + feriados Chile
│   │   ├── test/                     # helpers de integración (BD de test, fábricas)
│   │   └── package.json
│   ├── web/                          # Frontend React + Vite
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── app/                  # router, providers, layout con menú lateral
│   │   │   ├── estilos/              # tema.css (@theme con tokens), fuentes
│   │   │   ├── components/
│   │   │   │   ├── ui/               # shadcn adaptados al sistema visual
│   │   │   │   └── dominio/          # PillEstado, PillPrioridad, Avatar, MontoCLP, Redactor…
│   │   │   ├── features/             # Una carpeta por pantalla/módulo
│   │   │   │   ├── auth/  mi-dia/  avisos/  tickets/  ots/  cotizador/
│   │   │   │   ├── horas/  clientes/  reportes/  configuracion/
│   │   │   │   └── <feature>/{pages,components,api.ts}
│   │   │   └── lib/                  # cliente API, formato fechas/montos es-CL
│   │   └── package.json
│   └── bot/                          # (Fase 6) Bot de Telegram con grammY
├── packages/
│   └── shared/                       # Código compartido API ↔ web ↔ bot
│       └── src/
│           ├── esquemas/             # Zod: entradas/salidas de la API
│           ├── enums/                # estados, prioridades, etapas, roles
│           ├── estados/              # máquinas de estado ticket / OT, efectosCierreOt()
│           ├── permisos.ts           # matriz de permisos de la spec
│           ├── horas-habiles/        # motor de plazos
│           ├── cotizacion/           # cálculo de líneas, IVA, totales
│           └── formato/              # CLP ($565.250), fechas es-CL
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   └── nginx.conf
├── docs/
│   ├── PLAN.md                       # este archivo
│   ├── especificacion/               # spec funcional + diseño de referencia
│   ├── decisiones/                   # ADRs + preguntas abiertas
│   ├── legal/                        # términos de uso, política de privacidad (borradores)
│   ├── specs/                        # contrato por fase (Fable) → lo que implementa Sonnet
│   ├── api/openapi.json              # generado
│   ├── manuales/
│   │   ├── usuario/                  # por rol: tecnico, coordinacion, administracion, solo-lectura
│   │   └── administracion.md         # alta de usuarios, horarios, tarifas, plantillas
│   ├── despliegue.md                 # instalación, variables, respaldos, actualización
│   └── CHANGELOG.md
├── docker-compose.yml                # producción/staging
├── docker-compose.dev.yml            # Postgres local para desarrollo y tests
├── .env.example
├── package.json                      # workspaces + scripts raíz (dev, test, lint, build)
├── CLAUDE.md                         # reglas para los agentes (convenciones, cómo correr tests)
└── README.md
```

---

## 4. Fases

Siguen el orden de la spec (§9). Cada fase entrega algo usable y demostrable.

### Fase 0 — Andamiaje
- Monorepo, TypeScript, lint/format, Vitest en los tres paquetes, `docker-compose.dev.yml` con Postgres.
- API mínima (`/api/salud`), web mínima con el layout (menú lateral oscuro, tokens, fuentes).
- `CLAUDE.md`, `README.md`, `.env.example`, git inicial.
- **Verificación:** `npm run dev` levanta API + web; `npm test` pasa; la web muestra el menú con el sistema visual.

### Fase 1 — Base
- Auth: ingreso con correo+contraseña, "mantener sesión", límite de intentos, sesiones activas; Administración restablece contraseñas (cambio obligatorio al ingresar). Pantalla **0 Ingreso** (sin botón Microsoft).
- Aceptación de términos y privacidad en el primer ingreso (versión y fecha guardadas); enlaces en el pie.
- Usuarios, roles, permisos (matriz), departamentos con horarios y feriados (creables y editables por Administración), clientes (+ contactos, bolsa de horas **opcional**, áreas internas), categorías con plazos.
- Configuración de marca (nombre, logo) y numeración (prefijo, inicial, dígitos; tickets correlativos o aleatorios; OT siempre correlativa; COT deriva de la OT).
- Núcleo transversal: historial (`registrarCambios`), numeración, errores, OpenAPI.
- Motor de horas hábiles en `shared` con tests de tabla (colación, viernes corto, feriados, cruce de fin de semana).
- Pantallas: **11 Clientes**, **12 Configuración** (Equipo y permisos, Departamentos y horarios, Categorías y plazos, Numeración y marca).
- **Verificación:** tests de permisos por rol en cada endpoint; un Técnico no puede cambiar configuración (403); los tests del motor de plazos pasan.

### Fase 2 — Tickets
- CRUD de tickets, máquina de estados (En espera exige "de quién", Descartado exige motivo, Duplicado exige original), responsables (principal) y seguidores.
- Correo adjunto: arrastrar .msg/.eml o pegar texto → vista previa → autocompletado; original descargable; adjuntos internos opcionales.
- Actividad: seguimientos, notas internas, historial, con pestañas; redactor Seguimiento/Nota interna; fotos; menciones @; registro de horas desde el redactor.
- Tareas del ticket.
- Archivado automático a 7 días (job).
- Pantallas: **4 Nuevo ticket**, **5 Detalle de ticket**, **1 Tablero Kanban** (dnd-kit + menú "Cambiar estado"), **2 Tabla**.
- **Verificación:** cada cambio genera `Evento` (test de cobertura); parseo de .eml y .msg de ejemplo; detalle de ticket usable en celular.

### Fase 3 — OT y cierre
- Convertir ticket en OT (tareas abiertas pasan a la OT, vínculo doble, evento en historial); varias OT por ticket.
- Tipo facturable/interna (cambiable en Borrador), casilla "Descuenta de la bolsa" si el cliente tiene bolsa vigente, etapas, datos por tipo, tareas con horas estimadas/reales, galería de fotos y archivos, seguimiento con "Copiar al ticket".
- **Cierre de OT (regla 4.6)**: diálogo obligatorio, bloque "Qué va a pasar", transacción única OT + ticket + historial + avisos; facturación independiente del resultado.
- Advertencia al resolver un ticket con OT abierta.
- Pantallas: **6 Orden de trabajo**, **6b Cerrar OT**.
- **Verificación:** tests de integración de ambos caminos del cierre (resolvió / no resolvió con sus 3 opciones) y rollback si algo falla.

### Fase 4 — Cotizador
- Cotización por OT facturable, versiones (duplicar como v2), líneas, descuentos, IVA desactivable, CLP/UF, condiciones y nota interna.
- Importar horas de tareas; plantillas de cotización (Configuración → Plantillas).
- Aprobación del cliente con respaldo adjunto obligatorio.
- Descargas .xlsx y PDF, registradas en el historial de la OT. Tarifas en Configuración.
- Pantalla: **7 Cotizador**; pestañas **Tarifas** y **Plantillas** de Configuración.
- **Verificación:** el caso del diseño da $475.000 neto y $565.250 con IVA; la API recalcula totales e ignora los del cliente.

### Fase 5 — Horas
- Registro semanal por persona (filas ticket/OT/"Sin ticket", columnas días, totales frente a la jornada); facturables / internas / fuera de horario.
- Coordinación ve las horas de cualquiera. Horas de OT suman a tareas y facturación.
- Pantalla: **13 Registro de horas**.
- **Verificación:** totales diarios comparados con la jornada del departamento; permisos de lectura cruzada.

### Fase 6 — Visibilidad y bot de Telegram
- Avisos: despachador con canales app + telegram, preferencias por evento/canal, centro de avisos, resumen diario 08:30 L-V por Telegram.
- Bot `apps/bot` con grammY (long polling, sin puertos abiertos en el VPS). Vinculación con código de un solo uso generado en la app. Comandos `/hoy`, `/mis`, `/ticket 1048`; responder un aviso para registrar seguimiento; aprobar con un botón; crear ticket reenviando un mensaje. Todo pasa por la API con los permisos del usuario.
- Pantallas: **8 Mi día**, **9 Avisos** (con vinculación de Telegram), **3 Línea de tiempo** (más: agrupar por persona/cliente, aviso de vencidos, ancho mínimo de barra), **10 Listado de OT y facturación** (con exportación .xlsx para facturación y marcar Facturada).
- **Verificación:** cada evento de la lista de 4.10 genera aviso respetando preferencias; el bot solo ve y hace lo que su usuario puede hacer en la web.

### Fase 7 — Reportes
- Indicadores, gráficos (horas por semana, carga vs capacidad, resolución por prioridad vs objetivo), tabla por cliente, exportación .xlsx.
- Pantalla: **14 Reportes**.
- **Verificación:** cifras cuadran con las semillas; Solo lectura puede ver reportes y montos.

### Fase 8 — Móvil
- Pulido móvil de Mi día, detalle de ticket, seguimiento con fotos y OT.

### Fase 9 — Puesta en marcha
- Despliegue con Docker Compose en el VPS (`desk.zytech.dev`), respaldos (`pg_dump` + archivos a un destino externo), guía de actualización.
- Documentos legales revisados por quien corresponda antes de cargar datos reales.
- Carga de datos reales (usuarios, departamentos, clientes, tarifas), apagado de semillas de ejemplo.

---

## 5. Documentación y manuales

Se escriben durante cada fase, no al final ([ADR 0012](decisiones/0012-documentacion-y-manuales.md)).

| Documento | Para quién | Contenido |
|---|---|---|
| `README.md` | Desarrolladores | Qué es, cómo levantar en local, scripts, estructura. |
| `docs/manuales/usuario/*.md` | Equipo, por rol | Tareas paso a paso con capturas: crear ticket desde correo, registrar seguimiento, convertir en OT, cerrar OT, cotizar, registrar horas, Mi día. |
| `docs/manuales/administracion.md` | Administración | Crear cuentas, roles, departamentos y horarios, feriados, categorías y plazos, tarifas, plantillas, correo de avisos. |
| `docs/despliegue.md` | Quien opera el servidor | Variables de entorno, Docker Compose, token del bot, respaldos y restauración, actualización. |
| `docs/legal/` | Usuarios y organización | Términos de uso y política de privacidad (borradores: Fable redacta, Opus revisa, requieren revisión legal). |
| `/api/docs` + `docs/api/openapi.json` | Desarrolladores / bot | Referencia de la API generada desde los esquemas Zod. |
| `docs/decisiones/` | Desarrolladores | ADRs. |
| `docs/CHANGELOG.md` | Todos | Cambios por versión. |

Los manuales también se muestran como ayuda dentro de la app.

---

## 6. Diseño preparado para el bot

El bot llega en la Fase 6, pero el núcleo se diseña desde la Fase 1 para recibirlo:
1. **Avisos por canales** (ADR 0008): la lógica de negocio emite eventos; el despachador decide canales. Telegram es un canal más.
2. **Sesiones con origen** (ADR 0002): el bot actúa como la persona vinculada, con sus permisos.
3. **Toda escritura por la API**: el bot nunca toca la base de datos; reutiliza los mismos endpoints y el mismo historial.
4. **Preferencias por canal**: la tabla ya contempla canales, se agrega `telegram` sin migrar datos.

---

## 7. Pendientes

Estado completo en [`decisiones/preguntas-abiertas.md`](decisiones/preguntas-abiertas.md). A1–A8 y B1–B14 aceptadas por el usuario (2026-09-29). Quedan:

- ~~Segundo factor~~: resuelto, **Cloudflare Access** delante de `desk.zytech.dev` (se configura en la Fase 9).
- **Responsable del tratamiento de datos**: necesario para redactar la política de privacidad.
- **Respaldos**: destino externo al VPS.
- Datos reales antes de producción: `[TARIFA]`, `[RUT]`/logo/razón social, horarios reales.

Riesgos principales: respaldos (el VPS guarda un solo punto de restauración), parseo de .msg, corrección del motor de horas hábiles, sin correo saliente (Telegram es el único canal al celular).
