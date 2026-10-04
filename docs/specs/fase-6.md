# Fase 6 — Visibilidad y bot de Telegram · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: `docs/PLAN.md` §1 (revisión de seguridad al cierre), §4 Fase 6, §6 (diseño preparado para el bot) y §7; ADR **0002** (sesiones `origen = bot`, Bearer), 0003, 0005, **0008** (avisos, canales, pg-boss, bot con long polling y código de un solo uso), 0010, 0011, 0012 (`04-bot-telegram.md`), **0013** (sin correo; Telegram único canal externo; resumen diario por Telegram; red interna), **0016** (línea de tiempo), **0017** (logs, auditoría, `redact`), 0019, **0020** (repo público: sin secretos), 0021 (menciones sin avisos, `vence_hoy`), 0022 (listas de solo lectura), 0023 (puntos 8, 14, 15), 0024, 0025 (`cotizacion.respondida`, pantalla 10, "Por aprobar"), 0026; `preguntas-abiertas.md` **A2**, **A8**, **B2**, B7, **B8**, B10, B11, riesgos D5 y D9; spec funcional §3 (glosario: responsable principal recibe avisos de vencimiento; seguidor), **§4.10 Avisos**, §4.6 ("se avisa a responsables y seguidores"), §4.8, §5 pantallas **3**, **8**, **9**, **10**, §6 (`Aviso`, `PreferenciaAviso`, `Mencion`), §8 (bot: `/hoy`, `/mis`, `/ticket 1048`, responder un aviso, aprobar con un botón, crear ticket reenviando un mensaje); diseño "Avisos" (`pantallas-logica.txt`: 8 filas de preferencias con columnas app / correo, 8 avisos de ejemplo, filtros Todos · Menciones · Asignaciones · Vencimientos, "Marcar todo como leído", `navBadge`), "Mi día" (cuadros Vencen hoy · Por aprobar · Te mencionaron · Tus tareas; listas; tareas marcables; "Detenidos hace días"), "Línea de tiempo del equipo" (10 días hábiles, fila por persona con "lo que hace ahora", barras por estado, punto por prioridad, columna de hoy) y "Órdenes de trabajo" (indicadores, chips, etiquetas "Esperando aprobación" y "Borrador · por aprobar", "Exportar para facturación (.xlsx)").
>
> Rama `feat/fase-6-visibilidad-telegram`; PR a `main` al cerrar con CI verde (ADR 0020) tras la revisión de seguridad de PLAN §1 (si se acepta §25.1, dos PR: `6a` y `6b`). Entorno: el de la Fase 5. Todo lo construido en las Fases 0–5 (`ruta()`, `enTransaccion`, `registrarEvento`, `registrarAuditoria`, `publicarPendientes` / `EventoPendiente`, `eventosDominio`, `autenticar` con `Authorization: Bearer` y `csrf` que lo exime, `crearSesion` con `origen`, `cerrarSesionesDeUsuario`, pg-boss con `iniciarJobs`, `cargarCalendario` y el motor de horas hábiles, `listarTickets`/`listarTablero` con `vencido`/`vence_hoy`, `listarOts`, exceljs, `redact` del logger, fábricas, `ingresarComo` directo, BD de test por bloque) **se reutiliza y se extiende**; no se reescribe. Convenciones de `CLAUDE.md`: `snake_case` en datos, `type` explícito en `@Column`, SQL a mano en migraciones, servicios como único punto de escritura, un módulo escribe en tablas de otro solo a través del servicio de ese módulo con el mismo `tx`, eventos de dominio publicados **después** del commit, `logger` sin contenido (solo ids; nunca `texto` de avisos ni `chat_id`), procesos de desarrollo detenidos con `taskkill /PID <pid> /T /F`.

## 0. Alcance

**Entra**: tablas `preferencia_aviso`, `aviso`, `aviso_envio`, `codigo_vinculo`, `vinculo_telegram`; **eventos de dominio** nuevos en `shared/eventos.ts` (`ticket.asignado`, `ticket.seguidor_agregado`, `tarea.asignada`, `mencion`, `ticket.estado_cambiado`, `ticket.seguimiento_nuevo`, `ticket.vence_pronto`, `ticket.vencio`) publicados tras el commit desde los servicios de tickets, mensajes y tareas con la convención `pendientes` (§1.3); **despachador** (`apps/api/src/avisos/`) que escucha todos los eventos de dominio, resuelve destinatarios, aplica preferencias y crea una fila `aviso` por persona, y encola `aviso.enviar` para Telegram; **canales** `app` (la fila) y `telegram` (Bot API `sendMessage` con `fetch`, sin grammY en la API); **preferencias** por persona × evento × canal con valores por defecto del diseño; **centro de avisos** (pantalla **9**: filtros, no leídos, marcar leído / todo leído, badge en el menú con sondeo de 60 s, panel de preferencias y **vinculación de Telegram** con código de un solo uso); **jobs** `tickets.vencimientos` (cada 30 min; `vence_pronto` 24 h de reloj antes, B2; `vencio`), `avisos.resumen_diario` (08:30 L–V America/Santiago, solo Telegram) y cola `aviso.enviar` (3 reintentos con backoff); limpieza de códigos y avisos leídos en `mantencion.limpiar`; **vinculación** (`POST /api/yo/telegram/codigo`, `GET|DELETE /api/yo/telegram`, `POST /api/bot/vincular` autenticado con `X-Bot-Key`) que crea una **sesión `origen = bot`** por usuario (ADR 0002/0008), revocable desde Sesiones activas, al desvincular y por los mecanismos de ADR 0013; **`apps/bot`** con grammY (long polling; habla solo con la API; sin BD; guarda los tokens por `chat_id` cifrados en disco) con `/start <código>`, `/vincular`, `/desvincular`, `/hoy`, `/mis`, `/ticket 1048`, `/ayuda`, responder un aviso para registrar un seguimiento, botón "Aprobar" en OT internas por aprobar, crear ticket reenviando un mensaje (con confirmación); **Mi día** (pantalla **8**, `GET /api/mi-dia`: vencen hoy, vencidos, por aprobar (B8), te mencionaron, tus tareas marcables, detenidos hace días); **Línea de tiempo** (pantalla **3** + ADR 0016: `GET /api/tickets/linea-de-tiempo`, agrupar por persona / cliente, "N vencidos", ancho mínimo, escala Día / 2 semanas / Mes en días hábiles del departamento de quien mira, A8); **pantalla 10 completa** (indicadores por facturar $, esperando al cliente $, en ejecución, horas internas del mes; etiquetas "Esperando aprobación" y "Borrador · por aprobar" (A2); **"Exportar para facturación (.xlsx)"** con los filtros vigentes, auditado como `exportacion`); etiqueta "Bot de Telegram" en Sesiones activas; semillas (avisos y preferencias de ejemplo, vínculo **no** se siembra); manuales (`04-bot-telegram.md` nuevo), CHANGELOG, `.env.example`, README, ADR 0027; revisión de seguridad de cierre (PLAN §1).

**No entra**: canal `correo` (ADR 0013; el valor queda en el enum y las columnas de correo siguen ocultas en la UI); webhook de Telegram (ADR 0008: long polling); Dockerfiles, `docker-compose.yml` de producción y `docs/despliegue.md` (Fase 9; aquí solo las variables de entorno y cómo correr el bot en local); alertas de Grafana a Telegram (ADR 0017, Fase 9); aviso "el cliente aún no responde la cotización" (aparece en el diseño, no en la spec §4.10); alerta de bolsa al 80 % (ADR 0015); SSE / websockets (D9: sondeo); "Marcar facturada" desde la lista de OT (sigue en el detalle, ADR 0022/0023.5); fotos y adjuntos al crear un ticket desde Telegram (solo texto, §25.13); aprobación del **cliente** desde el bot (exige respaldo adjunto, spec §4.5); grupos o canales de Telegram (solo chats privados); reportes (Fase 7); exportación de horas (Fase 7); edición de avisos; Playwright; CD.

## 1. Bloques y paralelismo

| Bloque                             | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                              | Depende de                               | Archivos que toca (exclusivos)                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6A** Contratos y BD              | `shared` (`eventos.ts`, `enums/aviso.ts`, `esquemas/{aviso,mi-dia,linea-tiempo,telegram,bot}.ts`, cambios en `esquemas/{ot,auth}.ts`, `errores.ts`, `avisos/preferencias.ts`), migración 13, entidades, fábricas                                                                                                                                                                                                                      | —                                        | `packages/shared/src/**`, `apps/api/src/database/**` (salvo semillas), `apps/api/src/modulos/avisos/*.entity.ts`, `apps/api/src/modulos/telegram/*.entity.ts`, `apps/api/test/fabricas.ts`, `apps/api/src/database/fabricas-fase6.test.ts`                                                                                                                                                                 |
| **6B** Eventos, despachador y avisos | publicación de eventos en `tickets.service.ts`, `mensajes.service.ts`, `tareas.service.ts` (§6); `avisos/{despachador,destinatarios,textos,canales}.ts`; `modulos/avisos/**` (API de avisos y preferencias); job `tickets.vencimientos`; `app.ts`; `server.ts` (conectar despachador)                                                                                                                                              | 6A                                       | `apps/api/src/avisos/**`, `apps/api/src/modulos/avisos/**` (salvo entities), `apps/api/src/modulos/tickets/tickets.service.ts`, `apps/api/src/modulos/mensajes/mensajes.service.ts`, `apps/api/src/modulos/tareas/tareas.service.ts`, `apps/api/src/modulos/ots/ots.cierre.service.ts` (solo §6.5), `apps/api/src/core/jobs/{vencimientos,boss}.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts` |
| **6C** Telegram en la API          | `modulos/telegram/**` (códigos, vínculo, sesión bot, rutas `/api/yo/telegram*` y `/api/bot/*`), `core/auth/clave-bot.ts`, `integraciones/telegram/cliente.ts` (Bot API), `avisos/canales/telegram.ts`, cola `aviso.enviar`, job `avisos.resumen_diario`, `mantencion.limpiar` (códigos y avisos), `config/env.ts`, `core/historial/auditoria.ts` (acciones nuevas)                                                                   | 6A; 6B para `aviso.enviar` (firma §7.3) | `apps/api/src/modulos/telegram/**` (salvo entities), `apps/api/src/core/auth/clave-bot.ts`, `apps/api/src/integraciones/telegram/**`, `apps/api/src/avisos/canales/telegram.ts`, `apps/api/src/core/jobs/{enviar-aviso,resumen-diario,mantencion}.ts`, `apps/api/src/config/env.ts`, `apps/api/src/core/historial/auditoria.ts`, `.env.example`                                                       |
| **6D** Visibilidad en la API       | `modulos/mi-dia/**`, línea de tiempo en `tickets.consulta.ts` + `tickets.routes.ts`, indicadores y exportación en `ots.consulta.ts`, `ots.routes.ts`, `integraciones/xlsx/ots.xlsx.ts`                                                                                                                                                                                                                                                | 6A                                       | `apps/api/src/modulos/mi-dia/**`, `apps/api/src/modulos/tickets/{tickets.consulta,tickets.routes,tickets.tipos}.ts`, `apps/api/src/modulos/ots/{ots.consulta,ots.routes,ots.service,ots.tipos}.ts`, `apps/api/src/integraciones/xlsx/ots.xlsx.ts`                                                                                                                                                      |
| **6E** Web avisos y Telegram       | `features/avisos/**`, badge en `MenuLateral`/`BarraInferior`, etiqueta de origen en Perfil → Sesiones                                                                                                                                                                                                                                                                                                                                 | 6B, 6C (API); componentes puros contra 6A | `apps/web/src/features/avisos/**`, `apps/web/src/app/layout/**`, `apps/web/src/features/perfil/**`                                                                                                                                                                                                                                                                                                      |
| **6F** Web Mi día, línea de tiempo y OT | `features/mi-dia/**`, `features/tickets/pages/LineaDeTiempoPage.tsx` + `features/tickets/linea-tiempo/**`, `features/ots/lista/**`, `features/ots/pages/OtsPage.tsx`, `lib/fechas.ts`                                                                                                                                                                                                                                              | 6D (API); componentes puros contra 6A    | `apps/web/src/features/mi-dia/**`, `apps/web/src/features/tickets/pages/LineaDeTiempoPage.tsx`, `apps/web/src/features/tickets/linea-tiempo/**`, `apps/web/src/features/tickets/api.ts`, `apps/web/src/features/ots/**`, `apps/web/src/lib/**`                                                                                                                                                         |
| **6G** Bot                         | `apps/bot/**` (workspace nuevo), `package.json` raíz (workspace y `dev`), `eslint`/`tsconfig` si hace falta                                                                                                                                                                                                                                                                                                                             | 6A (esquemas); 6C para la prueba manual  | `apps/bot/**`, `package.json`, `package-lock.json`, `tsconfig.base.json` (solo si hace falta)                                                                                                                                                                                                                                                                                                                |
| **6H** Semillas, docs y cierre     | `semillas/desarrollo-avisos.ts`, manuales, CHANGELOG, `openapi.json`, `CLAUDE.md`, README, ADR 0027, revisión de seguridad                                                                                                                                                                                                                                                                                                             | todo                                     | `apps/api/src/database/semillas/**`, `docs/**`, `CLAUDE.md`, `README.md`                                                                                                                                                                                                                                                                                                                                    |

**En paralelo sin conflicto**: 6B, 6C y 6D tras 6A (6C espera la firma de `encolarEnvio` de §7.3, que 6B publica primero); 6E con 6F tras la API; 6G desde 6A (contra los esquemas; su integración real exige 6C). 6A va primero. Si se divide en dos PR (§25.1): **6a** = 6A, 6B, 6D, 6E, 6F + docs; **6b** = 6C, 6G + docs. Orden general en §22.

### 1.1 Base de test por bloque (obligatorio con agentes en paralelo)

Igual que en las Fases 2–5: `npm run db:test:crear -- <sufijo>` y `npx cross-env TEST_BD_SUFIJO=<sufijo> npm run test -w @zydesk/api`. Sufijos: 6A usa `zydesk_test` (sin variable); 6B `6b`; 6C `6c`; 6D `6d`; 6H `6h`. 6E, 6F y 6G no usan BD (el bot se prueba con dobles, §19.6). CI sigue con `zydesk_test`.

### 1.2 Orden de bloqueo de filas (obligatorio)

Sin cambios: **ticket → OT → cotización → tarea/mensaje**. Las tablas nuevas de avisos no participan: el despachador escribe `aviso` en **su propia transacción corta**, después del commit del negocio (§7.1), sin bloquear ticket ni OT. `marcarLeido` bloquea solo la fila `aviso` (`FOR UPDATE`). La vinculación bloquea la fila `codigo_vinculo` (`FOR UPDATE`) y luego `vinculo_telegram` del usuario; nunca toca ticket ni OT. Aprobar una OT desde el bot pasa por `aprobarOt` existente (bloquea solo la OT).

### 1.3 Convención `pendientes` (obligatoria para publicar desde funciones `*EnTx`)

Las funciones que corren dentro de una transacción ajena (`cambiarEstadoEnTx`, `guardarResponsablesEnTx`, `insertarMensaje`, `moverTareasAbiertas`, `crearTicketEnTx`) **no publican**: reciben un parámetro opcional `pendientes?: EventoPendiente[]` y hacen `pendientes?.push([nombre, datos])`. La función pública (`cambiarEstado`, `crearMensaje`, `crearTarea`, …) crea el arreglo, lo pasa, y llama a `publicarPendientes(pendientes)` **después** de `enTransaccion` (ADR 0003/0023.14; mismo patrón que `ots.etapas.service.ts`). Si la transacción falla, nada se publica. El cierre de OT (`ots.cierre.service.ts`) **no** pasa `pendientes` a `cambiarEstadoEnTx` ni a `guardarResponsablesEnTx`: `ot.cerrada` ya avisa a los mismos destinatarios y evitamos avisos duplicados (§6.5).

## 2. Versiones nuevas

| Paquete                                | Dónde            | Versión   | Licencia | Para qué                                                                                                      |
| -------------------------------------- | ---------------- | ---------------- | -------- | ----------------------------------------------------------------------------- |
| `grammy`                               | `apps/bot`       | `^1.46.0` | MIT      | Bot de Telegram con long polling (ADR 0008); trae `@grammyjs/types` (MIT)                                     |
| `pino`                                 | `apps/bot`       | `^9.14.0` | MIT      | Logs con el esquema de ADR 0017 (`servicio: 'bot'`); misma versión que la API                                 |
| `pino-pretty`                          | `apps/bot` (dev) | `^13.1.3` | MIT      | Solo `NODE_ENV=development`                                                                                   |
| `zod`                                  | `apps/bot`       | `^4.6.5`  | MIT      | Validar `env` y las respuestas de la API con los esquemas de `@zydesk/shared`                                 |
| `tsx`, `rimraf`, `cross-env`, `vitest` | `apps/bot` (dev) | las del monorepo | MIT | Mismos scripts que `apps/api`                                                                                 |

Sin AGPL/GPL (regla del CHANGELOG sobre `ua-parser-js`). **Sin paquetes nuevos en `api`, `web` ni `shared`**: la API envía a Telegram con `fetch` nativo (Node 22), la exportación usa exceljs, la web usa `table`, `tabs`, `switch`, `badge`, `dialog`, `alert-dialog`, `tooltip`, `scroll-area`, `checkbox` existentes y la línea de tiempo se dibuja con CSS Grid (sin biblioteca de Gantt). La API **no** depende de grammY (el envío es un `POST` JSON). Si al implementar hace falta otro paquete, **detente y pregunta**.

## 3. Base de datos y contratos (bloque 6A)

### 3.1 Migración `1791000000013-avisos` (SQL a mano; `down` inverso; no inserta datos)

```sql
-- Preferencias explícitas; sin fila rige el valor por defecto de `shared` (§4.3). `correo` se acepta pero no se usa (ADR 0013).
CREATE TABLE preferencia_aviso (
  usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  evento text NOT NULL CHECK (evento IN ('asignacion','mencion','vence_pronto','vencio','estado_ticket','seguimiento','cotizacion','por_facturar','resumen_diario')),
  canal text NOT NULL CHECK (canal IN ('app','telegram','correo')),
  activo boolean NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, evento, canal),
  -- el resumen diario no existe "en la app"
  CHECK (evento <> 'resumen_diario' OR canal <> 'app')
);

-- Una fila por persona destinataria (ADR 0008). `texto` nunca lleva contenido de mensajes ni montos (§4.4).
CREATE TABLE aviso (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  evento text NOT NULL CHECK (evento IN ('asignacion','mencion','vence_pronto','vencio','estado_ticket','seguimiento','cotizacion','por_facturar')),
  tipo text NOT NULL CHECK (tipo IN ('ticket_asignado','seguidor_agregado','tarea_asignada','ot_por_aprobar','mencion','vence_pronto','vencio','estado_ticket','ot_cerrada','ot_cancelada','seguimiento','cotizacion_aprobada','cotizacion_rechazada','por_facturar')),
  clave text NULL,                                      -- idempotencia: 'vence_pronto:ticket:12:2026-10-02T23:00:00.000Z'
  texto text NOT NULL CHECK (length(texto) <= 300),
  enlace text NOT NULL,                                 -- ruta de la web: '/tickets/12', '/ots/5'
  entidad text NOT NULL CHECK (entidad IN ('ticket','ot')),
  entidad_id integer NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}',                    -- { codigo, ot_id?, mensaje_id?, tarea_id?, cotizacion_id? }: solo ids y códigos
  actor_id integer NULL REFERENCES usuario(id) ON DELETE SET NULL,
  en_app boolean NOT NULL DEFAULT true,                 -- preferencia app al crearse (§4.3): false = no se muestra ni cuenta
  leido_en timestamptz NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX aviso_clave_uq ON aviso (usuario_id, clave) WHERE clave IS NOT NULL;
CREATE INDEX aviso_usuario_creado_idx ON aviso (usuario_id, creado_en DESC);
CREATE INDEX aviso_no_leido_idx ON aviso (usuario_id) WHERE leido_en IS NULL AND en_app;
CREATE INDEX aviso_entidad_idx ON aviso (entidad, entidad_id);

-- Estado del envío por canal externo (el canal `app` es la fila `aviso`).
CREATE TABLE aviso_envio (
  aviso_id bigint NOT NULL REFERENCES aviso(id) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('telegram','correo')),
  estado text NOT NULL CHECK (estado IN ('pendiente','enviado','fallido','omitido')),
  intentos integer NOT NULL DEFAULT 0,
  error text NULL,                                      -- código corto de Telegram o 'sin_vinculo' / 'sin_token'; nunca el texto del aviso
  enviado_en timestamptz NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aviso_id, canal)
);

-- Código de un solo uso (ADR 0008): se guarda solo el hash; expira a los 10 min.
CREATE TABLE codigo_vinculo (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_hash text NOT NULL UNIQUE,
  usuario_id integer NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  expira_en timestamptz NOT NULL,
  usado_en timestamptz NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX codigo_vinculo_usuario_idx ON codigo_vinculo (usuario_id);

-- Un chat por persona y una persona por chat. `sesion_id` = la sesión `origen = bot` vigente (NULL si se cerró o venció).
CREATE TABLE vinculo_telegram (
  usuario_id integer PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL UNIQUE,
  telegram_usuario text NULL,                           -- @usuario informativo, puede faltar
  sesion_id uuid NULL REFERENCES sesion(id) ON DELETE SET NULL,
  vinculado_en timestamptz NOT NULL DEFAULT now(),
  ultimo_envio_en timestamptz NULL
);
```

`down`: `DROP TABLE` en orden inverso. `zydesk_app` recibe CRUD por los `ALTER DEFAULT PRIVILEGES` de `01-roles.sql` (ADR 0017); `evento` y `auditoria` no cambian. `reiniciarBd` (ADR 0025.21) no necesita cambios: las FK nuevas son `CASCADE`/`SET NULL` y no crean ciclos. Entidades TypeORM (`type` explícito): `PreferenciaAviso`, `Aviso`, `AvisoEnvio` en `modulos/avisos/`; `CodigoVinculo`, `VinculoTelegram` en `modulos/telegram/`; registradas en `database/entidades.ts`.

### 3.2 `packages/shared`

```ts
// enums/aviso.ts
export const EVENTOS_AVISO = ['asignacion','mencion','vence_pronto','vencio','estado_ticket','seguimiento','cotizacion','por_facturar','resumen_diario'] as const
export const ETIQUETA_EVENTO_AVISO: Record<EventoAviso, string> = {   // las 8 filas del diseño + el resumen
  asignacion: 'Me asignan un ticket o una tarea', mencion: 'Me mencionan con @',
  vence_pronto: 'Un ticket mío vence en 24 horas', vencio: 'Un ticket mío venció',
  estado_ticket: 'Cambia el estado de un ticket que sigo', seguimiento: 'Nuevo seguimiento en un ticket que sigo',
  cotizacion: 'Cotización aprobada o rechazada', por_facturar: 'OT cerrada y lista para facturar',
  resumen_diario: 'Resumen diario a las 08:30 (lunes a viernes)',
}
export const CANALES = ['app', 'telegram', 'correo'] as const          // `correo` previsto, sin implementar (ADR 0013)
export const CANALES_ACTIVOS = ['app', 'telegram'] as const
export const TIPOS_AVISO = [...los 14 del CHECK de `aviso.tipo`] as const
export const FILTROS_AVISO = ['todos', 'menciones', 'asignaciones', 'vencimientos'] as const
export const EVENTOS_POR_FILTRO: Record<Exclude<FiltroAviso,'todos'>, EventoAviso[]> = { menciones: ['mencion'], asignaciones: ['asignacion'], vencimientos: ['vence_pronto','vencio'] }

// avisos/preferencias.ts (puro)
export const PREFERENCIAS_POR_DEFECTO: Record<EventoAviso, Record<'app'|'telegram', boolean>>   // diseño: app todo true; telegram true salvo estado_ticket y seguimiento; resumen_diario { app: false, telegram: true }
export function resolverPreferencias(filas: { evento, canal, activo }[]): PreferenciasResueltas   // defecto + explícitas; `correo` siempre false

// eventos.ts (se agregan; los 5 actuales no cambian)
'ticket.asignado':          { ticket_id: number; usuario_ids: number[] /* nuevos responsables */; actor_id: number | null }
'ticket.seguidor_agregado': { ticket_id: number; usuario_ids: number[] /* nuevos seguidores */; actor_id: number | null }
'tarea.asignada':           { tarea_id: number; ticket_id: number | null; ot_id: number | null; usuario_id: number; actor_id: number | null }
'mencion':                  { mensaje_id: number; ticket_id: number | null; ot_id: number | null; tipo: TipoMensaje; usuario_ids: number[]; actor_id: number }
'ticket.estado_cambiado':   { ticket_id: number; estado_anterior: EstadoTicket; estado: EstadoTicket; actor_id: number | null }
'ticket.seguimiento_nuevo': { ticket_id: number; mensaje_id: number; actor_id: number; copiado: boolean }
'ticket.vence_pronto':      { ticket_id: number; fecha_limite: string /* ISO */ }
'ticket.vencio':            { ticket_id: number; fecha_limite: string }

// esquemas/aviso.ts
export const AvisoSalida = z.object({
  id: z.number(), evento: z.enum(EVENTOS_AVISO), tipo: z.enum(TIPOS_AVISO), texto: z.string(), enlace: z.string(),
  entidad: z.enum(['ticket','ot']), entidad_id: id, datos: z.record(z.string(), z.unknown()),
  actor: UsuarioBreve.nullable(), leido: z.boolean(), leido_en: instante.nullable(), creado_en: instante,
  telegram: z.enum(['enviado','pendiente','fallido','omitido']).nullable(),   // null si no se encoló
})
export const AvisosQuery = esquemaPaginacion.extend({ filtro: z.enum(FILTROS_AVISO).default('todos'), solo_no_leidos: booleanoTexto.optional() })
export const AvisosSalida = z.object({ datos: z.array(AvisoSalida), total: z.number(), pagina: z.number(), por_pagina: z.number(), no_leidos: z.number() })
export const NoLeidosSalida = z.object({ no_leidos: z.number() })
export const LeerTodosSalida = z.object({ marcados: z.number() })
export const PreferenciaFila = z.object({ evento: z.enum(EVENTOS_AVISO), app: z.boolean(), telegram: z.boolean() })
export const PreferenciasSalida = z.object({ filas: z.array(PreferenciaFila).length(9), telegram_vinculado: z.boolean() })
export const PreferenciasEntrada = z.object({ filas: z.array(PreferenciaFila).min(1).max(9) })   // parcial: solo las filas que cambian
  .refine(sin eventos repetidos).refine(v => v.filas.every(f => f.evento !== 'resumen_diario' || f.app === false), { path: ['filas'], message: 'El resumen diario solo va por Telegram' })

// esquemas/telegram.ts
export const TelegramEstadoSalida = z.object({
  vinculado: z.boolean(), telegram_usuario: z.string().nullable(), vinculado_en: instante.nullable(),
  sesion_bot_activa: z.boolean(),                 // hay sesión `origen = bot` vigente (comandos disponibles)
  bot_usuario: z.string().nullable(),             // TELEGRAM_BOT_USUARIO para el enlace t.me; null si no está configurado
  disponible: z.boolean(),                        // TELEGRAM_BOT_TOKEN configurado en la API
})
export const CodigoVinculoSalida = z.object({ codigo: z.string().length(8), expira_en: instante, enlace: z.string().url().nullable() /* https://t.me/<bot>?start=<codigo> */ })
// esquemas/bot.ts (rutas /api/bot/*, autenticadas con X-Bot-Key)
export const BotVincularEntrada = z.object({ codigo: z.string().trim().toUpperCase().length(8).regex(/^[A-HJ-NP-Z2-9]{8}$/), chat_id: z.number().int(), telegram_usuario: z.string().trim().max(64).nullable().default(null) })
export const BotVincularSalida = z.object({ token: z.string(), usuario: UsuarioBreve.extend({ rol: z.enum(ROLES) }), expira_en: instante })

// esquemas/mi-dia.ts
export const TareaMiDia = TareaSalida.extend({ destino: z.object({ tipo: z.enum(['ticket','ot']), id, codigo: z.string(), titulo: z.string() }) })
export const MiDiaSalida = z.object({
  fecha: fechaIso,                                                       // hoy en Santiago
  vencen_hoy: z.array(TicketResumen), vencidos: z.array(TicketResumen),  // tickets míos (responsable) abiertos
  por_aprobar: z.array(OtResumen),                                       // OT internas en borrador con aprobador_id = yo (B8); [] sin `ots.aprobar`
  menciones: z.array(AvisoSalida),                                       // tipo 'mencion', no leídos, en_app, máx. 10
  tareas: z.array(TareaMiDia),                                           // abiertas, responsable = yo, destino no cerrado; por fecha (nulas al final), máx. 20
  detenidos: z.array(TicketResumen),                                     // míos abiertos con actualizado_en < hoy − 3 días, los más antiguos primero, máx. 10
  conteos: z.object({ vencen_hoy, vencidos, por_aprobar, menciones, tareas, detenidos: z.number() }),   // totales sin recorte
})

// esquemas/linea-tiempo.ts (ADR 0016)
export const LineaTiempoQuery = z.object({ desde: fechaIso, hasta: fechaIso }).refine(hasta >= desde y ≤ 62 días)
export const ItemLineaTiempo = z.object({
  id, codigo: z.string(), asunto: z.string(), estado: z.enum(ESTADOS_TICKET), prioridad: z.enum(PRIORIDADES),
  inicio: fechaIso,                                   // fecha (Santiago) de inicio_planificado, si no de creado_en
  limite: fechaIso.nullable(),                        // fecha_limite; null = "sin fecha" (barra de ancho mínimo, §25.8)
  vencido: z.boolean(), cerrado: z.boolean(),
  responsable_id: id.nullable(), responsables: z.array(Responsable), cliente: ClienteBreve.nullable(),
  ot_vinculada: z.object({ id, codigo: z.string(), tipo: z.enum(TIPOS_OT) }).nullable(),
  actualizado_en: instante,
})
export const DiaLineaTiempo = z.object({ fecha: fechaIso, habil: z.boolean(), feriado: z.string().nullable(), hoy: z.boolean() })
export const LineaTiempoSalida = z.object({ dias: z.array(DiaLineaTiempo), items: z.array(ItemLineaTiempo), vencidos: z.number(), personas: z.array(UsuarioBreve) /* activos, para filas vacías en modo persona */ })

// esquemas/ot.ts (cambios)
OtResumen.esperando_cliente: z.boolean()             // facturable && etapa cotizada && cotización vigente `enviada` (A2: etiqueta "Esperando aprobación")
OtResumen.por_aprobar: z.boolean()                   // interna && etapa borrador && aprobador_id !== null (A2: "Borrador · por aprobar")
export const IndicadoresOtsSalida = z.object({
  por_facturar: z.object({ n: z.number(), neto: z.number().nullable() }),        // estado_facturacion = por_facturar; Σ neto CLP de la cotización vigente
  esperando_cliente: z.object({ n: z.number(), neto: z.number().nullable() }),   // esperando_cliente = true
  en_ejecucion: z.number(),                                                       // etapa en_ejecucion (ambos tipos)
  horas_internas_mes: z.number(),                                                 // Σ registro_horas.horas de OT internas con fecha en el mes actual (Santiago)
})

// esquemas/auth.ts (cambio)
SesionSalida.origen ya existe; sin cambios de esquema. La web etiqueta `bot` como "Bot de Telegram".
```

Códigos nuevos en `shared/errores.ts`: `CODIGO_INVALIDO` (400: código inexistente, vencido o usado; sin distinguir), `VINCULACION_BLOQUEADA` (429), `TELEGRAM_CHAT_EN_USO` (409: el chat ya está vinculado a otra cuenta), `TELEGRAM_NO_DISPONIBLE` (503: la API no tiene `TELEGRAM_BOT_TOKEN`), `CLAVE_BOT_INVALIDA` (401). Se reutilizan `VALIDACION`, `NO_AUTENTICADO`, `SIN_PERMISO`, `NO_ENCONTRADO`, `CONFLICTO`, `TRANSICION_INVALIDA`, `OT_CERRADA`, `TICKET_CERRADO`.

Tests `esquemas.test.ts` (shared): `resolverPreferencias([])` devuelve 9 filas con los valores del diseño; una fila explícita `{ estado_ticket, telegram, true }` la sobrescribe; `PreferenciasEntrada` rechaza `resumen_diario` con `app: true` y eventos repetidos; `BotVincularEntrada` normaliza `' ab23cdef '` → `'AB23CDEF'` y rechaza `'ABCDEFGH'` (contiene letras ambiguas `I`, `O`) y 7 caracteres; `LineaTiempoQuery` rechaza `hasta < desde` y rangos > 62 días; `EVENTOS_POR_FILTRO.vencimientos` tiene 2 eventos.

### 3.3 Fábricas (`test/fabricas.ts`)

- `crearAviso(usuario_id, { evento?, tipo?, texto?, entidad?, entidad_id?, clave?, leido?, en_app?, creado_en?, actor_id? })`: inserta directo; por defecto `mencion` sobre un ticket creado al vuelo.
- `fijarPreferencia(usuario_id, evento, canal, activo)`: `INSERT … ON CONFLICT DO UPDATE`.
- `crearVinculoTelegram(usuario_id, { chat_id?, con_sesion? = true })`: inserta `vinculo_telegram` y, con `con_sesion`, una sesión `origen = 'bot'` (`crearSesion` con `mantener: true`); devuelve `{ chat_id, token | null }`.
- `crearCodigoVinculo(usuario_id, { expirado?, usado? })`: devuelve el código en claro (el hash va a BD).
- `ingresarComoBot(app, usuario)`: crea vínculo + sesión bot y devuelve `{ agente, token }` con `agente = request.agent(app).set('Authorization', \`Bearer ${token}\`)` **sin** cookie ni `X-Requested-With` (es cómo llama el bot).
- `comoBot(app)`: `request.agent(app).set('X-Bot-Key', env.BOT_API_KEY)` para `/api/bot/*`.
- Test `fabricas-fase6.test.ts`: dos avisos con la misma `clave` para el mismo usuario violan `aviso_clave_uq` (y no para usuarios distintos); `preferencia_aviso` rechaza `resumen_diario` + `app`; dos vínculos con el mismo `chat_id` violan `UNIQUE`; borrar la sesión bot deja `vinculo_telegram.sesion_id = NULL` y conserva el vínculo; `codigo_vinculo.codigo_hash` es único.

## 4. Reglas de avisos (valen para API, web y bot)

### 4.1 Eventos de dominio → avisos

| Evento de dominio                          | `aviso.evento` (preferencia) | `aviso.tipo`                             | Destinatarios (siempre activos; **nunca el actor**, §24.3)                                                   | `clave`                                                   | Texto (§4.4)                                                                                     | `enlace`              |
| -------------------------------- | ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `ticket.asignado`                          | `asignacion`                 | `ticket_asignado`                        | `usuario_ids` (los **nuevos** responsables; quien ya era responsable no recibe nada)                          | —                                                         | «Camila Rojas te asignó TK-1048 «Error al emitir facturas desde el ERP»»                        | `/tickets/:id`        |
| `ticket.seguidor_agregado`                 | `asignacion`                 | `seguidor_agregado`                      | `usuario_ids` (nuevos seguidores)                                                                            | —                                                         | «Te agregaron como seguidor de TK-1048 «…»» (con el nombre del actor si existe)                  | `/tickets/:id`        |
| `tarea.asignada`                           | `asignacion`                 | `tarea_asignada`                         | `usuario_id`                                                                                                 | —                                                         | «Sebastián Díaz te asignó la tarea «Cargar CAF» en OT-0218»                                      | `/tickets/:id` o `/ots/:id` |
| `ot.por_aprobar` (existe)                  | `asignacion`                 | `ot_por_aprobar`                         | `aprobador_id`                                                                                               | `por_aprobar:ot:<id>`                                     | «Valentina Soto te pidió aprobar la OT-0219 (interna)»                                           | `/ots/:id`            |
| `mencion`                                  | `mencion`                    | `mencion`                                | `usuario_ids`                                                                                                | —                                                         | «Camila Rojas te mencionó en una nota interna de TK-1048» / «…en un seguimiento de OT-0218»      | `/tickets/:id#mensaje-<id>` o `/ots/:id#mensaje-<id>` |
| `ticket.vence_pronto`                      | `vence_pronto`               | `vence_pronto`                           | responsable **principal** del ticket (glosario §3; §25.5)                                                    | `vence_pronto:ticket:<id>:<fecha_limite ISO>`             | «TK-1051 «Servidor de archivos…» vence hoy a las 18:00» / «vence mañana a las 09:00»            | `/tickets/:id`        |
| `ticket.vencio`                            | `vencio`                     | `vencio`                                 | responsable principal                                                                                        | `vencio:ticket:<id>:<fecha_limite ISO>`                   | «TK-1051 «…» venció el 2 oct a las 18:00»                                                        | `/tickets/:id`        |
| `ticket.estado_cambiado`                   | `estado_ticket`              | `estado_ticket`                          | responsables ∪ seguidores del ticket                                                                         | —                                                         | «Tomás Reyes cambió TK-1028 a En espera · repuesto» (`espera_de` con etiqueta; motivo **no**)    | `/tickets/:id`        |
| `ot.cerrada` (existe)                      | `estado_ticket`              | `ot_cerrada`                             | `destinatarios_ids` (responsables ∪ seguidores, calculados antes de reasignar, ADR 0023.14)                  | `ot_cerrada:ot:<id>`                                      | «OT-0218 se cerró · resolvió el ticket TK-1048» / «· el ticket TK-1048 sigue abierto»            | `/ots/:id`            |
| `ot.cancelada` (existe)                    | `estado_ticket`              | `ot_cancelada`                           | `destinatarios_ids`                                                                                          | `ot_cancelada:ot:<id>`                                    | «OT-0219 fue cancelada · TK-1053» (sin el motivo)                                                | `/ots/:id`            |
| `ticket.seguimiento_nuevo`                 | `seguimiento`                | `seguimiento`                            | responsables ∪ seguidores del ticket                                                                         | —                                                         | «Sebastián Díaz registró un seguimiento en TK-1048» (si `copiado`: «…copió un seguimiento de OT-0218 a TK-1048») | `/tickets/:id#mensaje-<id>` |
| `cotizacion.respondida` (existe)           | `cotizacion`                 | `cotizacion_aprobada` / `cotizacion_rechazada` | `destinatarios_ids`                                                                                     | `cotizacion:<cotizacion_id>:<resultado>`                  | «El cliente aprobó la cotización COT-0218 v1 · Viña Santa Clara» / «…rechazó…» (sin montos)      | `/cotizaciones/:cotizacion_id` |
| `ot.por_facturar` (existe)                 | `por_facturar`               | `por_facturar`                           | todos los usuarios activos con `ots.facturar` (Administración y Coordinación)                                | `por_facturar:ot:<id>`                                    | «OT-0216 se cerró y quedó lista para facturar · Clínica Los Robles» (sin monto)                  | `/ots/:id`            |

Reglas: las **notas internas** no generan `seguimiento` (spec §4.10 dice "seguimiento"); sí generan `mencion`. Un seguimiento **copiado al ticket** genera `ticket.seguimiento_nuevo` con `copiado: true` (es un mensaje nuevo del ticket); el seguimiento de cierre que `cerrarOt` inserta en el ticket **no** lo genera (lo cubre `ot_cerrada`). Mensajes de OT sin copia no avisan a nadie salvo por mención (la spec habla de "un ticket que sigo"). Destinatarios inactivos (`usuario.activo = false`) se descartan. El **actor** nunca se avisa a sí mismo (si te asignas, te mencionas o cambias el estado de tu propio ticket, no hay aviso para ti).

### 4.2 Idempotencia

`clave` única por `(usuario_id, clave)`: el despachador inserta con `ON CONFLICT DO NOTHING` y solo encola Telegram para las filas realmente insertadas. Así `tickets.vencimientos` (cada 30 min) no repite avisos; si la `fecha_limite` cambia, la clave cambia y se avisa de nuevo. Los eventos sin clave (asignaciones, menciones, seguimientos, estado) crean una fila por ocurrencia.

### 4.3 Preferencias

Sin fila en `preferencia_aviso` rige `PREFERENCIAS_POR_DEFECTO` (diseño "Avisos"): **app** activo en los 8 eventos; **telegram** activo salvo `estado_ticket` y `seguimiento`; `resumen_diario` solo `telegram`, activo. Al despachar: `app = false` → la fila se crea con `en_app = false` (no aparece en el centro, no cuenta en el badge, no entra en Mi día) pero existe como registro y como base del envío; `telegram = true` **y** vínculo existente **y** `TELEGRAM_BOT_TOKEN` configurado → se inserta `aviso_envio (telegram, pendiente)` y se encola `aviso.enviar`; `telegram = true` **sin vínculo** → no se crea `aviso_envio` (no hay a dónde enviar ni nada que mostrar); `telegram = true` con vínculo pero **sin token** en la API → `aviso_envio (telegram, omitido, error = 'sin_token')`, para que Administración note la configuración faltante. Decisión §24.4, pregunta §25.19. `correo` se guarda si llega por `PUT` pero la UI no lo muestra (ADR 0013).

### 4.4 Texto de los avisos (sin contenido sensible)

`avisos/textos.ts` arma `texto` (≤ 300 caracteres) y `enlace` a partir de **ids, códigos, asunto/título, nombre del actor, etiquetas de estado y nombre del cliente**. **Nunca** incluye el texto de mensajes ni notas, montos, `motivo_cierre`, `motivo_cancelacion`, `espera_detalle`, condiciones ni notas internas de cotizaciones. El asunto se recorta a 80 caracteres con «…». Como todo rol autenticado puede leer tickets, OT y clientes (ADR 0002) y Solo lectura ve notas internas (B10), el asunto y el nombre del cliente no filtran nada que el destinatario no pueda ver en la web; aun así, cada destinatario es responsable, seguidor, mencionado, aprobador o alguien con `ots.facturar`: el aviso solo llega a quien tiene relación con la entidad. El mensaje de Telegram es `texto` + enlace absoluto `${WEB_URL}${enlace}` (§7.3); el bot no agrega nada más.

### 4.5 Permisos

Un aviso es de su `usuario_id`: solo él lo lista y lo marca leído (`GET /api/avisos/:id` no existe). Preferencias y vínculo son de la sesión (`/api/yo/...`). No hay permiso nuevo: `aprobar` desde el bot exige `ots.aprobar`, `seguimiento` exige `tickets.editar`, crear ticket exige `tickets.editar`; todo lo decide `requiere()` sobre la sesión del usuario (PLAN §6). Las rutas `/api/bot/*` se autentican con la clave compartida (`X-Bot-Key`) y **solo** sirven para la vinculación (§9.3); el bot no tiene ninguna otra puerta.

## 5. API de avisos y preferencias (bloque 6B, `modulos/avisos/`)

| Método y ruta                        | Permiso | Entrada               | Salida                    | Errores / notas                                                                                    |
| --------------------------------- | ------- | --------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/avisos`                    | sesion  | `AvisosQuery`         | `AvisosSalida`            | solo `usuario_id = actor` y `en_app`; `filtro` por `EVENTOS_POR_FILTRO`; orden `creado_en DESC`; `no_leidos` del actor (sin filtro) |
| `GET /api/avisos/no-leidos`          | sesion  | —                     | `NoLeidosSalida`          | para el badge (sondeo de 60 s); sin `evento` ni `auditoria`                                        |
| `POST /api/avisos/:id/leer`          | sesion  | —                     | `AvisoSalida`             | aviso ajeno → **404** (no revela existencia); ya leído → 200 idempotente                            |
| `POST /api/avisos/leer-todos`        | sesion  | —                     | `LeerTodosSalida`         | `UPDATE … WHERE usuario_id = actor AND leido_en IS NULL AND en_app`                                 |
| `GET /api/yo/avisos/preferencias`    | sesion  | —                     | `PreferenciasSalida`      | `resolverPreferencias` sobre las filas del actor; `telegram_vinculado` desde `vinculo_telegram`     |
| `PUT /api/yo/avisos/preferencias`    | sesion  | `PreferenciasEntrada` | `PreferenciasSalida`      | `INSERT … ON CONFLICT DO UPDATE` por (evento, canal) de las filas enviadas; sin `evento`/`auditoria` (son preferencias personales, como las de la spec §6) |

Mutaciones en `enTransaccion`; `usuario_id` siempre el de la sesión. `AvisoSalida.telegram` sale de `LEFT JOIN aviso_envio … canal = 'telegram'`. `avisos.routes.ts` con `ruta()` (etiqueta `Avisos`); `app.ts` monta `crearRutasAvisos()` tras `crearRutasHoras()`.

## 6. Publicación de eventos en los servicios existentes (bloque 6B)

Con la convención §1.3. No cambia ningún `evento` de la tabla `evento` ni ninguna respuesta HTTP.

1. **`tickets.service.ts`**: `crearTicketEnTx` publica `ticket.asignado` con `usuario_ids = [principal, ...otros]` (sin el actor) y `ticket.seguidor_agregado` con los seguidores (sin el actor); `guardarResponsablesEnTx` publica `ticket.asignado` solo con los ids que **no** estaban antes (ni como principal ni como otro; cambiar de "otro" a principal no avisa); `guardarSeguidores` publica `ticket.seguidor_agregado` con los nuevos; `cambiarEstadoEnTx` publica `ticket.estado_cambiado` (también al reabrir y en el `UPDATE` de `espera_de` sin transición de ADR 0023.13 **no**: solo cuando `estado` cambia). `editarTicket` no publica nada (B7).
2. **`mensajes.service.ts`**: `insertarMensaje` publica `mencion` si hay mencionados (sin el autor); `crearMensaje` publica además `ticket.seguimiento_nuevo` si `tipo = 'seguimiento'`; `copiarAlTicket` publica `ticket.seguimiento_nuevo { copiado: true }` por cada seguimiento copiado (notas copiadas no) **salvo** cuando lo llama el cierre de OT (parámetro `pendientes` ausente, §1.3); `crearMensajeDeOt` publica solo `mencion` (y, con `copiar_al_ticket`, lo que publique `copiarAlTicket`).
3. **`tareas.service.ts`**: `crearTarea` / `crearTareaDeOt` publican `tarea.asignada` si `responsable_id` no es nulo ni el actor; `editarTarea` publica `tarea.asignada` cuando `responsable_id` cambia a otra persona (no al quitarlo); marcar hecha, mover (`moverTareasAbiertas`) y quitar no publican.
4. **`ots.*.service.ts`**: ya publican `ot.cerrada`, `ot.por_facturar`, `ot.por_aprobar`, `ot.cancelada`, `cotizacion.respondida`; sin cambios salvo el punto 5.
5. **`ots.cierre.service.ts`**: al orquestar `cambiarEstadoEnTx`, `guardarResponsablesEnTx`, `insertarMensaje` y `copiarAlTicket` **no** pasa `pendientes` (sus avisos los cubre `ot.cerrada`); sí conserva los propios (`ot.cerrada`, `ot.por_facturar`, `convertido_en_ot` no es evento de dominio). Si el cierre crea `nueva_ot` con responsable distinto, el responsable nuevo **no** recibe `ticket_asignado` en esta fase (lo ve en `ot_cerrada` como responsable del ticket; decisión §24.6).
6. **`core/eventos/dominio.ts`**: `NOMBRES` del oyente de log pasa a cubrir **todos** los eventos (`Object.keys` de un registro tipado en `shared`: `NOMBRES_EVENTOS_DOMINIO`), y el despachador se suscribe desde `server.ts` con `conectarDespachador()` (también en `crearApp()` para tests, con un flag para no duplicar oyentes).

Tests (`core/eventos/publicacion.test.ts`, bloque 6B): con un oyente de prueba en `eventosDominio`, cada mutación de arriba emite exactamente los eventos esperados con sus ids; `cerrarOt` emite `ot.cerrada` y **no** `ticket.estado_cambiado` ni `ticket.asignado`; una transacción fallida (p. ej. `mencionados_ids` inválidos) no emite nada.

## 7. Despachador y canales (bloques 6B y 6C, `apps/api/src/avisos/`)

### 7.1 `despachador.ts`

`conectarDespachador()` suscribe `despachar(nombre, datos)` a cada evento de `NOMBRES_EVENTOS_DOMINIO`. `despachar`:

1. Resuelve destinatarios con `destinatarios.ts` (una consulta por evento: responsables, seguidores, principal, aprobador, usuarios con `ots.facturar` = `rol IN ('admin','coordinacion')`; todos con `activo`), quita `actor_id`, deduplica.
2. Carga en una consulta la entidad para el texto (`codigo`, `asunto`/`titulo`, cliente, nombre del actor, etiqueta de estado) y arma `texto`, `enlace`, `tipo`, `clave`, `datos` con `textos.ts`.
3. Lee las preferencias de todos los destinatarios en una consulta (`resolverPreferencias` por usuario) y los vínculos (`vinculo_telegram`).
4. `enTransaccion`: por destinatario `INSERT INTO aviso … ON CONFLICT (usuario_id, clave) WHERE clave IS NOT NULL DO NOTHING RETURNING id` (sin clave: `INSERT` simple); por cada id devuelto con `telegram` activo: `INSERT aviso_envio (pendiente)` si hay vínculo y token, u `omitido/sin_token`. Devuelve la lista de `{ aviso_id }` a encolar.
5. Tras el commit: `encolarEnvio(boss, aviso_id, 'telegram')` por cada uno (§7.3). Si `boss` es `null` (`EJECUTAR_JOBS=false`, tests sin boss) deja `aviso_envio` en `pendiente` y lo registra con `logger.debug` (otro proceso con jobs los recogerá: §8.3 `avisos.reencolar`).
6. Errores: `logger.error({ err, evento, entidad_id })` y nada más; **nunca** se propagan al servicio que publicó (ya respondió). `logger.debug({ evento, aviso_ids, usuario_ids })` al terminar; jamás `texto`.

Tests (`avisos/despachador.test.ts`, BD): para cada fila de §4.1, publicar el evento con fábricas y comprobar filas `aviso` (usuario, evento, tipo, texto esperado literal, enlace, `en_app`), ausencia del actor, exclusión de inactivos, `clave` con `ON CONFLICT` (publicar dos veces `ticket.vence_pronto` deja una fila), `en_app = false` cuando la preferencia app está apagada, `aviso_envio` solo con vínculo, `omitido/sin_token` sin token (`env` sobrescrito con `vi.stubEnv` o inyección), y que `texto` no contiene el `texto` del mensaje ni el `motivo`.

### 7.2 Interfaz `Canal` (`avisos/canales/canal.ts`, ADR 0008)

```ts
export interface Canal {
  nombre: 'telegram' | 'correo';
  enviar(aviso: AvisoParaEnviar, destino: { chat_id: number }): Promise<void>;
}
```

`CanalApp` no existe como clase: la fila es el canal. `CanalCorreo` no se implementa (ADR 0013). Solo `CanalTelegram` (§7.3).

### 7.3 `CanalTelegram` y cola `aviso.enviar` (bloque 6C)

- `integraciones/telegram/cliente.ts`: `enviarMensaje(chat_id, texto_html, opciones?: { reply_markup? })` → `POST https://api.telegram.org/bot<TOKEN>/sendMessage` con `fetch`, `parse_mode: 'HTML'`, `disable_web_page_preview: true`, timeout 10 s (`AbortSignal.timeout`). Escapa `<`, `>`, `&` de todo texto dinámico (`escaparHtml`). Errores: `429` → lanza `ErrorTelegram('reintentar', retry_after)`; `403` (bot bloqueado por el usuario) y `400 chat not found` → `ErrorTelegram('definitivo', codigo)`; red/5xx → `reintentar`. El token **jamás** aparece en logs ni en errores: `ErrorTelegram.message` lleva solo `codigo`; el logger ya redacta `token`/`authorization`, y la URL con el token no se registra nunca (se registra `{ aviso_id, intento, codigo }`).
- Mensaje: `<b>Zydesk</b>\n${escaparHtml(texto)}\n<a href="${WEB_URL}${enlace}">Abrir ${codigo}</a>`; para `tipo = 'ot_por_aprobar'` agrega `reply_markup: { inline_keyboard: [[{ text: 'Aprobar OT', callback_data: 'aprobar:ot:<id>' }, { text: 'Ver en la web', url }]] }` (el bot atiende el callback, §19.4). Los demás avisos no llevan botones; "responder un aviso" funciona por el código `TK-####` / `OT-####` presente en el texto (§19.4).
- Cola `aviso.enviar` (`core/jobs/enviar-aviso.ts`): `createQueue` con `{ retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 300 }`; `encolarEnvio(boss, aviso_id, canal)` → `boss.send('aviso.enviar', { aviso_id, canal }, { singletonKey: \`${aviso_id}:${canal}\` })`. Worker: carga aviso + vínculo; sin vínculo → `omitido/sin_vinculo`; envía; `enviado` con `enviado_en` y `vinculo_telegram.ultimo_envio_en`; `ErrorTelegram('definitivo')` → `fallido` sin reintentar (devuelve sin lanzar); `reintentar` → `intentos + 1`, lanza para que pg-boss reintente; al agotar → `fallido`. Logs: `job_id`, `aviso_id`, `intento`, `codigo`.
- `avisos.reencolar` (parte de `mantencion.limpiar`, §8.3): `aviso_envio` en `pendiente` con `actualizado_en < now() − 1 h` se reencolan (cubre el caso `boss = null` y caídas entre el commit y el `send`).

Tests (`avisos/canales/telegram.test.ts` y `core/jobs/enviar-aviso.test.ts`): `fetch` doblado con `vi.spyOn(globalThis, 'fetch')`: cuerpo enviado con `chat_id`, `parse_mode HTML`, texto escapado (`<img>` del asunto llega como `&lt;img&gt;`), URL con `WEB_URL`; `429` → reintento; `403` → `fallido` definitivo; éxito → `enviado`; sin vínculo → `omitido`; la URL de `fetch` no aparece en el logger de test ni el token en ningún log.

## 8. Jobs (bloques 6B y 6C, `core/jobs/`)

| Job                        | Cron (`America/Santiago`) | Hace                                                                                                                                                                                                                                                                                                                       | Bloque |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `tickets.vencimientos`     | `*/30 * * * *`            | Tickets con `cerrado_en IS NULL`: `fecha_limite BETWEEN now() AND now() + interval '24 hours'` → `publicar('ticket.vence_pronto', { ticket_id, fecha_limite })`; `fecha_limite < now()` y `fecha_limite > now() − interval '7 days'` → `publicar('ticket.vencio', …)`. La `clave` del aviso evita duplicados (§4.2); el job no escribe en `ticket` ni deja `evento`. | 6B     |
| `avisos.resumen_diario`    | `30 8 * * 1-5`            | `singletonKey = fecha`. Si hoy es feriado general (`feriado` con `departamento_id IS NULL`) no envía nada (§25.3). Por cada usuario activo con vínculo y `resumen_diario/telegram` activo: arma `cargarMiDia(usuario)` (§10) y, si algún conteo > 0, envía **un** mensaje (§8.2) por `CanalTelegram` directamente (sin fila `aviso`: el resumen no es un aviso del centro). Logs: `usuario_id`, `enviados`, `omitidos`. | 6C     |
| `aviso.enviar`             | cola                      | §7.3                                                                                                                                                                                                                                                                                                                       | 6C     |
| `mantencion.limpiar` (ampliado) | `0 3 * * *`          | además de lo actual: `DELETE FROM codigo_vinculo WHERE expira_en < now() − interval '1 day'`; `DELETE FROM aviso WHERE leido_en < now() − interval '90 days'` (§25.11); reencolar `aviso_envio` pendientes de > 1 h (§7.3).                                                                                               | 6C     |

`iniciarJobs` registra 6 colas (test `boss.test.ts` actualizado: `mantencion.limpiar`, `tickets.archivar`, `archivos.limpiar_huerfanos`, `tickets.vencimientos`, `avisos.resumen_diario`, `aviso.enviar`; programaciones con `tz: 'America/Santiago'`; `aviso.enviar` sin `schedule`). `server.ts` pasa `boss` al despachador (`conectarDespachador({ boss })`).

### 8.1 `tickets.vencimientos` — tests (`core/jobs/vencimientos.test.ts`)

Ticket con `fecha_limite = now() + 2 h` y principal `u` → tras `ejecutarVencimientos()` el oyente recibe `ticket.vence_pronto` y existe un `aviso vence_pronto` para `u` (con el despachador conectado); segunda ejecución → ninguna fila nueva; ticket con `fecha_limite = now() − 1 h` → `vencio`; ticket cerrado o sin fecha → nada; `fecha_limite = now() + 30 h` → nada (B2: 24 h de reloj); ticket vencido hace 8 días → no se vuelve a avisar.

### 8.2 Resumen diario — formato (Telegram, HTML)

```
<b>Zydesk · Mi día</b> — viernes 2 de octubre

<b>Vencen hoy (1)</b>
• TK-1048 · Error al emitir facturas desde el ERP

<b>Menciones sin leer:</b> 1

<b>Tareas para hoy (2)</b>
• Cargar CAF y probar emisión en QA · TK-1048
• Paso a producción y acompañamiento · OT-0218

<a href="https://desk…/mi-dia">Abrir Mi día</a>
```

Formato único (corrección posterior a la prueba con bot real): lo produce `formatearMiDia` de `packages/shared/src/telegram/` y lo usan el resumen diario de la API y `/hoy` del bot. Títulos en negrita, una línea en blanco entre secciones, ítems con «• ». Cada sección lista hasta 5 ítems (código · asunto recortado a 60; en tareas el código va al final) y «y N más»; secciones vacías se omiten; sin ninguna sección no se envía. Fecha con `formatearFechaLarga` de `shared/formato` en Santiago. Test (`core/jobs/resumen-diario.test.ts`): con `fetch` doblado, usuario con vínculo y un ticket que vence hoy recibe un mensaje que contiene el código y **no** contiene el texto de sus mensajes; usuario sin vínculo o con `resumen_diario` apagado no recibe; usuario sin nada pendiente no recibe; en un feriado general no se envía a nadie; `singletonKey` igual a la fecha.

## 9. Telegram en la API: vinculación y sesiones de bot (bloque 6C, `modulos/telegram/`)

### 9.1 Variables de entorno (`config/env.ts`, `.env.example`)

| Variable                | Proceso | Obligatoria                                  | Para qué                                                                                                                   |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`    | api, bot | no (sin ella el canal queda `omitido/sin_token` y `/api/yo/telegram` responde `disponible: false`) | Bot API. En `.env.example` vacía. **Nunca en el repo ni en logs** (ADR 0020; `redact` ya cubre `token`). |
| `TELEGRAM_BOT_USUARIO`  | api     | no                                           | `@usuario` del bot para el enlace `https://t.me/<usuario>?start=<código>` (sin `@`).                                      |
| `BOT_API_KEY`          | api, bot | sí si `TELEGRAM_BOT_TOKEN` está definida; en producción mínimo 32 caracteres y distinta del valor de `.env.example` | Clave compartida de `/api/bot/*` (`X-Bot-Key`) y clave del HMAC-SHA256 de `codigo_vinculo.codigo_hash` (revisión de seguridad 6b, ADR 0027.51): rotarla invalida los códigos vigentes. `.env.example`: `BOT_API_KEY=clave-de-desarrollo-cambiar-en-produccion`. |
| `WEB_URL`               | api     | sí (por defecto `http://localhost:5173` fuera de producción) | Base de los enlaces en Telegram (`https://desk.zytech.dev` en producción).                                                 |
| `API_URL`               | bot     | sí                                           | `http://api:3000` en Docker (ADR 0013), `http://localhost:3010` en desarrollo. Debe ser `http://api…` o `https://`; el bot rechaza `desk.zytech.dev` solo con una advertencia en el log (no bloquea). |
| `BOT_DATOS_DIR`         | bot     | sí (por defecto `./datos/bot`)               | Directorio del archivo de sesiones cifrado (§19.3).                                                                        |
| `BOT_CLAVE_CIFRADO`     | bot     | sí si existe `TELEGRAM_BOT_TOKEN`            | 32 bytes en base64 para AES-256-GCM del archivo de sesiones. `.env.example` vacía; `README` explica cómo generarla (`openssl rand -base64 32`). |

`env.ts` valida con Zod como hoy: en `NODE_ENV=production` falla al arrancar si `TELEGRAM_BOT_TOKEN` existe sin `BOT_API_KEY` válida o sin `WEB_URL` `https://`. En tests `BOT_API_KEY` toma el valor de `.env.example` (CI lo copia) y `TELEGRAM_BOT_TOKEN` queda vacía: los tests que necesitan "token configurado" lo inyectan (`vi.stubEnv` + recarga del módulo o parámetro `opciones.token` en `CanalTelegram`).

### 9.2 Endpoints de la persona (`/api/yo/telegram*`, cookie o Bearer)

| Método y ruta                   | Permiso | Entrada | Salida                 | Reglas                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ------- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/yo/telegram`          | sesion  | —       | `TelegramEstadoSalida` | `sesion_bot_activa` = `vinculo.sesion_id` apunta a una sesión no vencida.                                                                                                                                                                                                                                                                                                          |
| `POST /api/yo/telegram/codigo` | sesion  | —       | 201 `CodigoVinculoSalida` | Solo con cookie (`autenticado_por = 'cookie'`; desde el bot → 403 `SIN_PERMISO`: un token robado no puede re-vincular a otro chat). Sin `TELEGRAM_BOT_TOKEN` o sin `BOT_API_KEY` configuradas → 503 `TELEGRAM_NO_DISPONIBLE` (la clave firma el hash del código). Invalida (`usado_en = now()`) los códigos vigentes del usuario y crea uno nuevo: 8 caracteres del alfabeto `A-HJ-NP-Z2-9` (32 símbolos, sin `I/O/0/1`; `crypto.randomInt`), `expira_en = now() + 10 min`, en BD solo el hash (**HMAC-SHA256 con `BOT_API_KEY`**, revisión de seguridad 6b; la spec decía `sha256` plano). Máximo 5 códigos por usuario cada 15 min (409 `CONFLICTO { espera_s }`). El código se devuelve **una vez**; el log registra `{ usuario_id, codigo_id }` (nunca el código: `redact` ya cubre `codigo`). |
| `DELETE /api/yo/telegram`       | sesion  | —       | 204                    | Borra `vinculo_telegram` y **todas** las sesiones `origen = 'bot'` del usuario (`cerrarSesionesDeUsuario` filtrado por origen; cada una audita `sesion_cerrada { motivo: 'telegram_desvinculado' }`), audita `telegram_desvinculado`. Idempotente (sin vínculo → 204). Desde el bot (Bearer de la sesión bot) también vale: es `/desvincular`. Los `aviso_envio` pendientes pasan a `omitido/sin_vinculo` al ejecutarse. |

### 9.3 Endpoint del bot (`/api/bot/vincular`, clave compartida)

`core/auth/clave-bot.ts` exporta `requiereClaveBot: RequestHandler`: compara `X-Bot-Key` con `env.BOT_API_KEY` usando `crypto.timingSafeEqual` sobre buffers de igual longitud (si difieren en longitud, compara contra sí misma y falla igual: tiempo constante); sin clave o distinta → 401 `CLAVE_BOT_INVALIDA` (sin detalle), `logger.warn({ ip })` y auditoría `telegram_vinculacion_fallida { motivo: 'clave' }`. Límite por IP: 20 fallos **de clave** en 15 min → 429 `VINCULACION_BLOQUEADA` (consulta `auditoria` con `accion = 'telegram_vinculacion_fallida'` y `detalle->>'motivo' = 'clave'`, misma técnica que los límites de ingreso de ADR 0018). **Los códigos inválidos (`motivo: 'codigo'`) no cuentan en este límite** (revisión de seguridad 6b, ADR 0027.51): en producción toda llamada llega desde la IP del bot, y contarlos permitía que cuatro cuentas anónimas de Telegram bloquearan la vinculación de toda la organización; los códigos se limitan por `chat_id` (abajo). Sin cookie de sesión, `/api/bot/*` está exento de la comprobación CSRF (ADR 0027.48).

| Método y ruta           | Permiso                                  | Entrada              | Salida             | Reglas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------- | -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/bot/vincular` | `publico` + `previos: [requiereClaveBot]` | `BotVincularEntrada` | 201 `BotVincularSalida` | `enTransaccion`: `SELECT … FROM codigo_vinculo WHERE codigo_hash = hashCodigo(codigo) FOR UPDATE` (HMAC-SHA256 con `BOT_API_KEY`); inexistente, `usado_en` no nulo o `expira_en <= now()` → 400 `CODIGO_INVALIDO` (mismo mensaje en los tres casos) + auditoría `telegram_vinculacion_fallida { chat_id, motivo: 'codigo' }`; 5 fallos del mismo `chat_id` en 15 min → 429 `VINCULACION_BLOQUEADA`. Usuario inactivo → 400 `CODIGO_INVALIDO`. `chat_id` vinculado a **otro** usuario → 409 `TELEGRAM_CHAT_EN_USO` (ese usuario debe desvincular primero; §25.18). Si el usuario ya tenía vínculo (otro chat o el mismo) se reemplaza y se cierran sus sesiones bot anteriores. Marca `usado_en = now()`, upsert `vinculo_telegram`, `crearSesion(tx, { usuario_id, origen: 'bot', mantener: true, ip: null, user_agent: 'Telegram' })` (30 d de inactividad / 90 d absoluta, ADR 0013; §25.12), guarda `sesion_id` en el vínculo, audita `telegram_vinculado { chat_id }`. Devuelve el token **una sola vez**. |

Ninguna otra ruta acepta `X-Bot-Key`: el bot actúa siempre con el Bearer del usuario (PLAN §6).

### 9.4 Sesiones de bot

- `autenticar` ya acepta `Authorization: Bearer`; `csrf` ya exime Bearer sin cookie. Sin cambios de código; sí tests nuevos en `seguridad.test.ts` (§14).
- Una sesión bot vencida (inactividad o absoluta) responde 401 como cualquier sesión; el bot borra su token y pide `/vincular` de nuevo (§19.5). El vínculo (y por tanto los avisos) **sigue vivo**; solo los comandos exigen re-vincular. Al re-vincular, el chat es el mismo: `vinculo_telegram` se actualiza y la sesión nueva reemplaza a la vencida.
- Cambio de contraseña, cambio de rol y desactivación ya borran todas las sesiones (ADR 0013), incluidas las bot. La desactivación además deja de enviar avisos (`activo = false` filtra destinatarios); el vínculo se conserva por si se reactiva (§25.12).
- `GET /api/yo/sesiones` ya devuelve `origen`; la web la muestra como "Bot de Telegram" (§15.4). `DELETE /api/yo/sesiones/:id` sobre la sesión bot revoca los comandos del bot sin desvincular.
- `requiere()` no cambia: una cuenta con `debe_cambiar_contrasena` o términos pendientes recibe 403 también por Bearer; el bot lo traduce a "Entra a la web para completar tu cuenta" (§19.5).

## 10. Mi día — API (bloque 6D, `modulos/mi-dia/`)

`GET /api/mi-dia` (sesion) → `MiDiaSalida`, con `cargarMiDia(m, actor)` reutilizable por el resumen diario (§8):

- `vencen_hoy` y `vencidos`: `listarTickets` con `{ solo_mios: 'true', vencen_hoy | vencidos: 'true', archivados: 'false', orden: 'fecha_limite', por_pagina: 50 }` (las condiciones ya existen en `tickets.consulta.ts`; `solo_mios` = responsable principal u otro). `vencidos` excluye los que vencen hoy (ya listados arriba).
- `por_aprobar`: `listarOts({ tipo: 'interna', etapa: 'borrador', aprobador_id: actor.id, por_pagina: 50 })` solo si `actor.permisos` incluye `ots.aprobar`; si no, `[]` (B8).
- `menciones`: `aviso` del actor con `tipo = 'mencion'`, `leido_en IS NULL`, `en_app`, `ORDER BY creado_en DESC LIMIT 10`.
- `tareas`: `tarea` con `responsable_id = actor`, `NOT hecha`, destino no cerrado (`ticket.cerrado_en IS NULL` o `ot.etapa NOT IN ('cerrada','cancelada')`), `ORDER BY fecha NULLS LAST, id LIMIT 20`; `destino.titulo` = asunto o título.
- `detenidos`: tickets míos abiertos (cualquier estado abierto, incluido `en_espera`) con `actualizado_en < (hoy Santiago 00:00) − 3 días`, `ORDER BY actualizado_en LIMIT 10` (§25.7). Excluye los que ya están en `vencen_hoy`/`vencidos`.
- `conteos`: `count(*)` de cada consulta sin `LIMIT`.
- Marcar tareas desde Mi día usa `PATCH /api/tareas/:id { hecha }` existente (permiso `tickets.editar`; Solo lectura las ve sin casilla).

Tests (`mi-dia.test.ts`): técnico con 2 tickets que vencen hoy, 1 vencido ayer, 1 detenido (actualizado hace 5 días), 1 tarea abierta en una OT y 1 en un ticket cerrado (no aparece), 2 menciones (una leída) → conteos `{ 2, 1, 0, 1, 1, 1 }`; coordinación con `aprobador_id` en una OT interna en borrador → `por_aprobar` con 1; técnico con `aprobador_id` → `[]`; `lectura` → 200 con listas (las suyas, vacías); el ticket que vence hoy no se repite en `detenidos`.

## 11. Línea de tiempo — API (bloque 6D, `tickets.consulta.ts` + `tickets.routes.ts`)

`GET /api/tickets/linea-de-tiempo?desde&hasta` (sesion) → `LineaTiempoSalida` (ADR 0016):

- `dias`: cada fecha de `[desde, hasta]` con `habil` y `feriado` según el **departamento de quien mira** (A8; `cargarCalendario(m, departamento_id, años)` + `horasJornada(fecha, cal) > 0`); sin departamento → lunes a viernes sin feriados generales. `hoy` con la fecha de Santiago. La web dibuja solo los días hábiles.
- `items`: tickets **no archivados** con (`cerrado_en IS NULL` **o** `cerrado_en >= desde`) cuya barra `[inicio, COALESCE(limite, inicio)]` intersecta `[desde, hasta]`, **más** todos los vencidos abiertos (su barra se prolonga hasta hoy, ADR 0016). `inicio` = fecha Santiago de `inicio_planificado`, si es nulo de `creado_en`; `limite` = fecha Santiago de `fecha_limite` o `null`. `vencido` con la misma definición SQL de `TicketResumen` (ADR 0016: "coincide con el filtro Vencidos"). `responsable_id` = principal (o null → "Sin asignar"); `cliente` null → "Sin cliente". Orden: `vencido DESC, limite NULLS LAST, id`. Sin paginar; tope 500 items (si se supera, 400 `VALIDACION { hasta: ['Acorta el rango'] }`).
- `vencidos`: `count` de items con `vencido`.
- `personas`: usuarios activos (para filas vacías en modo persona; la web pone primero a quien mira, ADR 0016).

Tests (`linea-tiempo.test.ts`): rango de 14 días con departamento L–V y un feriado → `dias` con `habil` correcto; ticket con `inicio_planificado` fuera del rango pero `fecha_limite` dentro → aparece; ticket cerrado antes de `desde` → no; vencido abierto con límite anterior a `desde` → aparece con `vencido: true`; sin fecha límite → `limite: null`; `?hasta` 63 días después → 400; usuario sin departamento → L–V.

## 12. Pantalla 10 — API (bloque 6D, `modulos/ots/`)

- `OtResumen.esperando_cliente` y `por_aprobar` se calculan en `SELECT_RESUMEN` (subconsulta sobre la cotización vigente, como `neto`).
- `GET /api/ots/indicadores` (sesion) → `IndicadoresOtsSalida`. Los montos (`neto`) van **solo** con `reportes.ver`; sin él `neto: null` (la web muestra «—»). `horas_internas_mes` = Σ `registro_horas.horas` con `ot_id` de OT `interna` y `fecha` en el mes calendario actual (Santiago). Decisión §24.9, pregunta §25.10.
- `GET /api/ots/exportar.xlsx?<OtsQuery sin pagina/por_pagina>` (permiso `ots.facturar`; §25.9) → `attachment; filename="ots-facturacion-AAAA-MM-DD.xlsx"` con exceljs (`integraciones/xlsx/ots.xlsx.ts`): hoja "Órdenes de trabajo" con columnas OT · Título · Cliente · Ticket · Tipo · Etapa · Estado de facturación · N° factura · Cotización vigente (`COT-0218 v1`) · Neto CLP · Horas registradas · Responsable · Inicio · Término · Cerrada el; totales al pie (Σ neto, Σ horas) con fórmula `SUM`; descripciones siempre como texto (ADR 0025.18: nunca fórmula a partir de datos); tope 5 000 filas (400 `VALIDACION` si se supera; filtra antes). Registra `auditoria` `exportacion { tipo: 'xlsx', entidad: 'ots', filtros: <claves de la query> }` (sin ids ni montos); **no** deja `evento` (no es una entidad) ni `archivo`.
- `listarOts` no cambia de firma; `ots.routes.ts` declara las dos rutas nuevas **antes** de `/api/ots/:id`.

Tests (`ots.indicadores.test.ts`, `ots.exportar.test.ts`): con las semillas de fábrica (una OT `por_facturar` con cotización aprobada de 680 000, una `cotizada` con vigente `enviada` de 2 150 000, una `cotizada` con vigente `borrador`, dos `en_ejecucion`, 2 h en una OT interna este mes y 3 h el mes pasado) → `{ por_facturar: { n: 1, neto: 680000 }, esperando_cliente: { n: 1, neto: 2150000 }, en_ejecucion: 2, horas_internas_mes: 2 }`; técnico → `neto: null` en ambos; el `.xlsx` releído con exceljs tiene las filas filtradas (`?estado_facturacion=por_facturar` → 1 fila) y la celda Neto `680000` numérica; `lectura` y `tecnico` → 403 en exportar; `auditoria.exportacion` con `entidad: 'ots'`; un título `=1+1` queda como texto.

## 13. Eventos y auditoría generados en esta fase

| Acción                                                        | `evento`                                                                            | `auditoria`                                                                        | evento de dominio (tras commit)                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Crear ticket, responsables, seguidores, cambiar estado        | los actuales, sin cambios                                                           | —                                                                                  | `ticket.asignado`, `ticket.seguidor_agregado`, `ticket.estado_cambiado` |
| Seguimiento, nota, copiar al ticket, tareas                   | los actuales                                                                        | —                                                                                  | `mencion`, `ticket.seguimiento_nuevo`, `tarea.asignada`                |
| Crear ticket / seguimiento / aprobar OT **desde el bot**      | los mismos que desde la web, con el autor real; `creado` gana `datos.origen_sesion: 'bot' \| 'web'` | —                                                                   | los mismos                                                             |
| Job `tickets.vencimientos`                                    | —                                                                                   | —                                                                                  | `ticket.vence_pronto`, `ticket.vencio`                                 |
| Despachador: crear avisos                                     | — (`aviso` es el registro)                                                          | —                                                                                  | —                                                                      |
| Leer avisos, marcar leído, cambiar preferencias               | —                                                                                   | —                                                                                  | —                                                                      |
| Generar código de vinculación                                 | —                                                                                   | — (el intento exitoso o fallido de usarlo sí se audita)                            | —                                                                      |
| Vincular Telegram (`POST /api/bot/vincular`)                  | —                                                                                   | `telegram_vinculado { chat_id }` · `telegram_vinculacion_fallida { chat_id }`      | —                                                                      |
| Desvincular (web o bot)                                       | —                                                                                   | `telegram_desvinculado` + `sesion_cerrada { motivo: 'telegram_desvinculado' }` por sesión | —                                                                 |
| Clave de bot inválida                                         | —                                                                                   | `telegram_vinculacion_fallida { motivo: 'clave' }`                                 | —                                                                      |
| Envío por Telegram, resumen diario                            | —                                                                                   | — (`aviso_envio` es el registro; el resumen solo deja log con `usuario_id`)        | —                                                                      |
| Exportar OT para facturación                                  | —                                                                                   | `exportacion { tipo: 'xlsx', entidad: 'ots', filtros }`                            | —                                                                      |

`AccionAuditoria` gana `telegram_vinculado`, `telegram_vinculacion_fallida`, `telegram_desvinculado`. Cobertura (ADR 0003): `avisos/eventos.test.ts` afirma que `GET/POST` de avisos y preferencias no crean `evento` ni `auditoria`; `telegram/eventos.test.ts` afirma las filas de auditoría de la tabla; `exportar` crea exactamente una `auditoria`. La tabla de `CLAUDE.md` §2 gana las filas "Avisos y preferencias" (— / —), "Vincular / desvincular Telegram" (— / `telegram_*`) y "Exportar OT para facturación" (— / `exportacion`).

## 14. Pruebas de seguridad obligatorias

Archivos: `avisos/seguridad.test.ts` (6B), `telegram/seguridad.test.ts` (6C), `mi-dia/seguridad.test.ts` y `ots/seguridad.test.ts` ampliado (6D), `apps/bot/src/**/*.test.ts` (6G, §19.6).

1. Test genérico de permisos (Fase 1) verde con las rutas nuevas: sin sesión → 401 en todas salvo `POST /api/bot/vincular` (401 `CLAVE_BOT_INVALIDA` sin clave).
2. **Avisos propios**: `GET /api/avisos` solo devuelve los del actor aunque existan de otros; `POST /api/avisos/:id/leer` de un aviso ajeno → **404** y la fila no cambia; `leer-todos` no toca avisos ajenos; `en_app = false` no aparece ni cuenta en `no-leidos`; `lectura` → 200 en todo lo de avisos (B10: ver sí).
3. **Preferencias**: `PUT` con `usuario_id` en el cuerpo → ignorado (Zod descarta); `PUT` de `correo` no rompe pero `GET` no lo expone; `resumen_diario` con `app: true` → 400.
4. **El bot solo ve y hace lo que su usuario puede en la web** (PLAN §4): con `ingresarComoBot(lectura)` → `GET /api/tickets` 200, `POST /api/tickets/:id/mensajes` **403**, `POST /api/tickets` **403**, `POST /api/ots/:id/aprobar` **403**; con `ingresarComoBot(tecnico)` → seguimiento 201 con `autor` = el técnico y `evento` con su `autor_id`, `aprobar` **403**; con `ingresarComoBot(coordinacion)` → `aprobar` 200 y `evento` `cambio etapa` con su `autor_id`; `GET /api/horas?usuario_id=<otro>` como técnico vía Bearer → 403 (misma matriz); `GET /api/config/tarifas` vía Bearer de técnico → 200 (igual que la web, ADR 0025.17); usuario **desactivado** con sesión bot → 401 en todo.
5. **Bearer sin CSRF, cookie con CSRF**: `POST` con Bearer y sin `X-Requested-With` → 201; `POST` con cookie y Bearer a la vez sin la cabecera → 403 `CSRF` (ya cubierto en `csrf.test.ts`, se reafirma con una ruta real).
6. **Código de un solo uso**: `POST /api/yo/telegram/codigo` devuelve 8 caracteres del alfabeto permitido, `codigo_vinculo.codigo_hash = sha256(codigo)` y nunca el código en claro en BD ni en el logger de test; usarlo → 201 y `usado_en` no nulo; **usarlo de nuevo → 400 `CODIGO_INVALIDO`**; un código con `expira_en` en el pasado (fábrica `expirado: true`) → 400 con el **mismo** cuerpo que uno inexistente (`'ZZZZZZZZ'`); pedir un segundo código invalida el primero (el primero → 400); 6 códigos seguidos → 409; pedir código con sesión Bearer → 403; sin `TELEGRAM_BOT_TOKEN` → 503.
7. **Clave del bot**: `POST /api/bot/vincular` sin `X-Bot-Key` → 401; con clave incorrecta de igual longitud → 401; con clave correcta → 201; 21 fallos de clave desde la misma IP en 15 min → 429; la clave correcta en `Authorization: Bearer` **no** vale (401); `X-Bot-Key` correcta en cualquier otra ruta (`GET /api/tickets`) → 401 (no autentica a nadie).
8. **Fuerza bruta de códigos**: 5 intentos fallidos con el mismo `chat_id` → el sexto responde 429 `VINCULACION_BLOQUEADA` aunque el código sea correcto; `auditoria` tiene 5 `telegram_vinculacion_fallida`.
9. **Un chat, una persona**: vincular `chat_id = 1` a `u1` y luego un código de `u2` con `chat_id = 1` → 409 `TELEGRAM_CHAT_EN_USO`, `u1` sigue vinculado; `u1` vincula con `chat_id = 2` → el vínculo se reemplaza y el token anterior de `u1` responde 401.
10. **Revocación**: tras `DELETE /api/yo/telegram` (con cookie) el token bot → 401, `vinculo_telegram` vacío, `auditoria` con `telegram_desvinculado` y `sesion_cerrada`; `DELETE /api/yo/sesiones/:id` sobre la sesión bot → token 401 pero `GET /api/yo/telegram` sigue `vinculado: true, sesion_bot_activa: false` y un aviso nuevo **sí** encola Telegram; cambiar contraseña → token bot 401 (ADR 0013); desactivar al usuario → 401 y el despachador deja de crearle avisos; `GET /api/yo/sesiones` desde la web lista la sesión bot con `origen: 'bot'`.
11. **Token nunca en logs ni en el repo**: tras `POST /api/bot/vincular` y varias llamadas Bearer, el logger de test no contiene el token ni el código; `grep -r "bot[0-9]\{8,10\}:" apps docs .github` (forma del token de Telegram) devuelve vacío; `.env.example` tiene `TELEGRAM_BOT_TOKEN=` vacío; con `fetch` doblado, el `err` registrado por `CanalTelegram` no contiene la URL con el token (test de §7.3).
12. **Avisos sin contenido sensible**: nota interna con texto `'SECRETO-XYZ'` y mención → el `aviso.texto` del mencionado no contiene `SECRETO-XYZ`; cambio a `descartado` con motivo `'MOTIVO-XYZ'` → el aviso `estado_ticket` no lo contiene; `ot.cancelada` con motivo → idem; `cotizacion.respondida` → el texto no contiene el neto (`'475.000'`, `'475000'`); `espera_detalle` no aparece (solo la etiqueta de `espera_de`); el mensaje a Telegram (fetch doblado) tampoco.
13. **Destinatarios**: el actor no recibe aviso de su propia acción; un usuario inactivo no recibe; `por_facturar` llega a admin y coordinación activos y a nadie más; `vence_pronto` llega solo al principal; una mención a un usuario que no es responsable ni seguidor **sí** le llega (está mencionado) y el aviso lo lleva al mensaje, no revela nada más.
14. **Idempotencia**: `ejecutarVencimientos()` tres veces → un solo `aviso` por ticket/persona; `publicar('ot.por_facturar', …)` dos veces → un aviso por destinatario.
15. **Mi día**: `GET /api/mi-dia` de un técnico no incluye tickets donde no es responsable aunque sea seguidor; `por_aprobar` vacío sin `ots.aprobar` aunque sea `aprobador_id`; sin parámetros que acepten `usuario_id` (la ruta no los declara).
16. **Línea de tiempo**: `lectura` → 200; items archivados no aparecen; `hasta − desde > 62` → 400; `desde` no ISO → 400.
17. **Exportación y montos**: `exportar.xlsx` → 403 para `tecnico` y `lectura`, 200 para `coordinacion`/`admin`; indicadores → `neto: null` para `tecnico`; `WEB_URL` con `javascript:` → el `env` lo rechaza (debe ser `http(s)://`).
18. **HTML en Telegram**: asunto `'<img src=x onerror=alert(1)>'` llega escapado en el `fetch` doblado; en la web se renderiza como texto.
19. **Rangos**: `por_pagina = 201` → 400; `filtro = 'otro'` → 400; `chat_id` no entero → 400; `telegram_usuario` de 65 caracteres → 400.
20. **Logs**: `POST mensajes` con mención, el despachador y `aviso.enviar` no dejan en el logger de test `texto`, `chat_id` ni el asunto; solo `aviso_id`, `usuario_id`, `evento`, `codigo` de error.
21. `X-Request-Id` presente en 401, 404 y 429 nuevos.

## 15. Web avisos y Telegram (bloque 6E, `features/avisos/`)

### 15.1 API del front (`features/avisos/api.ts`)

`avisos(query)`, `noLeidos()`, `marcarLeido(id)`, `marcarTodosLeidos()`, `preferencias()`, `guardarPreferencias(filas)`, `telegram()`, `generarCodigo()`, `desvincularTelegram()`. Claves: `['avisos', query]`, `['avisos', 'no-leidos']`, `['avisos', 'preferencias']`, `['telegram']`. `noLeidos` con `refetchInterval: 60_000` y `refetchOnWindowFocus` (ADR 0011). Tras marcar leído se invalidan `['avisos']` y `['mi-dia']`.

### 15.2 Badge (`MenuLateral`, `BarraInferior`)

Punto rojo con el número (`urgente`, `min-w-5`, `aria-label="N avisos sin leer"`) junto a "Avisos" cuando `no_leidos > 0`; `99+` desde 100. Solo el badge: `document.title` no cambia. Test: con `no_leidos: 3` aparece «3»; con 0 no hay badge.

### 15.3 Pantalla 9 — Avisos (`features/avisos/pages/AvisosPage.tsx`)

Diseño "Avisos". Mobile-first: una columna bajo 1024 px (lista arriba, preferencias en una pestaña "Preferencias" del mismo `Tabs`); a ≥ 1024 px lista a la izquierda (2/3) y panel de preferencias + Telegram a la derecha.

1. **Encabezado**: "Avisos", contador «N sin leer», botón "Marcar todo como leído" (deshabilitado con 0). Chips Todos · Menciones · Asignaciones · Vencimientos (`?filtro=`, ADR 0011) y `Switch` "Solo sin leer" (`?no_leidos=true`).
2. **Lista** (`ListaAvisos`): cada aviso es un `<a>` al `enlace` (React Router `Link`) con el glifo del diseño por `evento` (`@` menciones, `+` asignaciones, `!` vencimientos, `$` cotización/facturar, `→` estado/seguimiento; siempre con `aria-label` del tipo), `texto`, `FechaRelativa`, punto `acento` si no leído (`aria-label` «Sin leer»), fondo `#F7F8FE` sin leer; al pulsar se llama `marcarLeido` (optimista) y se navega. Icono `Send` pequeño con tooltip «Enviado por Telegram» / «No se pudo enviar por Telegram» según `telegram`. Paginación «Cargar más» (`por_pagina 30`). Vacío: `EstadoVacio` «Sin avisos» / «Todo leído».
3. **Preferencias** (`TablaPreferencias`): 9 filas (`ETIQUETA_EVENTO_AVISO`), columnas **En la app** y **Telegram** con `Switch` (`aria-label` «Me mencionan con @ por Telegram»); la columna correo **no se muestra** (ADR 0013); la fila "Resumen diario" solo tiene el `Switch` de Telegram. Cambiar un `Switch` llama `guardarPreferencias([fila])` con actualización optimista y toast de error. La columna Telegram se atenúa (sigue editable) con el texto «Vincula Telegram para recibirlos» si `telegram_vinculado = false`.
4. **Telegram** (`TarjetaTelegram`): si `disponible = false`: «El bot de Telegram no está configurado en este servidor» (sin botón). Si no vinculado: botón **"Vincular Telegram"** → `DialogoVincular`: llama `generarCodigo()` y muestra el código en `font-mono` grande, botón «Copiar», cuenta regresiva de 10 min, enlace «Abrir en Telegram» (`enlace` t.me si existe) y los pasos «1. Abre el bot · 2. Envía `/vincular CÓDIGO`»; sondea `telegram()` cada 3 s mientras el diálogo está abierto y, al detectar `vinculado: true`, muestra «¡Listo! Vinculado como @usuario» y cierra. Botón «Generar otro código». Si vinculado: «Vinculado · @usuario · desde 1 oct» y, si `sesion_bot_activa = false`, aviso «Los comandos del bot caducaron: envía /vincular con un código nuevo» con botón «Generar código»; botón **"Desvincular"** con `AlertDialog` («Dejarás de recibir avisos por Telegram y el bot cerrará tu sesión»).
5. Al entrar a `/avisos` **no** se marca todo leído automáticamente (el diseño tiene el botón explícito).

Tests (jsdom): con 8 avisos del diseño (3 sin leer) el contador dice «3 sin leer», los chips filtran por `filtro` en la URL, pulsar un aviso llama `marcarLeido` y navega al `enlace`, «Marcar todo como leído» llama a la API y deja 0; la tabla de preferencias tiene 9 filas y 17 `switch` (8×2 + 1), ninguno de correo; con `telegram_vinculado: false` aparece el texto de vincular; `DialogoVincular` muestra el código de la API y, cuando `telegram()` devuelve `vinculado: true`, el mensaje de éxito; «Desvincular» exige confirmar; con `disponible: false` no hay botón.

### 15.4 Perfil → Sesiones activas

`origen: 'bot'` se muestra como «Bot de Telegram» (ícono `Bot` de lucide) en lugar del `user_agent`; «Cerrar» funciona igual. Test: una sesión `bot` muestra la etiqueta.

## 16. Web Mi día (bloque 6F, `features/mi-dia/`)

`GET /api/mi-dia` con `staleTime 30 s`, `refetchInterval 60 s`. Diseño "Mi día". Mobile-first (pantalla de terreno, spec §7): bajo 1024 px los cuadros van en una fila de 2×2 y las listas apiladas; a ≥ 1024 px, 4 cuadros y dos columnas de listas.

1. **Cuadros** (`TarjetaConteo`, botón que hace scroll a su lista): Vencen hoy (`urgente` si > 0), Por aprobar (solo con `ots.aprobar`), Te mencionaron, Tus tareas.
2. **Listas**: «Vencen hoy» y «Vencidos» con `TarjetaTicketBreve` (código, asunto, cliente, `PillEstado`, `PillPrioridad`, `FechaLimite`); «Por aprobar» con la OT (código, título, «interna · N h estimadas», solicitante) y enlace «Revisar» a `/ots/:id` (aprobar se hace en la OT, ADR 0022); «Te mencionaron» con `ListaAvisos` reducida y «Ver todos» a `/avisos?filtro=menciones`; «Tus tareas» con `Checkbox` (`PATCH /api/tareas/:id { hecha: true }`, optimista; deshabilitada sin `tickets.editar`) + título + `Codigo` del destino + fecha (`urgente` si vencida); «Detenidos hace días» con el ticket y «sin actividad desde hace N días» (`FechaRelativa`).
3. Vacío total: `EstadoVacio` «Nada pendiente por hoy» con enlace al Tablero. `Cargando`, `EstadoError`.
4. `TituloPagina` «Mi día · jueves 1 de octubre» (`formatearFechaLarga`).

Tests (jsdom): con la respuesta de ejemplo (2 vencen hoy, 1 por aprobar, 3 menciones, 3 tareas, 1 detenido) los cuadros muestran 2 · 1 · 3 · 3; marcar una tarea llama `editarTarea(id, { hecha: true })`; sin `ots.aprobar` no se renderiza «Por aprobar»; bajo 768 px (`matchMedia` doblado) los cuadros son 2×2 (`data-columnas="2"`); con `lectura` las casillas están deshabilitadas.

## 17. Web Línea de tiempo (bloque 6F, `features/tickets/linea-tiempo/`)

Diseño "Línea de tiempo del equipo" + ADR 0016. Estado en la URL: `?escala=dia|2semanas|mes` (por defecto `2semanas`), `?agrupar=persona|cliente` (por defecto `persona`), `?desde=AAAA-MM-DD` (inicio del rango; por defecto el lunes de la semana actual), `?vencidos=true` (filtro).

1. **Rango por escala**: `dia` → `desde = hasta = día elegido`; `2semanas` → desde el lunes, `hasta` = el día en que se acumulan **10 días hábiles** según `dias` (la web pide `desde + 20 días` y recorta a 10 hábiles); `mes` → del 1 al último día del mes de `desde`. Botones ‹ › mueven el rango (día, 2 semanas, mes) y «Hoy».
2. **Cabecera**: una columna por día hábil (`Lun 28`), la de hoy en `acento` con texto blanco (diseño); feriados no se dibujan (son no hábiles) y un `Tooltip` en el hueco del calendario no es necesario.
3. **Filas**: en `persona`, una fila por `personas` (quien mira primero, luego alfabético) + «Sin asignar» al final si hay items sin principal; a la izquierda `Avatar`, nombre y **«lo que hace ahora»**: el item `en_curso` del responsable con `actualizado_en` más reciente (código + asunto recortado), o «Sin ticket en curso». En `cliente`, una fila por cliente/área con items (alfabético) + «Sin cliente».
4. **Barras** (`BarraTicket`, `<a>` a `/tickets/:id`): CSS Grid con `grid-column` desde la columna de `inicio` (o la primera si `inicio < desde`) hasta la de `limite` (o hasta hoy con borde punteado si vencido; o una columna si `limite` es null, con etiqueta «sin fecha»); **ancho mínimo** una columna y `min-width: 24px` (ADR 0016); estilo por estado (en curso `acento` lleno, nuevo borde punteado, en espera rayado `en-espera`, resuelto gris) y punto por prioridad (`PillPrioridad` compacta: punto + `aria-label`); texto: código + asunto recortado + «· OT-0215» si tiene OT; vencido: ícono `TriangleAlert` + par `urgente`. Varias barras de una fila que se solapan se apilan en subfilas (`grid-row` asignado por un algoritmo de intervalos en el cliente).
5. **Vencidos**: aviso superior «N vencidos» con `TriangleAlert` (botón, `aria-pressed`) que activa `?vencidos=true` y deja solo barras vencidas. Oculto con 0.
6. Móvil: «usable, no optimizada» (ADR 0011): scroll horizontal con la columna de nombres fija (`sticky left-0`), ancho mínimo de columna 72 px.

Tests (jsdom): con la respuesta del diseño (10 personas, 10 días hábiles) se renderizan 10 filas + cabecera con «Mar 29» en `acento`; `agrupar=cliente` renderiza filas por cliente; un item con `limite < hoy` abierto lleva el ícono de vencido y la barra llega hasta hoy; «N vencidos» muestra 2 y al pulsar quedan 2 barras; un item sin límite ocupa una columna con «sin fecha»; dos barras solapadas van en `grid-row` distintos; la función pura `rangoDeEscala(escala, desde, dias)` tiene tests de tabla (2 semanas → exactamente 10 hábiles; mes → 1 al 31; cruce de año).

## 18. Web pantalla 10 — Órdenes de trabajo (bloque 6F, `features/ots/`)

1. **Indicadores** (`IndicadoresOts`, `GET /api/ots/indicadores`, 60 s): cuatro tarjetas: «Por facturar» (`$680.000 · 1 OT`, `alta`), «Esperando al cliente» (`$2.150.000 · 1 OT`), «En ejecución» (`2 OT`, `acento`), «Horas internas del mes» (`8 h`, `interna`). Con `neto: null` se muestra «—» y tooltip «Los montos requieren el permiso Ver reportes y montos». Cada tarjeta enlaza al chip correspondiente (`?estado_facturacion=por_facturar`, `?esperando_cliente=true` **no** existe como filtro: enlaza a `?etapa=cotizada`; `?etapa=en_ejecucion`; `?tipo=interna`).
2. **Tabla** (`TablaOts`): la columna Etapa muestra «Esperando aprobación» cuando `esperando_cliente` y «Borrador · por aprobar» cuando `por_aprobar` (A2; `PillEtapaOt` recibe la etiqueta derivada; el color sigue siendo el de la etapa real); el resto sin cambios. La columna «Neto u horas» muestra `neto` en facturables y `horas.registradas` + «h» en internas (ya existe el neto; se agrega el caso interna).
3. **Exportar**: el botón «Exportar para facturación (.xlsx)» deja de estar deshabilitado para quien tiene `ots.facturar` (`usePermiso`); llama `descargar(conQuery('/api/ots/exportar.xlsx', consultaSinPaginacion))` con los filtros vigentes (chip, `q`, `cliente_id`); toast «Exportando…». Sin permiso, el botón sigue deshabilitado con tooltip «Requiere permiso para marcar OT como facturada».
4. «Marcar facturada» **no** se agrega a la lista (ADR 0022; sigue en el detalle: §25.15).

Tests (jsdom): con `indicadores` de ejemplo se muestran los cuatro valores con formato CLP; con `neto: null` «—»; una fila `esperando_cliente: true` muestra «Esperando aprobación»; `por_aprobar: true` muestra «Borrador · por aprobar»; con `ots.facturar` el botón exporta y llama `descargar` con `estado_facturacion=por_facturar` cuando ese chip está activo; sin el permiso está deshabilitado.

## 19. Bot (`apps/bot`, bloque 6G)

### 19.1 Workspace

`apps/bot/package.json` (`@zydesk/bot`, `type: module`, `dependencies`: `grammy`, `pino`, `zod`, `@zydesk/shared`; scripts `dev` (`cross-env TZ=UTC tsx watch src/main.ts`), `build`, `start`, `typecheck`, `test`, `lint` heredado). `tsconfig.json` como el de la API sin decoradores. Raíz: `workspaces` gana `apps/bot`; `dev` gana el proceso `bot` en `concurrently` (color `yellow`) que **termina en silencio con código 0** si falta `TELEGRAM_BOT_TOKEN` (log `info` «bot deshabilitado: falta TELEGRAM_BOT_TOKEN»; §25.16); `build`, `test`, `typecheck` lo incluyen por `--workspaces`. `eslint.config.js` no cambia (regla general). Estructura:

```
apps/bot/src/
├── main.ts              # carga env, crea bot, long polling con reintentos (grammY `run` no: `bot.start()` básico), SIGTERM → `bot.stop()`
├── config/{env,logger}.ts
├── api/cliente.ts       # ClienteZydesk: fetch a API_URL con Bearer; parsea errores { error: { codigo } } → ErrorApi
├── sesiones/almacen.ts  # AlmacenSesiones: Map chat_id → token, persistido cifrado (§19.3)
├── bot.ts               # crearBot({ token, api, almacen, botInfo? }): registra comandos y manejadores
├── comandos/{vincular,hoy,mis,ticket,ayuda,desvincular}.ts
├── acciones/{responder-aviso,aprobar,crear-ticket}.ts
├── formato.ts           # escaparHtml, recortar, listas; textos en español
└── *.test.ts
```

### 19.2 Configuración y logs

`config/env.ts` (Zod): `API_URL` (`url`), `TELEGRAM_BOT_TOKEN` (opcional; sin él `main.ts` sale con 0), `BOT_API_KEY` (mín. 16), `BOT_CLAVE_CIFRADO` (base64 de 32 bytes), `BOT_DATOS_DIR` (por defecto `./datos/bot`, relativo a la raíz del repo), `LOG_LEVEL`, `NODE_ENV`. Logger pino con `base: { servicio: 'bot', version, entorno }`, `redact` de `token`, `authorization`, `codigo`, `chat_id`, `text` y `x-bot-key` (ADR 0017: solo ids; `message` no se redacta —revisión de seguridad 6b, ADR 0027.51— porque los errores se registran con `errorSeguro`, que deja solo `name` y `message` y quita `bot<id>:<token>` de las URL de la Bot API). Se registran: arranque, apagado, cada comando (`{ comando, usuario_id | null, duracion_ms, status }`), errores (`err` sin cuerpo de la petición). **Nunca** el texto de los mensajes de Telegram ni el `chat_id`.

### 19.3 Almacén de sesiones (`sesiones/almacen.ts`)

El bot no toca la BD (ADR 0008). Guarda `chat_id → { token, usuario_id, nombre }` en `BOT_DATOS_DIR/sesiones.json.enc`: JSON cifrado con AES-256-GCM (`crypto.createCipheriv`, IV aleatorio de 12 bytes por escritura, `tag` al final), escritura atómica (`tmp` + `rename`), permisos `0600`. Si el archivo no existe arranca vacío; si no se puede descifrar (clave cambiada) registra `error` y arranca vacío (los usuarios re-vinculan). Métodos: `obtener(chat_id)`, `guardar(chat_id, sesion)`, `borrar(chat_id)`. Perder el archivo solo obliga a re-vincular; los avisos los envía la API y no dependen de él.

### 19.4 Comportamiento

Solo chats **privados** (`ctx.chat.type === 'private'`); en grupos no responde (§25.17). Toda respuesta es HTML con `escaparHtml` sobre lo dinámico. Comandos (`bot.api.setMyCommands` al arrancar):

| Entrada                                     | Qué hace                                                                                                                                                                                                                                                                                                                                                                                  | Llamadas a la API (siempre con el Bearer del chat, salvo vincular)                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/start` sin código                         | Saluda y explica cómo vincular (Avisos → Vincular Telegram) y los comandos                                                                                                                                                                                                                                                                                                                | —                                                                                                        |
| `/start <código>` · `/vincular <código>`    | Normaliza (mayúsculas, sin espacios); `POST /api/bot/vincular { codigo, chat_id, telegram_usuario }` con `X-Bot-Key`; guarda `{ token, usuario_id, nombre }`; «Listo, Sebastián: tu cuenta quedó vinculada. Prueba /hoy». Errores: 400 → «Código inválido o vencido: genera uno nuevo en la app»; 409 → «Este chat ya está vinculado a otra cuenta…»; 429 → «Demasiados intentos; espera 15 minutos». Borra el mensaje del usuario con el código (`deleteMessage`, mejor esfuerzo) | `POST /api/bot/vincular`                                                                                 |
| `/desvincular`                              | `AlertDialog` no existe en Telegram: pregunta con botones «Sí, desvincular» / «Cancelar» (`callback_data: 'desvincular:si'`); al confirmar `DELETE /api/yo/telegram`, borra el token local, «Cuenta desvinculada».                                                                                                                                                                         | `DELETE /api/yo/telegram`                                                                                |
| `/hoy`                                      | `GET /api/mi-dia` → el mismo formato del resumen diario (§8.2) + «Nada pendiente» si todo está vacío                                                                                                                                                                                                                                                                                      | `GET /api/mi-dia`                                                                                        |
| `/mis`                                      | `GET /api/tickets?solo_mios=true&archivados=false&orden=fecha_limite&por_pagina=10` → lista «TK-1048 · Alta · En curso · vence 30 sep · Error al emitir…» (hasta 10, «y N más» con enlace a `/tickets/tabla?solo_mios=true`)                                                                                                                                                             | `GET /api/tickets`                                                                                       |
| `/ticket 1048` · `/ticket TK-1048`          | `GET /api/tickets?q=1048&archivados=false` y, si no hay coincidencia exacta de `numero`, `GET /api/tickets?q=1048&archivados=true` (en la API `archivados=true` es solo archivados; ADR 0021.12: solo dígitos = código exacto) → `GET /api/tickets/:id` → ficha: código, asunto, estado (+ espera de), prioridad, cliente, responsables, vence, OT vinculadas, «últimos 3 seguimientos» (autor · fecha · primeras 120 letras del texto de **seguimientos**, nunca notas internas) y enlace a la web. Sin resultado → «No encuentro TK-1048». | `GET /api/tickets`, `GET /api/tickets/:id`, `GET /api/tickets/:id/mensajes?tipo=seguimiento`             |
| `/ayuda`                                    | Lista de comandos y las dos acciones (responder un aviso, reenviar un mensaje)                                                                                                                                                                                                                                                                                                            | —                                                                                                        |
| **Responder** a un mensaje del bot         | Si el mensaje citado (`ctx.message.reply_to_message`, debe ser del bot) tiene **exactamente un código distinto en negrita** (entidades `bold` cuyo texto completo es `TK-\d+` u `OT-\d+`; revisión de seguridad 6b, ADR 0027.51: el servidor pone el código real en negrita y escapa el texto de las personas, así que un título de tarea «OT-77 revisar» no desvía el destino; la spec decía «primer código del texto»): registra un **seguimiento** con el texto de la respuesta (`tipo: 'seguimiento'`, sin `copiar_al_ticket`, sin horas, sin archivos) → «Seguimiento registrado en TK-1048». Sin código en negrita, o con varios distintos (la lista de `/mis`) → «Responde a un aviso o a la ficha de /ticket para registrar un seguimiento.» (mismo texto en `/ayuda`). Texto > 20 000 → se recorta a 20 000 con aviso.                                                                                                                                                    | `GET /api/tickets?q=` o `GET /api/ots?q=` (código → id) + `POST /api/tickets/:id/mensajes` o `POST /api/ots/:id/mensajes` |
| **Botón «Aprobar OT»** (`aprobar:ot:<id>`)  | `POST /api/ots/:id/aprobar { iniciar: false }` → edita el mensaje original (`editMessageText`: «✓ OT-0219 aprobada por ti el 1 oct 10:15», sin botones) y `answerCallbackQuery`. 403 → «No tienes permiso para aprobar»; 409 `TRANSICION_INVALIDA` → «La OT ya no está en borrador». Solo OT internas (§25.14): el botón solo lo pone la API en `ot_por_aprobar`.                            | `POST /api/ots/:id/aprobar`                                                                              |
| **Reenviar** un mensaje (texto)            | `ctx.message.forward_origin` presente y `text` no vacío: muestra «¿Crear un ticket con este texto?» con la primera línea como asunto propuesto en cursiva (`<i>`, nunca negrita: el texto lo escribió una persona y la negrita queda reservada a los códigos, ADR 0027.51) y botones «Crear ticket» (`callback_data: 'crear:<hash corto del message_id>'`) / «Cancelar». Al confirmar: `POST /api/tickets` con `asunto` = primera línea (≤ 200), `descripcion` = texto completo (≤ 20 000), `origen: 'interno'`, `prioridad: 'media'`, `solicitante_nombre` = nombre del remitente original si Telegram lo expone (`forward_origin.sender_user.first_name`/`sender_user_name`) o null, `responsable_principal_id` = el usuario, resto null → «Ticket TK-1054 creado» + enlace. El texto pendiente vive en memoria 10 min (`Map` con expiración), no en el almacén. Fotos, documentos y reenvíos sin texto → «Por ahora solo puedo crear tickets desde mensajes de texto» (§25.13). | `GET /api/yo` (id), `POST /api/tickets`                                                                                   |
| Cualquier otro texto                        | Sin vínculo: instrucciones para vincular. Con vínculo: «No entendí. Escribe /ayuda»                                                                                                                                                                                                                                                                                                        | —                                                                                                        |

### 19.5 Errores de la API → mensajes

| Respuesta de la API                        | El bot                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401 (`NO_AUTENTICADO`)                     | Borra el token del chat: «Tu sesión del bot terminó (se cerró, caducó o desvinculaste la cuenta). Para usar los comandos, genera un código en Zydesk → Avisos → Telegram y envía /vincular CÓDIGO». |
| 403 `CONTRASENA_PENDIENTE` / `TERMINOS_PENDIENTES` | «Entra a la web para cambiar tu contraseña / aceptar los términos; después vuelve».                                                   |
| 403 `SIN_PERMISO`                          | «No tienes permiso para esta acción».                                                                                                         |
| 404                                        | «No encuentro eso».                                                                                                                           |
| 409 (`TICKET_CERRADO`, `OT_CERRADA`, `TRANSICION_INVALIDA`, …) | El `mensaje` de la API tal cual (viene en español, sin datos sensibles).                                                   |
| 400 `VALIDACION`                           | «No pude registrarlo: » + primer error de `detalles`.                                                                                        |
| 5xx / red / timeout (10 s)                 | «Zydesk no responde ahora; inténtalo en un momento». Log `error` con `status`.                                                                |

### 19.6 Pruebas sin Telegram real

- **Telegram doblado**: grammY permite inyectar actualizaciones con `bot.handleUpdate(update)` y capturar las llamadas salientes con un transformer: `bot.api.config.use((prev, method, payload) => { llamadas.push({ method, payload }); return Promise.resolve({ ok: true, result: respuestaFalsa(method) }) })`; `bot.botInfo = { id: 1, is_bot: true, username: 'zydesk_test_bot', … }` evita `getMe`. Helper `test/telegram-fake.ts` con `mensajePrivado(chatId, texto, extras?)`, `callback(chatId, data, message)`, `reenviado(chatId, texto, remitente)`, y `llamadas` tipadas.
- **API doblada**: `ClienteZydesk` recibe `fetch` por inyección; en tests se usa un `fetchFalso` por tabla de rutas (`{ 'GET /api/mi-dia': { status: 200, body } }`) que además registra las peticiones (método, ruta, cabeceras `Authorization`, cuerpo). No se levanta la API ni Postgres (6G no usa BD).
- **Casos obligatorios** (`bot.test.ts`, `comandos/*.test.ts`, `acciones/*.test.ts`, `sesiones/almacen.test.ts`): `/vincular ABC23DEF` llama `POST /api/bot/vincular` con `X-Bot-Key` y `chat_id`, guarda el token y responde «Listo»; el mismo chat sin vínculo con `/hoy` recibe las instrucciones y **no** llama a la API; `/hoy` con vínculo envía `Authorization: Bearer <token>` y **nunca** `X-Bot-Key`; `/mis` lista hasta 10 y escapa `<img>`; `/ticket 1048` muestra la ficha sin texto de notas internas (la respuesta falsa trae una nota con `SECRETO-XYZ` y no aparece); responder a un mensaje del bot con «TK-1048» registra el seguimiento con el texto exacto; responder a un mensaje sin código no llama a la API; callback `aprobar:ot:7` llama `POST /api/ots/7/aprobar` y edita el mensaje; 403 → mensaje de permiso; reenvío con texto → pregunta y, al confirmar, `POST /api/tickets` con `asunto` recortado a 200 y `responsable_principal_id`; reenvío de foto → mensaje de no soportado; 401 borra el token y pide re-vincular; mensaje en un grupo → ninguna llamada ni respuesta; `AlmacenSesiones` escribe cifrado (el archivo no contiene el token en claro), relee tras reiniciar, y con otra clave arranca vacío sin lanzar; el logger de test no contiene `token`, `chat_id` ni el texto de los mensajes; `env` rechaza `BOT_CLAVE_CIFRADO` que no sea 32 bytes.
- **Prueba manual** (criterios §23): exige un token real de un bot de desarrollo creado con @BotFather por el usuario (§25.2), solo en `.env` local.

## 20. Semillas de desarrollo (bloque 6H, `database/semillas/desarrollo-avisos.ts`, llamada desde `desarrollo.ts` al final)

Idempotente (inserta solo si el usuario no tiene avisos). Para **Camila Rojas (`crojas`)**, los 8 avisos de la pantalla "Avisos" con sus textos generados por `textos.ts` a partir de las entidades sembradas (TK-1048 mención de… ella misma es la autora en el diseño; se siembra como mención de **Sebastián** a Camila; TK-1051 vence hoy; OT-0219 por aprobar pedida por Valentina; seguimiento de Sebastián en TK-1048; OT-0216 lista para facturar; TK-1028 a En espera · repuesto por Tomás; seguidora de TK-1048), con `creado_en` relativo (25 min, 1 h, 2 h, hoy 09:30, ayer, 27 sep, 28 sep) y los tres primeros sin leer; el aviso «Constructora Andes aún no responde…» del diseño **no** se siembra (fuera de alcance). Para **Sebastián Díaz (`sdiaz`)**: mención de Camila en la nota de TK-1048 (sin leer), asignación de TK-1048 y `vence_pronto` de TK-1048. Preferencias: Camila con `seguimiento/telegram = false` explícito (muestra una fila distinta del defecto). **No** se siembra `vinculo_telegram` ni `codigo_vinculo` (dependen de un chat real). Las semillas **no** publican eventos de dominio (insertan `aviso` directo) para no depender del despachador.

Test `desarrollo.test.ts`: tras sembrar dos veces, `crojas` tiene 8 avisos (3 sin leer) y `GET /api/avisos/no-leidos` → 3; `sdiaz` tiene 3; `GET /api/mi-dia` de `sdiaz` tiene `vencen_hoy` con TK-1048 y `menciones` con 1; `GET /api/ots/indicadores` como `hikki` → `por_facturar.n = 1` (OT-0216) y `esperando_cliente.n ≥ 1` (OT-0214 tiene cotización enviada en las semillas de la Fase 4; comprobar y ajustar la aserción al dato real).

## 21. Documentación (bloque 6H)

- `docs/manuales/usuario/00-primeros-pasos.md`: secciones **"Mi día"** y **"Avisos"** (qué llega, filtros, marcar leído, preferencias) y «Vincular Telegram» con enlace al manual del bot.
- `docs/manuales/usuario/04-bot-telegram.md` (nuevo, ADR 0012): vincular (código de 10 minutos, un solo uso), comandos, responder un aviso, aprobar con el botón, crear un ticket reenviando, desvincular, qué pasa cuando caduca la sesión, qué **no** hace el bot (nada que no puedas hacer en la web; no lee grupos; no envía notas internas ni montos).
- `docs/manuales/usuario/01-tecnico.md`: «Línea de tiempo» (escalas, agrupar, vencidos) y «Órdenes de trabajo (lista)» con los indicadores y la etiqueta «Esperando aprobación».
- `docs/manuales/usuario/02-coordinacion.md`: «Por aprobar en Mi día», «Avisos de facturación», «Exportar para facturación (.xlsx)»; quitar de "Lo que todavía no está" lo entregado.
- `docs/manuales/administracion.md`: sección **"Bot de Telegram"** (variables, crear el bot con @BotFather, `BOT_API_KEY`, `BOT_CLAVE_CIFRADO`, qué pasa al desactivar a una persona o cambiar su contraseña, revocar desde Sesiones activas, revisar `aviso_envio` fallidos) y nota en "Equipo y permisos" sobre que el bot respeta la misma matriz.
- `docs/api/README.md`: sección «Bot y sesiones Bearer» (`X-Bot-Key` solo en `/api/bot/vincular`; `Authorization: Bearer` sin CSRF), ejemplos `curl` de `GET /api/avisos`, `POST /api/avisos/leer-todos`, `PUT /api/yo/avisos/preferencias`, `POST /api/yo/telegram/codigo`, `GET /api/mi-dia`, `GET /api/tickets/linea-de-tiempo`, `GET /api/ots/indicadores`, `GET /api/ots/exportar.xlsx`. `docs/api/openapi.json` regenerado.
- `README.md`: workspace `apps/bot`, variables nuevas, cómo correr el bot en local y cómo generar `BOT_CLAVE_CIFRADO`. `.env.example` con las variables de §9.1 (valores vacíos o de desarrollo; **ningún token**).
- `docs/CHANGELOG.md` (Fase 6 en "Añadido"; quitar de "Pendientes de la Fase 2" las menciones sin aviso y de "Pendientes de la Fase 4" el despachador y "Por aprobar"; agregar «Pendientes de la Fase 6»: Dockerfile del bot y despliegue en la Fase 9, correo). `CLAUDE.md`: filas nuevas en la tabla §2 (§13), convención `pendientes` (§1.3), `apps/bot` en la regla de módulos (no accede a BD; solo API), sufijos de test.
- `docs/decisiones/0027-precisiones-de-la-fase-6.md` con §24–§26 y `README.md` de decisiones actualizado; `preguntas-abiertas.md` no se edita (A2, A8, B2 y B8 quedan aplicadas).

## 22. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit convencional en español, sin `Co-Authored-By`)

| Tarea                                                     | Bloque | Crea/edita                                                                                                                                                  | Criterio de aceptación                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F6-T1 Contratos compartidos**                           | 6A     | `shared/src/{eventos,enums/aviso,avisos/preferencias,esquemas/{aviso,mi-dia,linea-tiempo,telegram,bot}}.ts`, cambios en `esquemas/ot.ts`, `errores.ts`, índices | `esquemas.test.ts` cubre §3.2; `npm run typecheck` verde en api y web (los campos nuevos de `OtResumen` se completan en T8 o aquí con `// F6-T8` provisional).                                                                                                                                                                                 |
| **F6-T2 Migración, entidades, fábricas**                  | 6A     | migración 13, 5 entidades, `entidades.ts`, `fabricas.ts`, `fabricas-fase6.test.ts`                                                                          | `db:migrar` desde cero aplica 13; `db:revertir` deja 12; los casos de §3.3 verdes; semillas actuales cargan.                                                                                                                                                                                                                                  |
| **F6-T3 Publicación de eventos**                          | 6B     | `tickets.service.ts`, `mensajes.service.ts`, `tareas.service.ts`, `ots.cierre.service.ts`, `core/eventos/dominio.ts`, `core/eventos/publicacion.test.ts`   | §6 y §1.3; tests de §6 verdes; ninguna respuesta HTTP ni fila `evento` cambia (suite existente verde sin tocar aserciones).                                                                                                                                                                                                                   |
| **F6-T4 Despachador y textos**                            | 6B     | `avisos/{despachador,destinatarios,textos}.ts`, `avisos/canales/canal.ts`, `server.ts`, `app.ts` (conectar), `avisos/despachador.test.ts`                   | §7.1 y §4.1–§4.4; una fila por destinatario con el texto literal esperado; `clave` idempotente; sin texto sensible (prueba 12 de §14).                                                                                                                                                                                                        |
| **F6-T5 API de avisos y preferencias**                    | 6B     | `modulos/avisos/{avisos.service,avisos.consulta,avisos.routes}.ts`, `app.ts`, `avisos.test.ts`, `avisos/eventos.test.ts`, `avisos/seguridad.test.ts` (pruebas 1–3, 13, 14, 19–21) | §5; `openapi.json` regenerado.                                                                                                                                                                                                                                                                                                              |
| **F6-T6 Job de vencimientos**                             | 6B     | `core/jobs/{vencimientos,boss}.ts`, `vencimientos.test.ts`, `boss.test.ts`                                                                                   | §8 y §8.1; `iniciarJobs` registra las colas nuevas (las de 6C se agregan en T9/T10 con el test actualizado en cada paso).                                                                                                                                                                                                                      |
| **F6-T7 Mi día y línea de tiempo (API)**                  | 6D     | `modulos/mi-dia/**`, `tickets.consulta.ts`, `tickets.routes.ts`, `tickets.tipos.ts`, tests                                                                   | §10 y §11 con sus tests y las pruebas 15–16 de §14.                                                                                                                                                                                                                                                                                          |
| **F6-T8 Pantalla 10 (API)**                               | 6D     | `ots.consulta.ts`, `ots.service.ts`, `ots.routes.ts`, `integraciones/xlsx/ots.xlsx.ts`, tests                                                                | §12; prueba 17 de §14; `ots.test.ts` existente verde (`OtResumen` con los dos campos nuevos).                                                                                                                                                                                                                                                 |
| **F6-T9 Vinculación y sesiones de bot (API)**             | 6C     | `config/env.ts`, `.env.example`, `core/auth/clave-bot.ts`, `modulos/telegram/{telegram.service,telegram.routes}.ts`, `core/historial/auditoria.ts`, `app.ts`, `telegram.test.ts`, `telegram/seguridad.test.ts` (pruebas 4–11), `telegram/eventos.test.ts` | §9; `openapi.json`.                                                                                                                                                                                                                                                                                                                         |
| **F6-T10 Canal Telegram, cola, resumen, mantención**      | 6C     | `integraciones/telegram/cliente.ts`, `avisos/canales/telegram.ts`, `core/jobs/{enviar-aviso,resumen-diario,mantencion,boss}.ts`, tests                       | §7.3, §8 (resumen y mantención), pruebas 12 (parte Telegram), 18 y 20; `boss.test.ts` con 6 colas.                                                                                                                                                                                                                                           |
| **F6-T11 Web: avisos, badge, Telegram, sesiones**         | 6E     | `features/avisos/**`, `app/layout/{MenuLateral,BarraInferior}.tsx`, `features/perfil/**`, tests                                                             | §15 con sus tests. Navegador (1440 y 390 px) con `crojas`: badge «3», lista del diseño, filtros, marcar todo leído, 9 filas de preferencias, diálogo de vinculación muestra un código (sin bot real basta ver el código y la expiración).                                                                                                 |
| **F6-T12 Web: Mi día**                                    | 6F     | `features/mi-dia/**`, tests                                                                                                                                 | §16. Navegador con `sdiaz`: TK-1048 en «Vencen hoy», mención de Camila, tareas marcables; con `fcastro` «Por aprobar» con OT-0219; 390 px con cuadros 2×2.                                                                                                                                                                                 |
| **F6-T13 Web: línea de tiempo**                           | 6F     | `features/tickets/pages/LineaDeTiempoPage.tsx`, `features/tickets/linea-tiempo/**`, `features/tickets/api.ts`, tests                                        | §17. Navegador: la semana del diseño con 10 columnas hábiles, filas por persona con «lo que hace ahora», barras por estado, «N vencidos» funcional, `agrupar=cliente`, escalas Día y Mes.                                                                                                                                                   |
| **F6-T14 Web: pantalla 10**                               | 6F     | `features/ots/lista/**`, `features/ots/pages/OtsPage.tsx`, tests                                                                                            | §18. Navegador con `crojas`: indicadores con montos, OT-0214 «Esperando aprobación», OT-0219 «Borrador · por aprobar», exportar descarga un `.xlsx` abrible; con `sdiaz` montos «—» y botón deshabilitado.                                                                                                                                 |
| **F6-T15 Bot**                                            | 6G     | `apps/bot/**`, `package.json` raíz, `package-lock.json`                                                                                                     | §19 con todos los casos de §19.6 verdes; `npm run dev` arranca el bot solo con token; `npm run build`/`typecheck`/`lint` verdes en el workspace nuevo; CI verde.                                                                                                                                                                             |
| **F6-T16 Semillas**                                       | 6H     | `semillas/desarrollo-avisos.ts`, `desarrollo.ts`, `desarrollo.test.ts`                                                                                      | §20; `npm run db:reiniciar` deja los avisos del diseño para `crojas`.                                                                                                                                                                                                                                                                         |
| **F6-T17 Prueba de extremo a extremo con Telegram real**  | —      | sin código (ajustes menores si aparecen)                                                                                                                    | Con el token del bot de desarrollo (§25.2) en `.env` local: vincular desde `/avisos`, recibir un aviso real al mencionar a la persona, `/hoy`, `/mis`, `/ticket 1048`, responder el aviso → seguimiento visible en la web, botón «Aprobar» en OT-0219 con `fcastro`, reenviar un texto → ticket creado, `/desvincular`; `GET /api/yo/sesiones` muestra «Bot de Telegram». Registrar el resultado en la spec (estado de avance). |
| **F6-T18 Revisión de seguridad de la fase**               | —      | correcciones con test                                                                                                                                       | PLAN §1: Fable con `sentry-security-review` y Opus con `/security-review` sobre el diff completo; cada hallazgo confirmado se corrige con un test. Puntos a mirar: `X-Bot-Key` solo en `/api/bot/vincular` y en tiempo constante; código de un solo uso (reuso, expiración, enumeración, límite por chat e IP); token Bearer y código fuera de logs y del repo; `aviso.texto` sin contenido; IDOR en `leer`; el bot nunca llama con `X-Bot-Key` salvo vincular; `WEB_URL` validada; HTML escapado hacia Telegram; `callback_data` no confiable (el id va a la API que autoriza); almacén cifrado con IV único por escritura; `deleteMessage` del código; `forward_origin` como dato, no instrucción. |
| **F6-T19 Documentación y cierre**                         | 6H     | §21, `docs/decisiones/0027-precisiones-de-la-fase-6.md`, `docs/decisiones/README.md`, `docs/api/openapi.json`, `CLAUDE.md`, `docs/CHANGELOG.md`, `README.md` | Criterios de §23 desde un clon limpio; PR(s) a `main` con CI verde.                                                                                                                                                                                                                                                                          |

Si se divide en dos PR (§25.1): 6a = T1–T8, T11–T14, T16 (solo la parte de avisos) y T19 parcial (ADR 0027a o una sola ADR 0027 al cerrar 6b); 6b = T9, T10, T15, T17, T18 completo y T19.

## 23. Criterios de aceptación de la fase (verificación final, en este orden)

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                          → 0 errores (incluye apps/bot)
npm run db:migrar                                                                           → 13 migraciones aplicadas
npm test                                                                                    → verde (shared; api; web; bot)
                                                                                              Duration de la API ≤ 7 min local (anotar la cifra)
npm run db:reiniciar                                                                        → 18 tickets, 6 OT, 4 cotizaciones; 8 avisos de crojas (3 sin leer)
npm run api:openapi && git diff --exit-code docs/api/openapi.json                           → sin diff
grep -rn "bot[0-9]\{8,10\}:[A-Za-z0-9_-]\{30,\}" apps packages docs .github .env.example     → vacío (ningún token de Telegram en el repo)
npm run dev                                                                                 → "api iniciada", "jobs iniciados" (6 colas); sin TELEGRAM_BOT_TOKEN el proceso bot termina con "bot deshabilitado"
curl -b cookie(crojas) "localhost:3010/api/avisos/no-leidos"                                 → 200 { no_leidos: 3 }
curl -b cookie(crojas) "localhost:3010/api/avisos?filtro=menciones"                          → 200 { datos: [ { tipo: 'mencion', … } ], no_leidos: 3 }
curl -b cookie(crojas) -H "X-Requested-With: Zydesk" -X POST localhost:3010/api/avisos/leer-todos → 200 { marcados: 3 }
curl -b cookie(sdiaz) -H … -X POST -d '{"tipo":"nota_interna","texto":"@Camila mira esto","mencionados_ids":[<crojas>],"archivo_ids":[],"horas":null}' /api/tickets/<TK-1048>/mensajes → 201
curl -b cookie(crojas) "localhost:3010/api/avisos/no-leidos"                                 → 200 { no_leidos: 1 }  (el despachador creó la mención)
curl -b cookie(crojas) "localhost:3010/api/avisos?filtro=menciones&solo_no_leidos=true"      → el texto NO contiene "mira esto"
curl -b cookie(sdiaz) "localhost:3010/api/mi-dia"                                            → 200 { conteos: { vencen_hoy: ≥1, menciones: ≥1, … } }
curl -b cookie(sdiaz) "localhost:3010/api/tickets/linea-de-tiempo?desde=<lunes>&hasta=<lunes+13>" → 200 { dias: 14, items: […], vencidos: ≥1 }
curl -b cookie(crojas) "localhost:3010/api/ots/indicadores"                                  → 200 { por_facturar: { n: 1, neto: 680000 }, … }
curl -b cookie(sdiaz)  "localhost:3010/api/ots/indicadores"                                  → 200 { por_facturar: { n: 1, neto: null }, … }
curl -b cookie(crojas) -OJ "localhost:3010/api/ots/exportar.xlsx?estado_facturacion=por_facturar" → ots-facturacion-<fecha>.xlsx (1 fila); auditoria.exportacion
curl -b cookie(sdiaz)  -OJ "localhost:3010/api/ots/exportar.xlsx"                            → 403 SIN_PERMISO
curl -b cookie(crojas) -H … -X POST localhost:3010/api/yo/telegram/codigo                    → 503 TELEGRAM_NO_DISPONIBLE sin token; 201 { codigo: 8 caracteres } con token
curl -H "X-Bot-Key: <clave>" -H "Content-Type: application/json" -X POST -d '{"codigo":"<codigo>","chat_id":12345}' localhost:3010/api/bot/vincular → 201 { token }
curl … mismo código otra vez                                                                 → 400 CODIGO_INVALIDO
curl -H "Authorization: Bearer <token>" "localhost:3010/api/mi-dia"                           → 200 (sin cookie ni CSRF)
curl -H "Authorization: Bearer <token>" -X POST -d '{…seguimiento…}' /api/tickets/<id>/mensajes → 201 con autor crojas
curl -H "Authorization: Bearer <token>" -X DELETE localhost:3010/api/yo/telegram              → 204; el Bearer siguiente → 401
curl -X POST -d '{…}' localhost:3010/api/bot/vincular                                         → 401 CLAVE_BOT_INVALIDA
GitHub Actions: workflow CI verde en la rama y en el/los PR a main; paso "Tests" ≤ 4 min
```

En el navegador (1440 px y 390 px): `/avisos` con `crojas` reproduce el diseño (8 avisos, 3 sin leer, filtros, badge «3» en el menú, 9 filas de preferencias sin columna correo, tarjeta de Telegram con el diálogo del código); `/mi-dia` con `sdiaz` y con `fcastro` (Por aprobar); `/tickets/linea-de-tiempo` con 10 columnas hábiles, filas por persona, «N vencidos» y `agrupar=cliente`; `/ots` con indicadores, «Esperando aprobación» en OT-0214, «Borrador · por aprobar» en OT-0219 y exportación descargable; `/perfil` muestra la sesión del bot como «Bot de Telegram» tras F6-T17. Con un **bot real** (F6-T17): vincular, recibir la mención en Telegram con el enlace a la web, responderla y ver el seguimiento en el ticket, aprobar OT-0219 con el botón, crear un ticket reenviando un texto, `/desvincular`. Detener `npm run dev` con `taskkill /PID <pid> /T /F` y comprobar que no queda ningún `node.exe` de `tickets-app` (incluido el bot).

## 24. Decisiones tomadas en esta spec (con justificación)

1. **El despachador escucha los eventos de dominio ya publicados y escribe `aviso` en su propia transacción corta** (ADR 0008): no toca la transacción del negocio ni su orden de bloqueo; el costo es que un corte entre el commit y el despacho pierde el aviso (riesgo aceptado en ADR 0008; los vencimientos se recuperan solos por el job y la `clave`). Pregunta §25.20.
2. **Convención `pendientes`** (§1.3) en vez de publicar desde dentro de `*EnTx`: mantiene la regla "nunca dentro de la transacción" (`CLAUDE.md`) y evita que el cierre de OT dispare avisos duplicados.
3. **El actor no se avisa a sí mismo**: la spec habla de "me asignan", "me mencionan"; avisarte de lo que acabas de hacer es ruido. Pregunta §25.6.
4. **La fila `aviso` existe aunque la preferencia app esté apagada (`en_app = false`)**: es el registro y la base del envío por Telegram; sin ella, "Telegram sí, app no" sería imposible. Pregunta §25.19.
5. **Vencimientos al responsable principal**: el glosario de la spec lo dice literalmente ("Recibe avisos de vencimiento"). Pregunta §25.5.
6. **Sin avisos de ticket desde el cierre de OT**: `ot.cerrada` llega a responsables ∪ seguidores con el resultado; duplicarlo con `estado_ticket` y `ticket_asignado` llenaría el centro de tres avisos por un solo hecho.
7. **Texto del aviso generado en el servidor y almacenado**: Telegram necesita el texto plano y el centro de avisos lo muestra igual; generar en el cliente obligaría a replicar la lógica en web y bot. El texto nunca lleva contenido (§4.4).
8. **`vence_pronto` por job cada 30 min con clave idempotente** (ADR 0008, B2: 24 h de reloj): un cron a 30 min deja el aviso entre 23,5 y 24 h antes; suficiente y sin tabla de "ya avisado".
9. **Indicadores en pesos solo con `reportes.ver`**: la matriz de la spec (§2) reserva "Ver reportes y montos" a Administración, Coordinación y Solo lectura. La columna Neto de `/ots` (Fase 4) ya es visible para todos y **no se toca** en esta fase; se señala la inconsistencia (§25.10).
10. **Exportar para facturación con `ots.facturar`**: es la acción de quien factura (B3: "Coordinación exporta a fin de mes"); Solo lectura ve montos pero no opera la facturación. Pregunta §25.9.
11. **Línea de tiempo: items sin fecha límite se muestran con ancho mínimo y «sin fecha»**: la pantalla responde "¿en qué está cada uno?"; un ticket en curso sin fecha sigue siendo trabajo en curso (ADR 0021.6 admite `fecha_limite NULL`). Pregunta §25.8.
12. **"Detenidos hace días" = tickets míos abiertos sin actividad en 3 días** (incluidos en espera): el diseño solo da el título; 3 días es el umbral más simple que separa "lo de esta semana" de lo olvidado. Pregunta §25.7.
13. **Sesión de bot = una por usuario, `origen = 'bot'`, intervalos `mantener` de ADR 0013 (30 d / 90 d)**, token devuelto una sola vez y guardado por el bot cifrado en disco (ADR 0008 lo exige así). Al vencer, solo caducan los comandos: los avisos salen de la API con el `chat_id` del vínculo, que no depende de la sesión. Pregunta §25.12.
14. **El vínculo vive en la API (`vinculo_telegram`) y los tokens en el bot**: la API necesita el `chat_id` para enviar y el bot necesita el token para actuar como la persona; ninguno guarda lo del otro. El bot sin BD (ADR 0008) y un archivo cifrado AES-256-GCM con IV único es lo mínimo que mantiene el token fuera de texto plano.
15. **Clave compartida `X-Bot-Key` solo para `/api/bot/vincular`**, comparada en tiempo constante y limitada por IP (fallos de clave) y por `chat_id` (códigos inválidos): una sola ruta expuesta a la clave reduce el daño si se filtra. **Riesgo residual aceptado** (ADR 0027.51): quien ya tiene la clave declara el `chat_id` que quiera, así que el límite por chat no lo frena; lo peor que puede hacer es intentar adivinar códigos de 8 caracteres de 32 símbolos (~2^40) que vencen a los 10 minutos.
16. **Código de 8 caracteres sin `I/O/0/1`, 10 minutos, un solo uso, hash en BD**: legible para escribirlo en el celular, ~10¹² combinaciones, y un código filtrado tarde no sirve. Pedir código exige **cookie** (no Bearer): un token de bot robado no puede re-vincular a otro chat.
17. **Un chat ↔ una persona; chat ya vinculado a otra cuenta → 409**: evita "robar" el chat de otra cuenta sabiendo solo un código propio; quien cambie de cuenta desvincula primero. Pregunta §25.18.
18. **Desvincular = borrar vínculo + todas las sesiones bot**; cerrar la sesión bot desde Sesiones activas = revocar comandos sin dejar de recibir avisos: dos palancas distintas, ambas visibles para la persona.
19. **La API envía a Telegram con `fetch`; grammY solo en el bot**: el envío es un `POST` JSON; cargar grammY en la API por eso sería una dependencia sin uso. Ambos procesos usan el mismo token: Telegram permite `sendMessage` desde varios procesos; `getUpdates` solo lo hace el bot.
20. **Botón «Aprobar» solo en OT internas**: la aprobación del cliente exige respaldo adjunto (spec §4.5) y no se puede completar desde un botón. Pregunta §25.14.
21. **Crear ticket desde un reenvío pide confirmación y solo acepta texto**: un reenvío accidental no debe crear tickets; fotos y archivos exigirían subir binarios desde el bot (`/api/archivos` multipart) y queda para una fase posterior. Pregunta §25.13.
22. **"Responder un aviso" resuelve el destino por el código `TK-`/`OT-` del mensaje citado**: evita que el bot guarde estado por mensaje; si el mensaje citado no tiene código, no hace nada.
23. **Solo chats privados**: el bot actúa como una persona; en un grupo no hay forma de saber quién habla por quién. Pregunta §25.17.
24. **Resumen diario sin fila `aviso`**, solo por Telegram, omitido en feriados generales y cuando no hay nada: es un recordatorio, no un hecho del negocio; en la app ya está Mi día. Pregunta §25.3.
25. **Avisos leídos se borran a los 90 días** (`mantencion.limpiar`): minimización (ADR 0017); el historial de negocio sigue en `evento`. Pregunta §25.11.
26. **Sin `evento` ni `auditoria` por avisos y preferencias**; auditoría solo para vincular/desvincular/fallos de clave y código (son seguridad) y exportación (ADR 0017).
27. **`npm run dev` arranca el bot solo si hay token**: el desarrollo normal no necesita Telegram; el proceso termina en silencio para no ensuciar `concurrently`. Pregunta §25.16.
28. **Dockerfile del bot y despliegue quedan para la Fase 9** (PLAN): aquí solo variables y ejecución local; `docs/despliegue.md` nace en la Fase 9.
29. **Dividir la fase en dos PR (6a visibilidad, 6b Telegram)** se propone porque la fase toca 7 bloques, un workspace nuevo y una integración externa; 6a es demostrable sin bot y reduce el riesgo del merge. Pregunta §25.1.

## 25. Preguntas para el usuario

1. **[Bloquea el plan de tareas]** ¿Dividir la fase en **dos PR**: `6a` (eventos, despachador, centro de avisos, Mi día, línea de tiempo, pantalla 10) y `6b` (Telegram: vinculación, canal, resumen diario, `apps/bot`), cada uno con su revisión de seguridad, o un solo PR? **Recomendación: dos PR** sobre la misma rama base (`feat/fase-6a-visibilidad` y `feat/fase-6b-telegram`), una sola ADR 0027 al cerrar 6b.
2. **[Bloquea F6-T17 y la demo; no bloquea el código]** Para probar de verdad hace falta un **bot real**: ¿creas con @BotFather un bot de desarrollo (p. ej. `@zydesk_dev_bot`) y pones su token solo en tu `.env` local (nunca en el repo)? En producción (Fase 9) se crea otro bot. **Recomendación: sí**; sin él, 6b se verifica solo con dobles.
3. **Zona horaria y feriados del resumen diario**: 08:30 **America/Santiago** L–V (ADR 0008/0013). ¿Omitirlo en feriados generales y cuando no hay nada que mostrar? No bloquea. **Recomendación: omitir en ambos casos.**
4. **Qué va por Telegram por defecto**: lo del diseño (todo salvo "cambia el estado" y "nuevo seguimiento") + resumen diario activo. ¿De acuerdo? No bloquea (es un objeto de constantes). **Recomendación: como el diseño.**
5. **[Bloquea F6-T4]** Avisos de vencimiento: ¿solo al **responsable principal** (glosario de la spec §3: "recibe avisos de vencimiento"; decisión 5) o a **todos los responsables** del ticket (lectura amplia de "un ticket mío", §4.10)? **Recomendación: principal**, que es lo que la spec dice; si prefieres todos los responsables, cambia solo `destinatarios.ts` y la prueba 13 de §14 (los corresponsables pueden seguir el ticket para recibir el resto).
6. ¿El actor **no** recibe aviso de su propia acción (decisión 3)? No bloquea. **Recomendación: no recibir.**
7. "Detenidos hace días": ¿tickets míos abiertos sin actividad en **3 días** calendario (incluidos En espera)? No bloquea. **Recomendación: 3 días**, incluidos En espera.
8. Línea de tiempo: ¿tickets **sin fecha límite** se muestran como barra mínima «sin fecha» (decisión 11) o se omiten? No bloquea. **Recomendación: mostrar.**
9. **[Bloquea F6-T8]** Permiso de **"Exportar para facturación (.xlsx)"**: `ots.facturar` (Administración, Coordinación) o `reportes.ver` (también Solo lectura)? **Recomendación: `ots.facturar`.**
10. **[Bloquea F6-T8]** Indicadores en pesos de la pantalla 10 solo con `reportes.ver` (técnicos ven «—»). La columna Neto de `/ots` (Fase 4) hoy la ven todos: ¿la dejamos así en esta fase (recomendado, para no mezclar) o la ocultamos también a técnicos ahora? **Recomendación: indicadores con permiso; columna sin tocar**, anotado en ADR 0027 para revisarlo en la Fase 7 (reportes).
11. Retención de avisos: ¿borrar los **leídos** de más de **90 días**? No bloquea. **Recomendación: sí.**
12. **[Bloquea F6-T9]** Sesión del bot: ¿intervalos de ADR 0013 "mantener" (**30 días** sin usar comandos / **90 días** absolutos; al vencer, re-vincular con un código para volver a usar comandos, los avisos siguen) o una duración mayor (1 año)? **Recomendación: ADR 0013**; re-vincular toma un minuto y limita el daño de un token filtrado. ¿Y al **desactivar** a una persona: conservar el vínculo (sin enviar nada) por si se reactiva, o borrarlo? **Recomendación: conservar** (los avisos ya no salen porque `activo = false` filtra destinatarios).
13. Crear ticket desde un **reenvío**: ¿con confirmación (botones) y **solo texto** (sin fotos ni archivos)? No bloquea. **Recomendación: sí a ambas.**
14. Botón «Aprobar» solo para **OT internas** (la aprobación del cliente exige respaldo). No bloquea. **Recomendación: sí.**
15. ¿«Marcar facturada» desde la lista 10? El diseño no lo dibuja y ADR 0022 pide que los cambios se hagan desde la OT. No bloquea. **Recomendación: no**; sigue en el detalle.
16. `npm run dev` arranca el bot solo si hay `TELEGRAM_BOT_TOKEN` (si no, termina en silencio). No bloquea. **Recomendación: sí.**
17. El bot responde solo en **chats privados** (grupos ignorados). No bloquea. **Recomendación: sí.**
18. Un `chat_id` ya vinculado a **otra cuenta** → 409 (hay que desvincular desde esa cuenta). No bloquea. **Recomendación: sí**.
19. **[Bloquea F6-T4]** Con la preferencia "en la app" apagada: ¿se crea la fila igual con `en_app = false` (decisión 4; Telegram sigue funcionando) o no se crea nada (y entonces "Telegram sí, app no" no existe)? **Recomendación: crear con `en_app = false`.**
20. El despachador escribe los avisos **después** del commit (ADR 0008): un corte justo ahí pierde el aviso (los vencimientos se recuperan solos). ¿Aceptable en v1? No bloquea. **Recomendación: aceptable**; si alguna vez importa, el despachador puede pasar a escribir dentro de la transacción del negocio con una ADR.

### Respuestas del usuario (2026-10-01)

- **Preguntas que bloquean** (1, 2, 5, 9, 10, 12, 19): el usuario aceptó todas las recomendaciones.
  - Dos PR.
  - El usuario crea un bot de desarrollo y pone su token solo en su `.env` local.
  - Los vencimientos se avisan al responsable principal.
  - Exportar exige `ots.facturar` y los indicadores en pesos `reportes.ver`. La columna Neto de `/ots` no se toca y se revisa en la Fase 7.
  - La sesión del bot dura 30 días sin uso o 90 días absolutos. Al desactivar a una persona, su vínculo se conserva pero no recibe nada.
  - Con la preferencia "en la app" apagada, el aviso se crea con `en_app = false`.
- **Preguntas que no bloquean** (3, 4, 6–8, 11, 13–18, 20): se resuelven con la recomendación de esta sección.

### Estado de avance (2026-10-01)

- Spec aprobada. **PR 6a** (rama `feat/fase-6a-visibilidad`):
  1. 6A (F6-T1, T2).
  2. 6B (F6-T3 a T6) y 6D (F6-T7, T8) en paralelo.
  3. 6E y 6F (F6-T11 a T14) en paralelo.
  4. F6-T16 (semillas de avisos).
  5. Revisión de seguridad de 6a.
  6. Documentación de 6a (CHANGELOG, manuales y estado de avance).
- **PR 6b** (rama `feat/fase-6b-telegram`, desde `main` tras el merge de 6a):
  1. 6C (F6-T9, T10).
  2. 6G (F6-T15).
  3. F6-T17 (prueba con el bot real).
  4. F6-T18 (revisión de seguridad).
  5. F6-T19 (ADR 0027 y cierre).

### Estado de avance (2026-10-02): PR 6a hecho

Todo el PR 6a está implementado, verificado y commiteado en `feat/fase-6a-visibilidad` (12 commits desde `main`). Suite final: shared 299; API 796 + 2 omitidos (177 s en local); web 335. Desviaciones y precisiones respecto de esta spec, por bloque:

- **6A**: `test/fabricas.ts` quedó truncado por una interrupción del agente y se completó a mano antes de seguir. Migración 13, 5 entidades y `fabricas-fase6.test.ts` según §3.
- **6B**: `NOMBRES_EVENTOS_DOMINIO` se agregó a `shared/eventos.ts` como registro tipado (§6.6). `TELEGRAM_BOT_TOKEN` se lee de `process.env` dentro del despachador hasta que 6C lo incorpore a `config/env.ts`. El test de colas de `iniciarJobs` se movió a `boss.test.ts` (4 colas en 6a: `mantencion.limpiar`, `tickets.archivar`, `archivos.limpiar_huerfanos`, `tickets.vencimientos`; `aviso.enviar` y `avisos.resumen_diario` llegan en 6C). El texto de `ot_por_aprobar` nombra a `ot.creado_por` como solicitante (el evento no trae otro actor); la semilla fija el texto del diseño («Valentina Soto…») a mano.
- **6D**: Mi día lista tickets donde la persona es **responsable** (principal u otro), no con `solo_mios` (que incluye seguidores; §14.15). `detenidos` excluye los que vencen hoy o vencidos. Línea de tiempo con tope de 500 ítems y exportación con tope de 5 000 filas: superarlos responde `400 VALIDACION` (`detalles.hasta` / `detalles.filtros`). La auditoría de exportación guarda solo los **nombres** de los filtros (sin valores). `crearRutasMiDia` se montó en `app.ts` y sus tests usan `crearApp`; el `app-prueba.ts` provisional se borró.
- **6E**: `TarjetaTelegram` se oculta mientras la API no ofrece `/api/yo/telegram` (6C); el resto de §15 (lista, filtros, preferencias sin columna correo, badge, etiqueta «Bot de Telegram» en Sesiones) está hecho.
- **6F**: `PillEtapaOt` recibe la etiqueta derivada por la prop `etiqueta`; `OtsPage` acepta el filtro `etapa` desde la URL (destino de la tarjeta «Esperando al cliente»); la columna «Neto / horas» no cambió (ya cubría el caso interna).
- **Semillas**: 7 avisos para `crojas` (3 sin leer) y 3 para `sdiaz`; §20 decía 8 pero describe 7 (el octavo del diseño es el aviso de cotización sin respuesta, fuera de alcance). `desarrollo.test.ts` afirma 7.
- **Verificación en el navegador** (1440 y 390 px): `crojas` con 7 avisos y 3 sin leer, contador en menú y barra inferior; asignar una tarea como `sdiaz` genera el aviso a Camila (sube a 4); pantalla 10 con montos para `crojas` y «—» más exportar 403 para `sdiaz`; el `.xlsx` descarga como `ots-facturacion-<fecha>.xlsx`; línea de tiempo con 10 columnas hábiles y subfilas apiladas; Mi día de `sdiaz` con TK-1048 en «Vencen hoy», la mención de Camila y 3 tareas en 2 columnas a 390 px; Avisos con pestañas a 390 px.
- **Revisión de seguridad de 6a**: `/security-review` (Opus) y `sentry-security-review` (Fable) sin hallazgos reales. Observaciones aplicadas con test en `d9f06f5`: **OBS-1** los filtros de `auditoria.exportacion` se comprueban con `Object.hasOwn` (antes `in` aceptaba `constructor`, `toString`); **OBS-2** los destinatarios de `por_facturar` se derivan de la matriz de permisos (`ots.facturar`). **OBS-3** (`href` del enlace «Abrir en Telegram» de `DialogoVincular`) se revisa en 6b con la vinculación real.
- **Documentación de 6a**: CHANGELOG, manuales (primeros pasos, técnico, coordinación, administración), guía de la API y `CLAUDE.md` actualizados; `openapi.json` regenerado. ADR 0027 queda para el cierre de 6b (§25.1). Se quitó del diálogo de cierre de OT el texto «Los avisos se activan en la Fase 6».
- **Siguiente**: PR 6a a `main` con confirmación del usuario y CI verde; luego rama `feat/fase-6b-telegram` desde `main`.
- **Integrado** (2026-10-02): PR #5 a `main` (`84e2ab9`). ADR 0027 (parte 6a) entró antes del merge y registra "Mi día" como pantalla inicial confirmada por el usuario. **CI**: el job `verificar` del PR tardó **5 min 9 s** según el usuario (por encima del objetivo de ≤ 4 min del paso "Tests" de §23; retomar F4-T2 si sigue creciendo).
- **Agregado a 6b por el usuario (2026-10-02)**: **QR de vinculación** en `DialogoVincular` (librería `qrcode`, MIT), generado en el navegador desde el `enlace` `https://t.me/<bot>?start=<código>` de la API; solo en escritorio (≥ 768 px), con aviso "No compartas este código ni el QR".
- **Agregado a 6b por el usuario**: el enlace **"Ayuda"** dentro de la app que abre el manual del rol (ADR 0012), pendiente desde la Fase 1.
- **F6-T20 agregada (2026-10-02)**: §27 fija cómo se implementa "Ayuda" (manuales importados con `?raw`, ruta `/ayuda/:manual`, enlace en menú lateral y panel «Más»). Independiente de 6C/6G; puede ir en paralelo.

### Estado de avance (2026-10-04): PR 6b hecho

Todo el PR 6b está implementado en `feat/fase-6b-telegram` (desde `main` tras el merge de 6a). Desviaciones y precisiones respecto de esta spec, registradas en ADR 0027 (puntos 39–51):

- **6C (F6-T9, F6-T10)**: §9 y §7.3 según la spec, con `config/env.ts` validando `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USUARIO`, `BOT_API_KEY` y `WEB_URL` (saldada la deuda del punto 30 de la ADR; `comoBot` usa `env.BOT_API_KEY`); worker de `aviso.enviar`, `avisos.resumen_diario`, `mantencion.limpiar` ampliado y `boss.test.ts` con 6 colas. **Desviación**: `csrf.ts` exime `/api/bot/*` sin cookie (la spec §9.4 decía «sin cambios»; sin cookie no hay credencial que forjar y la ruta solo acepta `X-Bot-Key`). **Formato de los mensajes** corregido tras la prueba real y aprobado por el usuario: cabecera `<b>Zydesk</b>`, código en negrita dentro de la frase (antepuesto solo si falta), enlace «Abrir CÓDIGO»; el botón «Ver en la web» y el enlace solo son clicables con `WEB_URL` https. El formato de «Mi día» (§8.2) se movió a `packages/shared/src/telegram/formato-mi-dia.ts` y lo comparten el resumen diario y `/hoy`.
- **6G (F6-T15)**: §19 según la spec, probado con dobles (`bot.test.ts`, `api/cliente.test.ts`, `config/env.test.ts`, `formato.test.ts`, `sesiones/almacen.test.ts`). **Corrección** de §19.4: `/ticket` y «responder un aviso» buscan en dos pasos (`archivados=false` y luego `archivados=true`), porque `archivados=true` devuelve solo archivados. Texto del 401 ajustado al de §19.5.
- **F6-T20 (6I)**: §27 completo: `/ayuda/:manual`, pestañas por rol, índice, `remark-gfm`, enlace en el menú lateral y en «Más»; `manuales.test.ts` comprueba los enlaces entre manuales. Al crear `04-bot-telegram.md` (F6-T19) hay que registrarlo en `features/ayuda/manuales.ts` con clave `bot-telegram` y todos los roles (§27.1).
- **QR de vinculación** (agregado por el usuario): `DialogoVincular` genera el SVG con `qrcode` en el navegador desde el `enlace` de la API, solo en escritorio (≥ 768 px) y solo si empieza con `https://t.me/`; se pinta en un `<img>` con data URL y con la advertencia de no compartir el código ni el QR. Cierra OBS-3.
- **Corrección del logger de la API** (`config/logger.ts`, desde la Fase 0): el `mixin` devolvía el contexto del `AsyncLocalStorage` y pino lo mutaba al mezclar, con lo que los logs siguientes arrastraban `req`/`res` (incluida la cookie de sesión). Devuelve una copia; `log-http.test.ts` lo fija.
- **Tiempos de test**: `testTimeout` 15 s en la web y 60 s para el test del CLI de OpenAPI (`docs.test.ts`), por equipos lentos.
- **F6-T17 (prueba con el bot real)**: **pasada** por el usuario con un bot de desarrollo y el token solo en su `.env` local: vincular desde `/avisos` (código, enlace y QR), aviso real al mencionar a la persona, `/hoy`, `/mis`, `/ticket 1048`, responder el aviso → seguimiento visible en la web, botón «Aprobar OT» en OT-0219, reenviar un texto → ticket creado, `/desvincular`; «Bot de Telegram» en Sesiones activas. De esa prueba salieron las correcciones de formato y de la búsqueda de tickets.
- **F6-T18 (revisión de seguridad)**: `/security-review` y `sentry-security-review` sobre el diff completo. Correcciones con test (ADR 0027.51): (a) el límite de 20 fallos por IP de `/api/bot/vincular` cuenta solo fallos de **clave** (`motivo = 'clave'`), no códigos inválidos, que ya se limitan por chat (§9.3 precisado); (b) `codigo_vinculo.codigo_hash` pasa a **HMAC-SHA256 con `BOT_API_KEY`** (un volcado de la BD no permite recuperar un código vigente offline; rotar la clave invalida los códigos vigentes; las sesiones siguen con SHA-256); (c) «responder un aviso» toma el destino de la **entidad en negrita** `TK-n`/`OT-n` del mensaje citado, solo si hay exactamente un código distinto (la lista de `/mis` no sirve de destino), no del primer código del texto, y la confirmación de reenvío pasa a cursiva (§19.4 precisado); (d) `WEB_URL` del bot se valida como en la API; (e) el logger del bot no redacta el mensaje ya saneado por `errorSeguro`.
- **F6-T19 (documentación)**: ADR 0027 completa (estado «aceptada»), `docs/decisiones/README.md`, CHANGELOG, manual nuevo `usuario/04-bot-telegram.md`, sección 17 «Bot de Telegram» del manual de administración, primeros pasos (Telegram y Ayuda), coordinación, guía de la API («Telegram y bot»), README (bot en desarrollo), `.env.example`, `CLAUDE.md`; `openapi.json` regenerado con las rutas de 6C.
- **CI**: el job `verificar` del PR 6a tardó 5 min 9 s (registrado arriba; cierra el pendiente de proceso de la ADR). La cifra del PR 6b se anota aquí al integrarlo.
- **Siguiente**: PR 6b a `main` con confirmación del usuario y CI verde; después, Fase 7.

### Cómo continuar (para retomar en otro equipo)

**Estado al 2026-10-02**: el PR 6a está completo y subido en `origin/feat/fase-6a-visibilidad`, pendiente de que el usuario abra el PR, lo revise y haga merge. Los textos del PR y del merge (#5) se entregaron en el chat.

**Preparar el equipo**:

1. `git fetch origin`.
2. Si el PR 6a ya está mergeado: `git checkout main && git pull --ff-only`. Si no: `git checkout feat/fase-6a-visibilidad`.
3. Docker Desktop abierto y `docker compose -f docker-compose.dev.yml up -d`.
4. `npm install`, `npm run db:migrar` (13 migraciones) y `npm run db:reiniciar`.
5. Crear `.claude/settings.local.json` con `{ "attribution": { "commit": "", "pr": "" }, "includeCoAuthoredBy": false }`. No se versiona: commits y PR van sin coautoría.
6. Verificar con `npm test`. Valores esperados: shared 299, API 796 (+2 omitidos), web 335.

**PR 6b** (rama `feat/fase-6b-telegram`, creada desde `main` después del merge del 6a), en este orden:

1. **6C (F6-T9, F6-T10)**: vinculación y sesiones de bot, `POST /api/bot/vincular` con `X-Bot-Key`, `/api/yo/telegram*`, `CanalTelegram`, cola `aviso.enviar` (extiende `core/jobs/enviar-aviso.ts`), job `avisos.resumen_diario` y `mantencion.limpiar` ampliado (avisos leídos de más de 90 días y códigos vencidos). También:
   - `config/env.ts` gana `TELEGRAM_BOT_TOKEN`, `BOT_API_KEY` y `WEB_URL`.
   - El despachador lee hoy `process.env['TELEGRAM_BOT_TOKEN']`: pasarlo a `env`.
   - `comoBot` en `test/fabricas.ts` lleva la marca `// F6-T9`: pasarlo a `env.BOT_API_KEY`.
   - `boss.test.ts` sube a 6 colas.
   - Base de test: `npm run db:test:crear -- 6c`.
2. **6G (F6-T15)**: bot `apps/bot` con grammY, probado con dobles (§19.6). Puede ir en paralelo con 6C contra los esquemas de `shared`.
3. **F6-T17**: prueba con un bot real. El usuario crea un bot de desarrollo en @BotFather y pone su token **solo** en su `.env` local (nunca en el repo ni en el chat).
4. **F6-T18**: revisión de seguridad (Fable con `sentry-security-review` y `/security-review`). Revisar también OBS-3: el `href` de «Abrir en Telegram» en `DialogoVincular.tsx` debe venir de `https://t.me/<bot>` armado en el servidor, y `WEB_URL` debe validarse como `http(s)://`.
5. **F6-T19**: ADR 0027 (registra §26 y las desviaciones de 6a y 6b), CHANGELOG, manuales (Telegram y bot), `README.md`, `.env.example`, `openapi.json` y `CLAUDE.md`. Después, PR a `main` con la confirmación del usuario.

**Forma de trabajo** (sin cambios): Opus planifica y verifica (typecheck, lint, format:check, build y `npm test` antes de cada commit). Fable escribe specs, ADR y revisiones; su resumen se entrega en el chat con decisiones, recomendaciones y preguntas que bloquean. Sonnet programa por bloques, cada uno con su base de test. Los commits son convencionales en español, sin `Co-Authored-By`. `push` y PR solo con confirmación del usuario.

## 26. Cambios de ADR propuestos (no se editan las ADR; registrar en ADR 0027 "Precisiones de la Fase 6" al cerrar)

- **ADR 0002 / 0013**: la sesión de bot se crea en `POST /api/bot/vincular`, una por usuario, `origen = 'bot'`, `mantener = true` (30 d / 90 d), `user_agent = 'Telegram'`, sin IP; se revoca al desvincular, desde Sesiones activas y por cambio de contraseña/rol/desactivación. Pedir un código exige sesión por cookie. El bot envía `Authorization: Bearer` y no necesita `X-Requested-With` (ya en `csrf.ts`).
- **ADR 0008**: lista definitiva de eventos de dominio (§3.2) y su mapeo a `aviso.evento`/`tipo` (§4.1); `preferencia_aviso` guarda solo valores explícitos y los defectos viven en `shared`; `aviso` gana `tipo`, `clave`, `texto`, `enlace`, `entidad`, `entidad_id`, `datos`, `actor_id`, `en_app`; `aviso_envio` reemplaza a `aviso.error`; el despachador corre tras el commit en transacción propia; `tickets.vencimientos` publica con clave idempotente; `avisos.resumen_diario` solo por Telegram, sin fila `aviso`, omitido en feriados generales; el código de vinculación pasa de 6 a **8** caracteres (alfabeto de 32 símbolos), hash en BD; la ruta de vinculación es `POST /api/bot/vincular` con `X-Bot-Key` (no `BOT_API_KEY` en Bearer); el bot guarda los tokens cifrados con AES-256-GCM en `BOT_DATOS_DIR`; `CanalTelegram` vive en la API con `fetch` (sin grammY en la API); botón «Aprobar» solo en `ot_por_aprobar`.
- **ADR 0010**: rutas nuevas `GET /api/avisos`, `GET /api/avisos/no-leidos`, `POST /api/avisos/:id/leer`, `POST /api/avisos/leer-todos`, `GET|PUT /api/yo/avisos/preferencias`, `GET|DELETE /api/yo/telegram`, `POST /api/yo/telegram/codigo`, `POST /api/bot/vincular`, `GET /api/mi-dia`, `GET /api/tickets/linea-de-tiempo`, `GET /api/ots/indicadores`, `GET /api/ots/exportar.xlsx`; códigos `CODIGO_INVALIDO`, `VINCULACION_BLOQUEADA`, `TELEGRAM_CHAT_EN_USO`, `TELEGRAM_NO_DISPONIBLE`, `CLAVE_BOT_INVALIDA`; un aviso ajeno responde 404; `permiso: 'publico'` + `previos` para la única ruta con clave compartida.
- **ADR 0011 / 0019**: pantallas 8 y 9 mobile-first; badge de avisos con sondeo de 60 s; línea de tiempo con CSS Grid y estado en la URL (`escala`, `agrupar`, `desde`, `vencidos`); sin columna correo en preferencias.
- **ADR 0016**: `GET /api/tickets/linea-de-tiempo` devuelve `dias` (hábiles del departamento de quien mira) e `items` planos con `vencido`, incluyendo vencidos abiertos fuera del rango; items sin fecha límite con ancho mínimo; escala 2 semanas = 10 días hábiles.
- **ADR 0017**: acciones de auditoría `telegram_vinculado`, `telegram_vinculacion_fallida`, `telegram_desvinculado`; `exportacion` con `entidad: 'ots'` y `filtros`; logs del bot con `servicio: 'bot'` y `redact` de `chat_id` y textos; avisos y preferencias sin `evento` ni `auditoria`; retención de avisos leídos 90 días; limpieza de códigos vencidos.
- **ADR 0020**: `TELEGRAM_BOT_TOKEN`, `BOT_API_KEY` y `BOT_CLAVE_CIFRADO` solo en `.env` (`.env.example` sin valores reales); comprobación por `grep` en los criterios de cierre; CI corre los tests del bot con dobles.
- **ADR 0021.2 / 0021.15**: las menciones **ya** generan aviso (deja de ser pendiente); los mensajes siguen sin `evento`.
- **ADR 0023.14 / 0025.15**: los oyentes de `eventosDominio` pasan de un log a log + despachador; `ot.cerrada` cubre los avisos del ticket en el cierre (sin `ticket.estado_cambiado` ni `ticket.asignado` desde el cierre).
- **ADR 0023.8 / 0025**: pantalla 10 completa: indicadores (`neto` solo con `reportes.ver`), etiquetas derivadas `esperando_cliente` y `por_aprobar` (A2), exportación `.xlsx` con `ots.facturar`; «Marcar facturada» sigue en el detalle (ADR 0022).
- **Spec funcional §4.10 / §6 / PLAN §4**: `PreferenciaAviso` pasa a (usuario, evento, canal, activo); `Aviso` gana los campos de §3.1; el canal correo queda previsto sin implementar; el resumen diario es por Telegram; el bot cubre `/hoy`, `/mis`, `/ticket`, responder aviso, aprobar OT interna y crear ticket desde texto reenviado, siempre con la sesión de la persona.

## 27. Ayuda dentro de la app (agregado al PR 6b)

Cierra la promesa de ADR 0012 («enlace "Ayuda" en el menú que abre el manual del rol renderizado desde los mismos `.md`; sin buscador ni sistema aparte») y de ADR 0019 (todo lo del menú llega al celular por el panel «Más»). Bloque **6I**, solo `apps/web`; **independiente de 6C y 6G** (no toca `apps/api`, `apps/bot` ni `packages/shared`) y puede ir en paralelo con ellos. Las capturas (`docs/manuales/img/`) quedan para la Fase 8 (decisión del usuario); nada de este bloque depende de ellas.

### 27.1 Cómo llegan los manuales a la web

**Decisión: importarlos como texto en el build con `?raw` de Vite, directamente desde `docs/manuales/`.** Una sola fuente (los `.md` del repo, los mismos que se leen en GitHub), sin copia a `public/`, sin script de sincronización y sin ruta nueva en la API. Funciona igual en `vite` (dev), `vite build` y `vitest` (usa el mismo pipeline de Vite; `vite/client` ya tipa `*?raw` como `string`), y el contenedor de producción no necesita `docs/` en tiempo de ejecución: el texto queda dentro del bundle estático que sirve nginx. Se descartan: copiar a `public/` (dos copias o un paso de build más) y servirlos por la API (una ruta y una lectura de disco para algo que es estático).

- `apps/web/src/features/ayuda/manuales.ts` registra los manuales con imports **explícitos** (no `import.meta.glob`: cuatro archivos no justifican la indirección):

  ```ts
  import primerosPasos from '../../../../../docs/manuales/usuario/00-primeros-pasos.md?raw';
  // … 01-tecnico, 02-coordinacion, administracion
  export interface Manual {
    clave: ClaveManual;
    titulo: string;
    archivo: string;
    texto: string;
    roles: readonly Rol[];
  }
  ```

  Claves y orden fijos: `primeros-pasos` (todos los roles), `tecnico` (`tecnico`, `coordinacion`, `admin`), `coordinacion` (`coordinacion`, `admin`), `administracion` (`admin`). `archivo` es el nombre base del `.md` (`00-primeros-pasos.md`, …) y sirve para resolver enlaces (§27.4). `titulo` es el texto del `# ` de cada archivo (se extrae del texto; no se duplica a mano). `manualesDe(rol)` devuelve la lista filtrada en ese orden; `manualPorClave(clave)` el manual o `undefined`.

- Cuando F6-T19 cree `docs/manuales/usuario/04-bot-telegram.md`, se agrega una línea al registro con clave `bot-telegram` y todos los roles. Hasta entonces no existe y no se registra.
- Vite sirve en dev archivos fuera de `apps/web` porque el _workspace root_ por defecto de `server.fs.allow` es la raíz del monorepo (donde está `package-lock.json`). Si al abrir `/ayuda` en dev aparece `403 … outside of Vite serving allow list`, agregar en `vite.config.ts` `server.fs.allow: [raiz]` (`raiz` ya está definida ahí); no se hace de antemano.
- Consecuencia para la Fase 9: el `Dockerfile` de `web` debe copiar `docs/manuales/` a la etapa de build (el contexto ya es la raíz del monorepo). Registrar en el CHANGELOG como pendiente de la Fase 9.

### 27.2 Qué abre cada rol y cómo se organiza

| Rol            | Manuales (pestañas, en este orden)                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Solo lectura   | Primeros pasos                                                                                        |
| Técnico        | Primeros pasos · Manual de tickets para el equipo                                                     |
| Coordinación   | Primeros pasos · Manual de tickets para el equipo · Manual de coordinación                            |
| Administración | Primeros pasos · Manual de tickets para el equipo · Manual de coordinación · Manual de administración |

No se escribe un manual de Solo lectura: «Primeros pasos» cubre lo que ese rol usa (ingreso, perfil, Mi día, Avisos, celular) y el manual de coordinación ya dice qué ve y qué no.

**Una página, `/ayuda/:manual`, con pestañas por manual e índice del manual abierto.**

- `/ayuda` redirige (`Navigate replace`) a `/ayuda/primeros-pasos`. Ambas rutas van dentro de `Layout` (exigen sesión) en `app/router.tsx`.
- `AyudaPage` (`features/ayuda/pages/AyudaPage.tsx`): `TituloPagina` «Ayuda»; debajo, un `nav aria-label="Manuales"` con un `NavLink` por manual de `manualesDe(rol)` (estilo de pestañas con los tokens actuales; `aria-current="page"` lo pone `NavLink`). Con un solo manual (Solo lectura) la fila de pestañas **no se pinta**.
- Si `:manual` no existe en el registro → `PaginaNoEncontrada`. Si existe pero no está en la lista del rol (p. ej. un Técnico sigue desde «Primeros pasos» el enlace al manual de coordinación), **se muestra igual**: los manuales no son confidenciales (están en el repo público) y romper esos enlaces sería peor; las pestañas siguen mostrando solo las del rol. Lo que ADR 0012 fija es que «Ayuda» _abre_ el manual del rol, y eso lo cumplen la redirección y la lista de pestañas.
- **Índice «En esta página»**: lista de enlaces `#ancla` a los `## ` del manual abierto, construida a partir del texto crudo (líneas que empiezan por `## `, fuera de bloques de código con triple acento grave) con la misma función `slug` de §27.4. En `lg` y más: dos columnas, el índice a la derecha, `sticky` y con scroll propio (`aside aria-label="Índice del manual"`). Bajo `lg`: un `<details>` cerrado por defecto con `<summary>` «En esta página», encima del contenido.
- El contenido va en `<article>` con el mismo marco que `DocumentoLegalPage` (`rounded-lg border border-borde bg-superficie p-6`, `max-w-3xl` en la columna de texto). El `# ` del manual se renderiza como `h2` (así ya lo hace `Markdown.tsx`), con lo que el único `h1` de la página es «Ayuda».
- Al cambiar de manual sin `#`, la vista vuelve arriba (`window.scrollTo(0, 0)`).

### 27.3 Render del Markdown

- `features/legal/Markdown.tsx` **exporta** `COMPONENTES` (hoy es una constante privada; un cambio de una línea) y no cambia nada más: términos y privacidad siguen igual.
- `features/ayuda/MarkdownManual.tsx` usa `ReactMarkdown` con `remarkPlugins={[remarkGfm]}` y `components={{ ...COMPONENTES, h1, h2, h3, h4, a, table, thead, th, td }}`:
  - **`h1`–`h4`** reciben `id={slug(textoDe(children))}` (ids únicos: segunda aparición `-1`, tercera `-2`, como GitHub; el contador se reinicia por render con un `Map` local) y `tabIndex={-1}` con `scroll-mt-4`, para poder enfocarlos al llegar por ancla. `textoDe(children)` concatena los nodos de texto (ignora `<code>`, `<strong>`, etc. pero conserva su texto).
  - **`a`**: resolución de §27.4.
  - **Tablas** (GFM: `00-primeros-pasos.md` «Avisos» y `administracion.md` «Qué puede hacer cada rol»): clases equivalentes a `components/ui/table.tsx` (`th`/`td` con borde y `text-left`), envueltas en `div.overflow-x-auto` para que no rompan el ancho a 390 px.
  - El resto (párrafos, listas, citas) hereda de `COMPONENTES`.
- **Sin HTML crudo**: no se agrega `rehype-raw`; `react-markdown` ya omite el HTML embebido en el `.md` (lo descarta, no lo inyecta). Un test lo fija (§27.6).
- **Dependencia nueva: `remark-gfm`** (justificada: los manuales ya usan tablas y `react-markdown` sin GFM las pinta como párrafos; es del mismo ecosistema `unified`/`remark` que `react-markdown` ya trae, sin binarios ni config). Nada más: ni `rehype-slug` (lo resuelve `slug`), ni `rehype-raw`, ni `@tailwindcss/typography`.
- **Imágenes**: `img` queda con el render por defecto; hoy ningún manual tiene `![…]`. Cómo llegan las capturas (`docs/manuales/img/`) al bundle se decide en la Fase 8 junto con las capturas (probablemente `import.meta.glob` con `?url` o copia a `public/manuales/img/`); no se anticipa.

### 27.4 Enlaces y anclajes

`slug(texto)`: `normalize('NFC')`, minúsculas, quitar todo lo que no sea letra o número Unicode (`\p{L}`, `\p{N}`), espacio o guion, espacios → `-`, colapsar guiones repetidos y recortar guiones de los extremos. Es el mismo algoritmo que GitHub para los encabezados de los manuales, así los anclajes escritos a mano siguen valiendo: `Registrar horas` → `registrar-horas`, `Por aprobar en Mi día` → `por-aprobar-en-mi-día`, `Exportar para facturación (.xlsx)` → `exportar-para-facturación-xlsx`, `1. Primer ingreso y primer usuario` → `1-primer-ingreso-y-primer-usuario`. Vive en `features/ayuda/slug.ts` con su test.

`resolverEnlace(href)` (`features/ayuda/enlaces.ts`) clasifica el `href` del Markdown y el componente `a` lo pinta así:

| `href` en el `.md`                                                              | Resultado                                                                                                                                     |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `#ancla`                                                                        | `<a href="#ancla">` normal (misma página; el `useEffect` de abajo hace el scroll y el foco)                                                   |
| `01-tecnico.md`, `usuario/01-tecnico.md`, `./01-tecnico.md`, con o sin `#ancla` | `<Link to="/ayuda/tecnico#ancla">`: se toma el **nombre base** del archivo y se busca en el registro por `archivo`                            |
| `.md` que no está en el registro (p. ej. `../api/README.md`)                    | texto plano (`<span>`), sin enlace roto                                                                                                       |
| `http://`, `https://`, `mailto:`                                                | `<a target="_blank" rel="noopener noreferrer">` con un texto visible o `aria-label` que indique «(abre en una pestaña nueva)»                 |
| Cualquier otro (`/api/docs`, rutas internas absolutas)                          | `<Link to={href}>`                                                                                                                            |

Anclajes al llegar: `AyudaPage` tiene un `useEffect` sobre `[manual, location.hash]` que, si hay `hash`, busca `document.getElementById(decodeURIComponent(hash.slice(1)))`, hace `scrollIntoView()` y `focus()` (por el `tabIndex={-1}`); si no existe el `id`, no hace nada. Esto cubre los tres casos: entrar por URL con `#`, pulsar un `#ancla` del índice o del texto, y seguir un enlace entre manuales con `#`.

### 27.5 Dónde va el enlace

- **Menú lateral** (`MenuLateral.tsx`): un `NavLink` «Ayuda» con ícono `CircleHelp` de lucide, con la clase `claseItem`, colocado **justo encima del enlace al perfil** (el `mt-auto` pasa al bloque que agrupa Ayuda + Perfil para que ambos queden al pie). Sin `end`, de modo que `/ayuda/tecnico` también lo marca activo.
- **Panel «Más»** (`PanelMenuMovil.tsx`): un `NavLink` «Ayuda» con el mismo ícono y `claseItem` (`min-h-11`), **después de los tres grupos y antes del botón «Cerrar sesión»**; cierra el panel con `onClick={alElegir}` como el resto.
- **No** se agrega a `MENU` (`menu.ts`): no pertenece a ningún grupo y `principales` lo pintaría bajo «Avisos»; se declara explícito en los dos componentes, como ya ocurre con Perfil.
- **No** va en el `Pie`: el pie también se pinta en `/ingresar` sin sesión y `/ayuda` exige sesión (va dentro de `Layout`). Términos y privacidad siguen siendo los únicos enlaces del pie.
- Sin permiso nuevo ni `RequierePermiso`: todo rol con sesión entra.

### 27.6 Tests (vitest + Testing Library, `ConSesion` + `MemoryRouter` con `initialEntries`)

- `slug.test.ts`: los cuatro ejemplos de §27.4; `Menciones` → `menciones`; texto con `code` → sin acentos graves; duplicados `-1`, `-2`.
- `enlaces.test.ts`: cada fila de la tabla de §27.4 con al menos un caso; `usuario/00-primeros-pasos.md#avisos` → `/ayuda/primeros-pasos#avisos`.
- `manuales.test.ts`: `manualesDe('lectura')` = `['primeros-pasos']`; `tecnico` = 2; `coordinacion` = 3; `admin` = 4 en el orden fijo; `titulo` de cada uno coincide con la primera línea `# ` de su `texto`; **todo enlace `.md` escrito en los cuatro manuales apunta a un `archivo` del registro y todo `#ancla` escrito (propio o de otro manual) existe como `slug` de algún encabezado del manual destino** (esto convierte los enlaces rotos entre manuales en un fallo de test, hoy y cuando se editen los manuales en F6-T19).
- `AyudaPage.test.tsx`: (a) `/ayuda` redirige a `/ayuda/primeros-pasos` y el `h1` es «Ayuda»; (b) `lectura` no ve la fila de pestañas; `admin` ve 4 pestañas con `aria-current="page"` en la actual; (c) `/ayuda/no-existe` muestra `PaginaNoEncontrada`; (d) `tecnico` en `/ayuda/coordinacion` ve el manual y solo 2 pestañas; (e) la tabla de «Avisos» de primeros pasos se renderiza como `table` con `columnheader` «Aviso» y «Cuándo llega»; (f) un `.md` de prueba con `<script>alert(1)</script>` y `<img onerror>` (se pasa a `MarkdownManual` directamente) no produce ningún `script` ni `img` en el DOM; (g) el enlace «Registrar horas» de `01-tecnico.md` es un `link` con `href="/ayuda/tecnico#registrar-horas"` y el encabezado tiene `id="registrar-horas"`; (h) con `initialEntries={['/ayuda/tecnico#registrar-horas']}` el encabezado recibe el foco (`document.activeElement`); `scrollIntoView` se stubbea en jsdom.
- `MenuLateral.test.tsx` y `BarraInferior.test.tsx`: cada rol (incluido `lectura`) ve el enlace «Ayuda» con `href="/ayuda"`; en el panel «Más» pulsarlo cierra el panel. Los tests existentes siguen verdes sin tocar aserciones.
- Sin tests de API (no hay API en este bloque).

### 27.7 Responsive y accesibilidad (ADR 0011 / 0019)

- 390 px: pestañas con scroll horizontal (`overflow-x-auto`, sin salto de línea), índice en `<details>`, tablas con scroll horizontal propio, objetivos ≥ 44 px en el panel «Más». 1440 px: dos columnas con índice `sticky`.
- Un solo `h1` por página («Ayuda»); el `# ` del manual es `h2` y el resto baja un nivel (ya lo hace `Markdown.tsx`); el índice y las pestañas son `nav`/`aside` con `aria-label`; al llegar por ancla el encabezado enfocado conserva el anillo de foco del tema (no se le pone `outline-none`).
- Contraste y estados como el resto de la app (tokens existentes; sin colores nuevos). Verificación manual en el navegador con `crojas` (coordinación), `sdiaz` (técnico) y un admin a 1440 y 390 px: pestañas correctas por rol, el camino «Primeros pasos → manual de coordinación → Por aprobar en Mi día» aterriza en el encabezado, tabla legible en celular.

### 27.8 Tarea

| Tarea                             | Bloque | Crea/edita                                                                                                                                                                                                                                                                                                                                                                                                                 | Criterio de aceptación                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F6-T20 Ayuda dentro de la app** | 6I     | `features/ayuda/{manuales,slug,enlaces}.ts` y sus tests, `features/ayuda/MarkdownManual.tsx`, `features/ayuda/pages/AyudaPage.tsx` + test, `app/router.tsx` (dos rutas), `app/layout/{MenuLateral,PanelMenuMovil}.tsx` y sus tests, `features/legal/Markdown.tsx` (solo `export` de `COMPONENTES`), `apps/web/package.json` + `package-lock.json` (`remark-gfm`), `docs/CHANGELOG.md` (Añadido + pendiente Fase 9 del Dockerfile de `web`) | §27.1–§27.7 completos; tests de §27.6 verdes; `npm run typecheck`, `lint`, `format:check` y `npm run build -w @zydesk/web` verdes (el build incluye el texto de los cuatro manuales: `grep -l "Primeros pasos" apps/web/dist/assets/*.js` no vacío); verificación manual de §27.7; commit convencional en español. Archivos exclusivos de `apps/web`: no comparte ninguno con 6C (`apps/api`) ni 6G (`apps/bot`); puede ejecutarse en paralelo con ellos y antes de F6-T18, que lo revisa junto al resto del diff. |

**Qué registrar en ADR 0027 al cerrar** (se suma a §26): ADR 0012 precisada: los manuales llegan al cliente **compilados en el bundle** con `?raw` (no «servidos como estáticos por `web`» en tiempo de ejecución), una página `/ayuda/:manual` con pestañas por rol e índice, `remark-gfm` como única dependencia nueva, sin HTML crudo, sin manual propio de Solo lectura, capturas en la Fase 8. ADR 0019 precisada: el panel «Más» gana la entrada «Ayuda» antes de «Cerrar sesión».
