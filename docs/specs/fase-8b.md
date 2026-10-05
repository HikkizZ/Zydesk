# Fase 8b — Tarifas en UF e indicador diario · Contrato de implementación

> Para el programador (Sonnet): este documento fija **todas** las decisiones de la fase. Si algo no está aquí ni en las ADRs referenciadas, **detente y pregunta**; no inventes. Fuentes: decisión del usuario del 2026-10-05 («antes de la v1.0.0 las tarifas pueden estar en CLP o UF —solo esas dos, UTM no— y el valor de la UF se obtiene automáticamente»); `docs/PLAN.md` §1 (revisión de seguridad al cierre) y §4 (la Fase 9 carga tarifas reales); ADR **0007** (montos, `numeric(14,2)`, redondeo por línea 0 decimales CLP / 2 UF, `valor_uf` «ingresado a mano… la app no consulta el valor de la UF»: **esta fase lo sustituye**), **0008** (pg-boss, cron en America/Santiago), 0010, 0013, **0015**, **0017** (logs solo con ids; `config_cambiada` sin montos), **0018.8** (Boostr para validar feriados: «no es una dependencia en tiempo de ejecución»; aquí sí lo es, con respaldo), **0020** (CI sin secretos; repo público), 0024, **0025** (14 `enClp` y `OtResumen.neto`; 16 importar horas y plantillas con precio de tarifa; 17 tarifas en `configuracion`; **24** cotización en UF → 400 `VALIDACION { moneda }`, **que desaparece**; 28 «en UF, Agregar línea deja el precio en 0»), **0026.10** (importar horas registradas con tarifa extendida), **0027.40** (canal Telegram con `fetch`, timeout de 10 s: modelo de llamada saliente), **0028** (reportes de solo lectura; `cv.neto_clp` suma en CLP), **0029** (auditoría móvil bloqueante en CI; capturas por fase); `preguntas-abiertas.md` **B12** (tarifa del cliente, si no la global) y C («`[TARIFA]` sigue siendo configuración»); `CLAUDE.md` §2 (orden de bloqueo OT → cotización; tabla de registros: `config_cambiada { seccion: 'tarifas', campos }`, `cambio` por campo en cotizaciones; jobs en `core/jobs/`).
>
> Rama `feat/fase-8b-uf`, creada desde `feat/fase-8-movil`; cuando la Fase 8 se integre a `main`, la rama se rebasa sobre `main` y el PR final va a `main` con CI verde (ADR 0020) tras la revisión de seguridad de PLAN §1. Entorno: el de la Fase 8 (14 migraciones, 6 colas de pg-boss, bot opcional, `npm run test:movil`). Todo lo construido en las Fases 0–8 (`ruta()`, `actorRequerido`, `enTransaccion`, `registrarCambios`, `registrarAuditoria`, `bloquearOt` → `bloquearCotizacion`, `exigirEditable`, `escribirCotizacion`, `agregarLineas`, `tarifaDe`, `leerTarifas`, `guardarClave`, `reemplazarTarifas`, `calcularCotizacion`, `redondear`, `enClp`, `netoClpSql`, `generarXlsx`/`generarPdf`, el cliente de Telegram como modelo de `fetch`, `registrarJobVencimientos` como modelo de job, `hoyEnSantiago`, fábricas, `ingresarComo` directo, BD de test por bloque, `Seleccion`, `Campo`, `Monto`, `TarifasTab`, `DialogoTarifas`, `DatosCotizacion`, `DialogoImportarHoras`) **se reutiliza y se extiende**; no se reescribe. Convenciones de `CLAUDE.md`: `snake_case` en datos, SQL a mano en migraciones y consultas (`m.query` con `$n`, nunca interpolación), servicios como único punto de escritura, `logger` solo con ids y códigos, procesos de desarrollo detenidos con `taskkill /PID <pid> /T /F`.

## 0. Alcance

**Entra**: (a) **tarifas con moneda por concepto**: las cuatro tarifas globales de `configuracion.tarifas` (`hora_normal`, `hora_extendida`, `hora_urgencia`, `traslado_km`) y las tarifas por cliente (`tarifa_cliente`) pasan de un monto en pesos a `{ moneda: 'CLP' | 'UF', valor }`; `costo_interno` sigue en CLP (§14.1); (b) **indicador diario de la UF**: tabla `indicador_uf`, cliente HTTP `integraciones/uf/` con fuente principal Boostr y respaldo mindicador.cl, job `indicadores.uf` en pg-boss (America/Santiago), módulo de solo lectura `modulos/indicadores/` con `GET /api/indicadores/uf` (valor, fecha, fuente y si está desactualizado), variable `UF_ACTUALIZAR` para apagar las llamadas salientes (CI); (c) **snapshot de la UF en la cotización**: al crear la v1 y al duplicar como vN se precarga el valor vigente con `valor_uf_fecha` y `valor_uf_fuente`; editable a mano (`fuente = 'manual'`); se guarda en `cotizacion` para que una cotización enviada no cambie de monto; el campo existe tanto en CLP como en UF; (d) **conversión automática tarifa ↔ cotización** con el valor guardado en la cotización, en `shared` (`convertirTarifa`, única implementación, junto a `calcularCotizacion`): importar horas (estimadas, reales y registradas) y aplicar plantillas funcionan en ambas monedas; desaparece el 400 `VALIDACION { moneda }` de ADR 0025.24; sin `valor_uf` y con una tarifa en la otra moneda → 400 `VALIDACION { valor_uf }`; (e) **documentos**: `.xlsx` y PDF muestran «Valor UF del <fecha> (<fuente>)» con dos decimales; (f) **web**: pestaña Tarifas y «Editar tarifas» del cliente con selector CLP/UF por concepto, cotizador con el campo «Valor UF» siempre visible, su procedencia, el botón «Usar UF del día» y el aviso de UF desactualizada; «Importar horas» muestra el precio convertido; (g) semillas (`indicador_uf` de hoy con fuente `semilla`; tarifa en UF para Transportes Austral), fábricas, manuales, capturas de las pantallas que cambian, CHANGELOG, `openapi.json`, `.env.example`, `CLAUDE.md`, ADR 0030; revisión de seguridad de cierre (PLAN §1) con foco en las llamadas salientes.

**No entra**: UTM, dólar u otra moneda (decisión del usuario: solo CLP y UF); conversión de cotizaciones ya enviadas o aprobadas (inmutables, ADR 0025.12); reconversión de las líneas existentes al cambiar la moneda de un borrador (§14.4); `costo_interno` en UF (§14.1); registro manual de la UF desde Configuración cuando ambas fuentes fallan (§15.7; el campo editable de la cotización cubre el caso); historial de la UF en pantalla o reportes del tipo de cambio; precios de plantilla con moneda propia (§14.3: son CLP); cambiar la escala de `precio_unitario` (§14.2); avisos (`aviso`) cuando la UF no se actualiza (queda en el log y en la interfaz); llamadas a Boostr o mindicador desde el navegador, desde los tests o desde CI; cambios en la auditoría móvil (`movil.spec.ts` no gana casos: §8.6).

## 1. Bloques y paralelismo

| Bloque                                | Contenido                                                                                                                                                                                                                        | Depende de                                            | Archivos que toca (exclusivos)                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **8bA** Contratos y BD                | `shared` (enum `FUENTES_UF`, `TarifaMonto`, esquemas de tarifas, cotización e indicador, `convertirTarifa`, `formatearValorUf`), migración 15, entidades, fábricas                                                               | —                                                     | `packages/shared/src/**`, `apps/api/src/database/migraciones/**`, `apps/api/src/database/entidades.ts`, `apps/api/src/modulos/clientes/tarifa-cliente.entity.ts`, `apps/api/src/modulos/cotizaciones/cotizacion.entity.ts`, `apps/api/src/modulos/indicadores/indicador-uf.entity.ts`, `apps/api/test/fabricas.ts`, `apps/api/src/database/fabricas-fase8b.test.ts` |
| **8bB** Indicador UF                  | `integraciones/uf/**` (cliente `fetch` con dobles), `core/jobs/uf.ts`, `boss.ts`, `modulos/indicadores/**` (servicio, ruta, tests), `app.ts`, `config/env.ts` (`UF_ACTUALIZAR`), `.env.example`, `ci.yml`                        | 8bA                                                   | `apps/api/src/integraciones/uf/**`, `apps/api/src/core/jobs/uf.ts`, `apps/api/src/core/jobs/uf.test.ts`, `apps/api/src/core/jobs/boss.ts`, `apps/api/src/core/jobs/boss.test.ts`, `apps/api/src/modulos/indicadores/**` (salvo la entidad), `apps/api/src/app.ts`, `apps/api/src/config/env.ts`, `.env.example`, `.github/workflows/ci.yml`                         |
| **8bC** Tarifas API                   | `configuracion.service.ts` (`leerTarifas` con la forma nueva y compatibilidad con la antigua), `tarifas.test.ts`, `clientes.service.ts` (`reemplazarTarifas` con `moneda`), `clientes.test.ts`                                   | 8bA                                                   | `apps/api/src/modulos/configuracion/configuracion.service.ts`, `apps/api/src/modulos/configuracion/tarifas.test.ts`, `apps/api/src/modulos/clientes/**` (salvo la entidad)                                                                                                                                                                                          |
| **8bD** Cotizaciones API y documentos | `cotizaciones.service.ts` (snapshot al crear y duplicar, procedencia en `PUT`, conversión en importar y plantilla), `cotizaciones.consulta.ts` (campos nuevos), tests, `cotizacion.xlsx.ts`, `cotizacion.pdf.ts`                 | 8bA, 8bB (`leerUfVigente`), 8bC (`leerTarifas`)       | `apps/api/src/modulos/cotizaciones/**` (salvo la entidad), `apps/api/src/integraciones/xlsx/cotizacion.xlsx.ts`, `apps/api/src/integraciones/xlsx/cotizacion.xlsx.test.ts`, `apps/api/src/integraciones/pdf/cotizacion.pdf.ts`, `apps/api/src/integraciones/pdf/cotizacion.pdf.test.ts`                                                                             |
| **8bE** Web                           | `features/configuracion/{TarifasTab,api}`, `features/clientes/**` (ficha y `DialogoTarifas`), `features/cotizador/**` (`DatosCotizacion`, `TotalesCotizacion`, `DialogoImportarHoras`, `TablaLineas`, `CotizadorPage`, `api.ts`) | 8bA (contratos); 8bB–8bD para la integración completa | `apps/web/src/features/configuracion/**`, `apps/web/src/features/clientes/**`, `apps/web/src/features/cotizador/**`                                                                                                                                                                                                                                                 |
| **8bF** Semillas y docs               | `desarrollo.ts` (`indicador_uf`, tarifa UF), `desarrollo.test.ts`, capturas, manuales, `docs/api/README.md`, CHANGELOG, `openapi.json`, `CLAUDE.md`, ADR 0030                                                                    | todo                                                  | `apps/api/src/database/semillas/**`, `docs/**`, `CLAUDE.md`, `README.md`                                                                                                                                                                                                                                                                                            |

**En paralelo sin conflicto**: 8bB y 8bC tras 8bA; 8bE puede empezar los componentes puros contra los esquemas de 8bA; 8bD espera a 8bB y 8bC (importa `leerUfVigente` y la forma nueva de `leerTarifas`). 8bF al final. Orden general en §12.

### 1.1 Base de test por bloque (obligatorio con agentes en paralelo)

Igual que en las Fases 2–7: `npm run db:test:crear -- <sufijo>` y `npx cross-env TEST_BD_SUFIJO=<sufijo> npm run test -w @zydesk/api`. Sufijos: 8bA usa `zydesk_test` (sin variable); 8bB `8bb`; 8bC `8bc`; 8bD `8bd`; 8bF `8bf`. 8bE no usa BD. CI sigue con `zydesk_test`.

### 1.2 Orden de bloqueo de filas (obligatorio)

No cambia: crear, duplicar, editar, importar horas y aplicar plantilla bloquean **OT → cotización** (`bloquearCotizacion`); enviar bloquea ticket → OT → cotización. La lectura de `indicador_uf` (`leerUfVigente(tx)`) es un `SELECT` sin `FOR UPDATE` dentro de la misma transacción, **después** de bloquear la OT; `tarifa_cliente` y `configuracion` se leen como hoy. El job `indicadores.uf` escribe solo en `indicador_uf` (`INSERT … ON CONFLICT DO NOTHING`, transacción propia) y no toca ticket, OT ni cotización. Guardar tarifas (globales o del cliente) no bloquea ninguna cotización: las cotizaciones guardan precios y totales materializados (ADR 0025.14), así que cambiar una tarifa o el valor de la UF nunca altera una cotización existente.

## 2. Versiones nuevas

Ninguna. `fetch` y `AbortSignal.timeout` son nativos de Node 22 (ya los usa `integraciones/telegram/cliente.ts`); Zod, pg-boss, exceljs y pdfmake ya están. Sin componentes shadcn nuevos (`Seleccion`, `Input`, `Button`, `Campo` existentes). Si al implementar hace falta otro paquete, **detente y pregunta**.

## 3. Base de datos y contratos (bloque 8bA)

### 3.1 Migración `1791000000015-uf` (clase `Uf1791000000015`; SQL a mano; `down` inverso)

```sql
-- 1. Indicador diario de la UF (una fila por fecha; nunca se actualiza una fila existente)
CREATE TABLE indicador_uf (
  fecha date PRIMARY KEY,
  valor numeric(12,2) NOT NULL CHECK (valor > 0),
  fuente text NOT NULL CHECK (fuente IN ('boostr','mindicador','semilla')),
  obtenido_en timestamptz NOT NULL DEFAULT now()
);

-- 2. Tarifas por cliente con moneda (las filas existentes son pesos)
ALTER TABLE tarifa_cliente ADD COLUMN moneda text NOT NULL DEFAULT 'CLP' CHECK (moneda IN ('CLP','UF'));

-- 3. Procedencia del valor UF guardado en la cotización
ALTER TABLE cotizacion
  ADD COLUMN valor_uf_fecha date NULL,
  ADD COLUMN valor_uf_fuente text NULL CHECK (valor_uf_fuente IN ('boostr','mindicador','semilla','manual'));
UPDATE cotizacion SET valor_uf_fuente = 'manual' WHERE valor_uf IS NOT NULL;
ALTER TABLE cotizacion
  ADD CONSTRAINT cotizacion_valor_uf_fuente_chk CHECK ((valor_uf IS NULL) = (valor_uf_fuente IS NULL)),
  ADD CONSTRAINT cotizacion_valor_uf_fecha_chk CHECK (valor_uf_fuente IS DISTINCT FROM 'manual' OR valor_uf_fecha IS NULL);

-- 4. Tarifas globales: cada concepto numérico pasa a { moneda: 'CLP', valor }; costo_interno y el resto no cambian
UPDATE configuracion SET valor = (
  SELECT jsonb_object_agg(e.k,
           CASE WHEN e.k IN ('hora_normal','hora_extendida','hora_urgencia','traslado_km') AND jsonb_typeof(e.v) = 'number'
                THEN jsonb_build_object('moneda', 'CLP', 'valor', e.v) ELSE e.v END)
    FROM jsonb_each(valor) AS e(k, v))
 WHERE clave = 'tarifas';
```

Se mantienen el `CHECK (moneda <> 'UF' OR valor_uf IS NOT NULL)` y `CHECK (valor_uf > 0)` de la migración 11: una cotización en UF sigue exigiendo `valor_uf`; una en CLP puede tenerlo (y desde esta fase normalmente lo tiene, §5.2). `down`: deshace el punto 4 (`jsonb_build_object` → `e.v->'valor'` para los cuatro conceptos cuando `jsonb_typeof(e.v) = 'object'`), `DROP CONSTRAINT` de los dos `CHECK`, `DROP COLUMN valor_uf_fecha, valor_uf_fuente`, `DROP COLUMN moneda` de `tarifa_cliente`, `DROP TABLE indicador_uf`. `zydesk_app` recibe CRUD sobre `indicador_uf` por los `ALTER DEFAULT PRIVILEGES` de `01-roles.sql` (nada que agregar). `evento` y `auditoria` no cambian; `AccionAuditoria` no gana acciones. `entidades.ts` registra `IndicadorUf`; `TarifaCliente` gana `moneda` (`type: 'text'`), `Cotizacion` gana `valor_uf_fecha` (`type: 'date'`, `string | null`) y `valor_uf_fuente` (`type: 'text'`, `FuenteUf | null`).

### 3.2 `packages/shared`

```ts
// enums/tarifa.ts (se agrega)
export const FUENTES_UF = ['boostr', 'mindicador', 'semilla', 'manual'] as const;
export type FuenteUf = (typeof FUENTES_UF)[number];
export const ETIQUETA_FUENTE_UF: Record<FuenteUf, string> = {
  boostr: 'Boostr', mindicador: 'mindicador.cl', semilla: 'Semilla de desarrollo', manual: 'Ingresado a mano',
};
// CONCEPTOS_TARIFA, CONCEPTOS_TARIFA_GLOBAL y ETIQUETA_CONCEPTO_TARIFA no cambian.

// esquemas/comunes.ts o esquemas/configuracion.ts (compartido por tarifas globales y por cliente)
const TarifaMontoBase = z.object({ moneda: z.enum(MONEDAS), valor: z.number().min(0).max(999_999_999).multipleOf(0.01) });
// Las mismas reglas para la tarifa global y la del cliente (que agrega `concepto`): se aplican sobre el objeto ya extendido,
// para no depender de si `.extend` conserva los `.refine` del objeto base (ADR 0023.19: cuidado con `.partial()`/`.extend()` en Zod 4).
export const conReglasDeTarifa = <T extends z.ZodObject<{ moneda: z.ZodEnum<…>; valor: z.ZodNumber }>>(s: T) =>
  s.refine((t) => t.moneda !== 'CLP' || Number.isInteger(t.valor), { path: ['valor'], message: 'En pesos, sin decimales' })
   .refine((t) => t.moneda !== 'UF' || t.valor <= 99_999, { path: ['valor'], message: 'Máximo 99.999 UF' });
export const TarifaMonto = conReglasDeTarifa(TarifaMontoBase);
export type TarifaMontoDatos = z.infer<typeof TarifaMonto>;

// esquemas/configuracion.ts (cambia)
export const TarifasEntrada = z.object({
  hora_normal: TarifaMonto.nullable(),
  hora_extendida: TarifaMonto.nullable(),
  hora_urgencia: TarifaMonto.nullable(),
  traslado_km: TarifaMonto.nullable(),
  costo_interno: montoClp.nullable(),            // sigue en pesos enteros (§14.1)
  iva_pct, validez_dias_defecto, condiciones_defecto,   // sin cambios
});
export const TarifasSalida = TarifasEntrada;

// esquemas/cliente.ts (cambia)
export const TarifaClienteSalida = z.object({ concepto: z.enum(CONCEPTOS_TARIFA), moneda: z.enum(MONEDAS), valor: z.number() });
export const TarifaClienteEntrada = z
  .array(conReglasDeTarifa(TarifaMontoBase.extend({ concepto: z.enum(CONCEPTOS_TARIFA) })))
  .refine((t) => new Set(t.map((x) => x.concepto)).size === t.length, { message: 'Los conceptos no pueden repetirse' });

// esquemas/cotizacion.ts (cambia)
// CotizacionEntrada no cambia: `valor_uf` nullable con el refine «UF exige valor_uf». En CLP puede ir y se guarda (§5.3).
export const CotizacionSalida = CotizacionBreve.extend({
  …,
  valor_uf: z.number().nullable(),
  valor_uf_fecha: fechaIso.nullable(),           // fecha del indicador; null si es manual o no hay valor
  valor_uf_fuente: z.enum(FUENTES_UF).nullable(), // null solo si valor_uf es null
  …,
});

// esquemas/indicadores.ts (nuevo; se exporta desde esquemas/index.ts)
export const IndicadorUfSalida = z.object({
  fecha: fechaIso,                               // fecha a la que corresponde el valor
  valor: z.number(),
  fuente: z.enum(['boostr', 'mindicador', 'semilla']),
  obtenido_en: instante,
  hoy: fechaIso,                                 // hoy en America/Santiago, para que el front no calcule la zona
  desactualizado: z.boolean(),                   // fecha < hoy
});
export type IndicadorUfSalidaDatos = z.infer<typeof IndicadorUfSalida>;

// cotizacion/calcular.ts (se agrega; única implementación de la conversión, ADR 0007)
export interface TarifaConMoneda { moneda: Moneda; valor: number }
// Precio unitario de una tarifa expresado en la moneda de la cotización, redondeado como un monto de esa moneda
// (0 decimales en CLP, 2 en UF, half-up con EPSILON): misma moneda → valor; UF → CLP: redondear(valor × valor_uf, 'CLP');
// CLP → UF: redondear(valor / valor_uf, 'UF'). Si hace falta convertir y valor_uf es null → null.
export function convertirTarifa(t: TarifaConMoneda, destino: Moneda, valor_uf: number | null): number | null

// formato/moneda.ts (se agrega)
export function formatearValorUf(n: number): string   // '$41.098,15' (es-CL, moneda CLP, siempre 2 decimales)
```

`enClp`, `redondear`, `calcularCotizacion`, `totalLinea` y `venceEl` **no cambian**. Códigos nuevos en `shared/errores.ts`: ninguno (`VALIDACION`, `TARIFA_FALTANTE`, `COTIZACION_NO_EDITABLE`, `OT_CERRADA`, `NO_AUTENTICADO`, `SIN_PERMISO` se reutilizan). `permisos.ts` no cambia (`GET /api/indicadores/uf` es de `sesion`; `PUT` de tarifas sigue con `config.editar`). `shared/eventos.ts` no cambia: la UF no publica eventos de dominio.

Tests `calcular.test.ts` (**tabla**, `it.each`, con `valor_uf = 41098.15`, el valor verificado el 2026-10-05):

| Caso                        | Tarifa                                                                     | Destino | Esperado            |
| --------------------------- | -------------------------------------------------------------------------- | ------- | ------------------- |
| Misma moneda CLP            | CLP 38 000                                                                 | CLP     | `38000`             |
| Misma moneda UF             | UF 0,80                                                                    | UF      | `0.8`               |
| UF → CLP (caso del usuario) | UF 0,80                                                                    | CLP     | `32879` (32 878,52) |
| UF → CLP                    | UF 1,00                                                                    | CLP     | `41098` (41 098,15) |
| CLP → UF                    | CLP 38 000                                                                 | UF      | `0.92` (0,9246…)    |
| CLP → UF                    | CLP 45 000                                                                 | UF      | `1.09` (1,0949…)    |
| CLP → UF, precio fijo       | CLP 90 000                                                                 | UF      | `2.19` (2,1899…)    |
| Sin valor UF, hace falta    | UF 0,80                                                                    | CLP     | `null`              |
| Sin valor UF, no hace falta | CLP 38 000                                                                 | CLP     | `38000`             |
| Cero                        | UF 0                                                                       | CLP     | `0`                 |
| Línea completa              | 3 h × UF 0,80 → CLP: `totalLinea` = `98637`; 3 h × CLP 38 000 → UF: `2.76` |
| `formatearValorUf`          | `41098.15` → `'$41.098,15'`; `41098` → `'$41.098,00'`                      |

Tests `esquemas.test.ts`: `TarifaMonto` acepta `{ CLP, 38000 }` y `{ UF, 0.8 }`; rechaza `{ CLP, 38000.5 }`, `{ UF, 0.123 }`, `{ UF, 100000 }`, `{ UTM, 1 }`, valores negativos; `TarifasEntrada` acepta `costo_interno: 18000` y rechaza `costo_interno: { moneda: 'CLP', valor: 18000 }` y `hora_normal: 38000` (número suelto: forma antigua); `TarifaClienteEntrada` rechaza conceptos repetidos y `costo_interno`; `CotizacionSalida` acepta `valor_uf_fuente: 'manual'` con `valor_uf_fecha: null`; `IndicadorUfSalida` rechaza `fuente: 'manual'`.

### 3.3 Fábricas (`test/fabricas.ts`)

- `crearIndicadorUf({ fecha?, valor?, fuente? })`: por defecto `fecha = hoyEnSantiago()`, `valor = 41098.15`, `fuente = 'semilla'`; `INSERT … ON CONFLICT (fecha) DO NOTHING` y devuelve la fila.
- `crearTarifaCliente(cliente_id, concepto, { moneda?, valor })` (nueva, sobre `tarifa_cliente`; por defecto `moneda = 'CLP'`).
- `guardarTarifasGlobales(parcial)` (nueva): `UPDATE configuracion` de la clave `tarifas` fusionando con la forma nueva (`{ hora_normal: { moneda: 'UF', valor: 0.8 } }`).
- `crearCotizacion` gana `valor_uf_fecha?` y `valor_uf_fuente?` (por defecto `valor_uf !== null ? 'manual' : null`, `fecha null`), y sigue calculando con `calcularCotizacion`.
- Test `fabricas-fase8b.test.ts`: `db:migrar` desde cero deja 15 migraciones, `indicador_uf` existe, `tarifa_cliente.moneda` por defecto `'CLP'`, una cotización con `valor_uf` y sin `valor_uf_fuente` viola el `CHECK`, `valor_uf_fuente = 'manual'` con `valor_uf_fecha` viola el `CHECK`, la clave `tarifas` sembrada por `sembrarBase` (§10.1) cumple `TarifasSalida`; `db:revertir` vuelve a 14 y deja `hora_normal` numérico.

## 4. Definiciones (valen para API, documentos y web)

1. **Tarifa**: `{ moneda, valor }` o `null` («`[TARIFA]` sin definir»). CLP en pesos enteros; UF con **dos decimales** (`numeric(14,2)`, como todo monto de ADR 0007). La tarifa del cliente tiene prioridad sobre la global para el mismo concepto (B12), **aunque estén en monedas distintas**: la moneda viaja con la tarifa elegida.
2. **Valor UF de la cotización** (`cotizacion.valor_uf`, `valor_uf_fecha`, `valor_uf_fuente`): snapshot en pesos con dos decimales. Nace del **indicador vigente** al crear la v1 y al duplicar (§5.2); la persona puede cambiarlo a mano (`fuente = 'manual'`, `fecha = null`) o volver al del día (§5.3). Es el **único** valor que usan la conversión de tarifas (§4.3), `enClp`, `neto_clp` y los documentos de esa cotización. Guardar tarifas o recibir una UF nueva **nunca** cambia una cotización.
3. **Conversión** (`convertirTarifa`, §3.2): se convierte el **precio unitario** antes de crear la línea, redondeado como monto de la moneda destino; después la línea se calcula como siempre (`totalLinea`, `calcularCotizacion`). Ejemplos con UF 41 098,15: tarifa UF 0,80 en una cotización CLP → `$32.879/h` (3 h = `$98.637`); tarifa CLP 38 000 en una cotización UF → `UF 0,92/h` (3 h = `UF 2,76`); tarifa CLP 45 000 → `UF 1,09`; precio fijo de plantilla CLP 90 000 → `UF 2,19` (con 10 % de descuento la línea da `UF 1,97`). Si la tarifa está en la moneda de la cotización no hay redondeo adicional. Si hay que convertir y `valor_uf` es `null` → 400 `VALIDACION { valor_uf: ['Indica el valor de la UF para convertir la tarifa de <etiqueta del concepto> (<moneda>)'] }`; el borrador no se toca.
4. **Indicador vigente** = la fila de `indicador_uf` de **mayor `fecha`** (puede ser de días atrás). **Desactualizado** = `fecha < hoy` en America/Santiago. Sin filas → `null`: la interfaz pide escribir el valor a mano y `convertirTarifa` responde `null`.
5. **Plausibilidad de una respuesta externa**: `valor` numérico finito, entre **20 000 y 200 000** pesos, con a lo sumo 2 decimales (se redondea con `redondear(v, 'UF')` antes de comparar y guardar); `fecha` entre `hoy − 7` y `hoy` (ambos incluidos; una fecha futura o de más de una semana es «fuente desactualizada» y se descarta). Cuerpo de a lo sumo **64 KB**, `Content-Type` que contenga `json`, status **200** exacto; redirecciones no se siguen (`redirect: 'error'`); timeout **10 s** (`AbortSignal.timeout`). La petición es un `GET` sin cuerpo, sin cookies, sin cabeceras con datos de la instalación (solo `Accept: application/json`), a una **URL fija** (constante del código; SSRF no aplica).
6. **Redondeos**: `valor_uf` a 2 decimales; precios convertidos según §4.3; totales como ADR 0007; `neto_clp` = `round(neto × valor_uf)` en SQL (sin cambios, ADR 0025.14). `neto_clp` de una cotización CLP es su `neto` aunque tenga `valor_uf` guardado.
7. **Procedencia al editar** (`PUT`): si `valor_uf` del cuerpo es igual al guardado, `fecha` y `fuente` no cambian; si cambia y es exactamente el `valor` de la fila **vigente** de `indicador_uf` (`leerUfVigente`, §4.4), se toman su `fecha` y `fuente` (así «Usar UF del día» en la web queda registrado como `boostr`/`mindicador`/`semilla` sin confiar en el cliente); cualquier otro valor, aunque coincida con una fila antigua → `fuente = 'manual'`, `fecha = null`; `valor_uf: null` (solo posible en CLP) → ambos `null`. _(Corregido al cerrar, ADR 0030.19: la versión original comparaba con cualquier fila histórica —`WHERE valor = $1 ORDER BY fecha DESC LIMIT 1`— y un valor antiguo escrito a mano heredaba una procedencia que la persona no eligió.)_

## 5. API (bloques 8bB, 8bC y 8bD)

### 5.1 Endpoints

| Método y ruta                                  | Permiso          | Entrada                   | Salida                         | Cambio                                                                                                     |
| ---------------------------------------------- | ---------------- | ------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/indicadores/uf`                      | `sesion`         | —                         | `IndicadorUfSalida.nullable()` | **Nueva** (etiqueta `Indicadores`). `null` sin filas. Sin `auditoria` ni `evento`                          |
| `GET /api/config/tarifas`                      | `sesion`         | —                         | `TarifasSalida`                | Forma nueva (§3.2)                                                                                         |
| `PUT /api/config/tarifas`                      | `config.editar`  | `TarifasEntrada`          | `TarifasSalida`                | Forma nueva; `auditoria` como hoy (§6)                                                                     |
| `PUT /api/clientes/:id/tarifas`                | `config.editar`  | `TarifaClienteEntrada`    | `TarifaClienteSalida[]`        | `moneda` por concepto; `GET /api/clientes/:id` devuelve `tarifas[].moneda`                                 |
| `POST /api/ots/:id/cotizaciones`               | `tickets.editar` | —                         | `CotizacionSalida` 201         | Precarga `valor_uf`, `valor_uf_fecha`, `valor_uf_fuente` del indicador vigente (`null` los tres si no hay) |
| `POST /api/cotizaciones/:id/duplicar`          | `tickets.editar` | —                         | `CotizacionSalida` 201         | La vN toma el indicador vigente; sin indicador copia los tres campos de la original                        |
| `PUT /api/cotizaciones/:id`                    | `tickets.editar` | `CotizacionEntrada`       | `CotizacionSalida`             | Guarda `valor_uf` también en CLP; procedencia por §4.7                                                     |
| `POST /api/cotizaciones/:id/importar-horas`    | `tickets.editar` | `ImportarHorasEntrada`    | `CotizacionSalida`             | Convierte con §4.3; ya no responde `VALIDACION { moneda }`                                                 |
| `POST /api/cotizaciones/:id/aplicar-plantilla` | `tickets.editar` | `AplicarPlantillaEntrada` | `CotizacionSalida`             | Convierte tarifas **y precios fijos de la plantilla (CLP)** con §4.3                                       |
| `GET /api/cotizaciones/:id/descargar.xlsx      | pdf`             | `sesion`                  | —                              | attachment                                                                                                 | Leyenda «Valor UF del …» (§5.6) |

`indicadores.routes.ts` declara la ruta con `ruta()`; `app.ts` monta `crearRutasIndicadores()` tras `crearRutasReportes()`. `npm run api:openapi` y versionar `docs/api/openapi.json`.

### 5.2 Cotizaciones (`cotizaciones.service.ts`, bloque 8bD)

- **`crearCotizacion`**: tras `leerTarifas(tx)`, `const uf = await leerUfVigente(tx)`; el `INSERT` agrega `valor_uf, valor_uf_fecha, valor_uf_fuente` = `uf ? [uf.valor, uf.fecha, uf.fuente] : [null, null, null]`. `moneda` sigue naciendo `'CLP'`. El evento `cotizacion_creada` no cambia.
- **`duplicarCotizacion`**: el `INSERT … SELECT` toma `valor_uf`, `valor_uf_fecha`, `valor_uf_fuente` de `$4, $5, $6` (el indicador vigente) cuando existe; si `leerUfVigente` devuelve `null`, copia los de la original (`COALESCE($4, valor_uf)` no sirve porque los tres van juntos: se arma el SQL con una u otra lista de columnas, nunca concatenando valores). `fecha_emision = hoy`, `iva_pct` de la original, como hoy.
- **`escribirCotizacion`** (compartida por editar, importar y plantilla): `valor_uf = e.valor_uf` en ambas monedas (ya no `NULL` si CLP); `valor_uf_fecha`/`valor_uf_fuente` por §4.7 comparando con `leerUfVigente(tx)` solo cuando el valor cambia (sin consulta propia sobre `indicador_uf`; ADR 0030.19). `Rastreado` y `CAMPOS_RASTREADOS` no ganan campos: `valor_uf` sigue rastreado y su etiqueta pasa a `formatearValorUf` (`$41.098,15`; hoy `formatearCLP` pierde los decimales); `fecha` y `fuente` son metadatos del valor y no generan `evento` (§14.6).
- **`tarifaDe(tx, cliente_id, concepto)`** devuelve `TarifaConMoneda | null`: del cliente `SELECT moneda, valor::float8` si existe, si no `leerTarifas(tx)[concepto]` (ya es `{ moneda, valor } | null`). Nueva **`precioDeTarifa(tx, ot, cot, concepto)`**: `tarifaDe` → `null` → 409 `TARIFA_FALTANTE { concepto }` (como hoy); `convertirTarifa(t, cot.moneda, cot.valor_uf)` → `null` → 400 `VALIDACION { valor_uf }` (§4.3). **Se elimina `tarifaEnPesos`** y sus dos llamadas (ADR 0025.24).
- **`importarHoras`**: `tarifaHora = precioDeTarifa(…, 'hora_normal')` (ya convertido); `lineasDeHorasRegistradas` recibe además `cot` y usa `precioDeTarifa` para `hora_extendida` solo si hay horas fuera de horario (como hoy). El evento `cotizacion_lineas_agregadas` gana en `datos` `tarifa_moneda` (`'CLP' | 'UF'` de la tarifa usada) y, solo si hubo conversión, `valor_uf` (ADR 0017: `evento` sí lleva montos; `auditoria` no).
- **`aplicarPlantilla`**: líneas con `precio_unitario: null` → `precioDeTarifa` (`h → hora_normal`, `km → traslado_km`, `un`/`gl → 0`); líneas con precio fijo → `convertirTarifa({ moneda: 'CLP', valor: precio }, cot.moneda, cot.valor_uf)` (§14.3), con el mismo 400 si falta `valor_uf` y la cotización está en UF. Mismo `datos` que importar.
- **`enviarCotizacion`**, **`eliminarCotizacion`**, **`cotizaciones.estados.ts`**: sin cambios. `cargarCotizacion` y `rastreado` leen los dos campos nuevos; `CotizacionBreve`, `CotizacionResumen`, `cotizacionVigente` y `netoVigenteClp` no cambian.
- Logs: ninguno nuevo; nada de montos.

### 5.3 Tarifas (bloque 8bC)

- `leerTarifas(m)`: `TarifasSalida.parse(valor)` con la forma nueva. **Compatibilidad**: si un concepto llega como número (base migrada a mano o clave guardada por una versión anterior), se envuelve como `{ moneda: 'CLP', valor }` antes de validar (una función `normalizarTarifas(valor: unknown)` con test); la migración ya convierte, así que es solo una red. `TARIFAS_DEFECTO` con los cuatro conceptos en `null` (sin cambio de forma).
- `guardarTarifas(actor, e)`: `campos` = claves cuyo valor cambió comparando con `JSON.stringify` por concepto (cambiar solo la moneda cuenta como cambio del concepto); `auditoria` `config_cambiada { seccion: 'tarifas', campos }` **sin montos ni monedas** (ADR 0017; test: `JSON.stringify(detalle)` no contiene `'UF'` ni `'38000'`).
- `reemplazarTarifas(clienteId, tarifas)`: `INSERT INTO tarifa_cliente (cliente_id, concepto, moneda, valor)`; `obtenerCliente` devuelve `moneda` en `tarifas[]`. Sigue sin `evento` ni `auditoria` (tabla de `CLAUDE.md`).
- `ots.consulta.ts` (`costo_interno`) **no cambia**: `tarifas.costo_interno` sigue siendo un número.

### 5.4 Indicador UF (`modulos/indicadores/`, bloque 8bB; módulo de solo lectura hacia afuera)

- `indicadores.service.ts`: `leerUfVigente(m = dataSource.manager): Promise<{ fecha: string; valor: number; fuente: FuenteIndicador; obtenido_en: Date } | null>` (`SELECT fecha::text, valor::float8, fuente, obtenido_en FROM indicador_uf ORDER BY fecha DESC LIMIT 1`); `obtenerUf(): Promise<IndicadorUfSalidaDatos | null>` agrega `hoy = hoyEnSantiago()` y `desactualizado = fecha < hoy`; `registrarUf(m, { fecha, valor, fuente }): Promise<boolean>` (`INSERT … ON CONFLICT (fecha) DO NOTHING RETURNING fecha`; `true` si insertó). **Solo el job y las semillas escriben** `indicador_uf` (el job por `registrarUf`; las semillas con SQL directo, como el resto de `desarrollo-*.ts`). No hay ruta de escritura.
- Ruta `GET /api/indicadores/uf` → `obtenerUf()`. Sin `auditoria`, sin `evento`, sin log por petición (el de fin de petición de pino basta).

### 5.5 Cliente de las fuentes (`integraciones/uf/cliente.ts`, bloque 8bB)

```ts
export const URL_BOOSTR = 'https://api.boostr.cl/economy/indicator/uf.json';   // {"status":"success","data":{"date":"2026-10-05","value":41098.15}}
export const URL_MINDICADOR = 'https://mindicador.cl/api/uf';                   // { "serie": [ { "fecha": "2026-10-05T…Z", "valor": 41098.15 }, … ] }
export type FuenteExterna = 'boostr' | 'mindicador';
export type MotivoFallo = 'red' | 'timeout' | 'redireccion' | `http_${number}` | 'tipo' | 'tamano' | 'json' | 'formato' | 'rango' | 'fecha' | 'estado';
export class ErrorFuenteUf extends Error { constructor(public fuente: FuenteExterna, public motivo: MotivoFallo) }
export type Fetch = typeof globalThis.fetch;
export interface UfObtenida { fecha: string; valor: number; fuente: FuenteExterna }
export async function consultarFuente(fuente: FuenteExterna, hoy: string, fetchImpl: Fetch): Promise<UfObtenida>
export async function obtenerUfDelDia(hoy: string, fetchImpl: Fetch): Promise<{ ok: true; uf: UfObtenida } | { ok: false; fallos: Record<FuenteExterna, MotivoFallo> }>
```

- `consultarFuente`: `fetchImpl(URL, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10_000) })`; el error de `fetch` se clasifica en `timeout` (`err.name === 'TimeoutError'`), `redireccion` (`redirect: 'error'`) o `red`, **sin copiar el mensaje original al error** (puede traer la URL; aquí no hay secreto, pero se mantiene el patrón de ADR 0027.40). `status !== 200` → `http_<status>`; `Content-Type` sin `json` → `tipo`; `Content-Length` > 65 536 o `texto.length > 65 536` → `tamano`; `JSON.parse` falla → `json`; Zod (`RespuestaBoostr = z.object({ status: z.literal('success'), data: z.object({ date: fechaIso, value: z.number().finite() }) })` — `status` distinto de `success` → `estado`; `RespuestaMindicador = z.object({ serie: z.array(z.object({ fecha: z.string(), valor: z.number().finite() })).min(1) })`, se toma `serie[0]`; cualquier otra forma → `formato`; claves extra se ignoran); `fecha` de mindicador se convierte a día de Santiago con `@date-fns/tz` (`TZDate`/`formatInTimeZone`, como el motor de horas hábiles), la de Boostr se usa tal cual; fuera de `[hoy − 7, hoy]` → `fecha`; `valor` fuera de `[20_000, 200_000]` → `rango`; `valor = redondear(valor, 'UF')`.
- `obtenerUfDelDia`: Boostr y, si falla, mindicador; devuelve el primer éxito o los dos motivos. **No** reintenta dentro de la misma ejecución (Boostr limita a 5 peticiones cada 10 s y bloquea por abuso; el job vuelve a correr en una hora).
- **Guarda de tests**: `if (env.NODE_ENV === 'test' && fetchImpl === globalThis.fetch) throw new Error('los tests no consultan fuentes externas')`. Todo test pasa un doble (`(url) => new Response(JSON.stringify(cuerpo), { status, headers })`); `uf.cliente.test.ts` afirma además que el doble recibió exactamente `URL_BOOSTR` / `URL_MINDICADOR`, método `GET`, sin `body`, sin `cookie` ni `authorization` y con `redirect: 'error'`.

### 5.6 Documentos (bloque 8bD)

- `.xlsx` (`cotizacion.xlsx.ts`): la celda `D6` pasa a «Valor UF del <fecha> (<fuente>): $41.098,15» con `formatearValorUf` y `ETIQUETA_FUENTE_UF`, donde `<fecha>` es `valor_uf_fecha` si existe y si no `fecha_emision`; se escribe **siempre que `valor_uf` no sea `null`** (también en CLP: documenta el tipo de cambio con que se convirtieron las tarifas). Formatos de columnas sin cambio (`#,##0` / `#,##0.00`); fórmulas sin cambio.
- PDF (`cotizacion.pdf.ts`): la línea «Equivale a $… al valor UF del <fecha>» (solo en UF, como hoy) usa `formatearValorUf` para el valor y la misma fecha/fuente: «Equivale a $473.040 al valor UF del 5 oct 2026 (Boostr): $41.098,15». En CLP no se agrega nada (el cliente no necesita saber el tipo de cambio de una cotización en pesos).
- Tests existentes de documentos ampliados: en UF aparece «Valor UF del» con dos decimales; en CLP con `valor_uf` aparece en la planilla y **no** en el PDF.

## 6. Eventos y auditoría generados en esta fase

| Acción                                                | `evento`                                                                                       | `auditoria`                                                              | evento de dominio |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------- |
| Guardar tarifas globales (`PUT /api/config/tarifas`)  | —                                                                                              | `config_cambiada { seccion: 'tarifas', campos }` (sin montos ni monedas) | —                 |
| Tarifas por cliente (`PUT /api/clientes/:id/tarifas`) | —                                                                                              | —                                                                        | —                 |
| Crear v1 / duplicar vN (precarga de la UF)            | `cotizacion_creada` (como hoy)                                                                 | —                                                                        | —                 |
| `PUT` de la cotización con `valor_uf` distinto        | `cambio` de `valor_uf` (etiqueta `$41.098,15`), como hoy; `fecha` y `fuente` no generan evento | —                                                                        | —                 |
| Importar horas / aplicar plantilla con conversión     | `cotizacion_lineas_agregadas` con `datos.tarifa_moneda` y, si convirtió, `datos.valor_uf`      | —                                                                        | —                 |
| Job `indicadores.uf`                                  | —                                                                                              | — (`indicador_uf` es el registro)                                        | —                 |
| `GET /api/indicadores/uf`                             | —                                                                                              | —                                                                        | —                 |

Cobertura (ADR 0003): `cotizaciones/eventos.test.ts` gana el caso de importar con conversión (`datos.valor_uf = 41098.15`, `datos.tarifa_moneda = 'UF'`) y el de `PUT` con `valor_uf` cambiado (un solo `cambio` de `valor_uf`, ninguno de `valor_uf_fecha`); `core/jobs/uf.test.ts` afirma que el job deja `count(*)` de `evento` y `auditoria` sin cambio. La tabla de `CLAUDE.md` §2 gana la fila «Job `indicadores.uf` (UF del día)» con `—` / `—` y la nota «`indicador_uf` es el registro», y la fila de tarifas pasa a decir «`config_cambiada { seccion: 'tarifas', campos }` (sin montos ni monedas)».

## 7. Job `indicadores.uf` (`core/jobs/uf.ts`, bloque 8bB)

| Job              | Cron (`America/Santiago`)         | Hace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `indicadores.uf` | `7 * * * *` (cada hora, minuto 7) | `ejecutarActualizacionUf(jobId?, deps = { fetch: globalThis.fetch })`: `hoy = hoyEnSantiago()`; si ya existe la fila de `hoy` → `{ estado: 'al_dia' }` sin llamadas salientes; si no, `obtenerUfDelDia(hoy, deps.fetch)`; con éxito `registrarUf(dataSource.manager, uf)` (puede ser de una fecha anterior a `hoy` si la fuente va atrasada; `ON CONFLICT DO NOTHING`) → `{ estado: 'actualizada' \| 'ya_existia', fuente, fecha }`; con fallo de ambas → `{ estado: 'sin_fuente', fallos }` **sin lanzar** (un reinicio no reintenta en ráfaga; la próxima hora vuelve a intentar). Un error de base de datos sí se propaga (pg-boss lo registra). |

- **Logs** (ADR 0017): `debug` «job iniciado» `{ job, job_id }`; `warn` «fuente de uf falló» `{ job, job_id, fuente, motivo }` por cada fuente fallida; `info` «job terminado» `{ job, job_id, duracion_ms, estado, fuente?, fecha? }`; `error` «uf no actualizada» `{ job, job_id, duracion_ms, fallos }` cuando `sin_fuente`. **Nunca** el valor de la UF ni el cuerpo de la respuesta.
- **Registro** (`registrarJobUf(boss)`): `createQueue` siempre; `work`; con `env.UF_ACTUALIZAR` → `schedule('7 * * * *', {}, { tz: 'America/Santiago' })` y además `boss.send(JOB_UF, {}, { singletonKey: 'arranque', singletonSeconds: 600 })` para que una instalación nueva tenga la UF minutos después de arrancar sin esperar al minuto 7; sin `UF_ACTUALIZAR` → `logger.info('actualización de la UF desactivada')` y ni `schedule` ni `send`. `iniciarJobs` registra **7 colas**; `boss.test.ts` actualizado (lista de colas; con `UF_ACTUALIZAR=false` no hay programación de `indicadores.uf`).
- **Env** (`config/env.ts`): `UF_ACTUALIZAR: z.preprocess(vacioAUndefined, z.enum(['true','false']).default('true')).transform(v => v === 'true')`. `.env.example`: «`UF_ACTUALIZAR=true` — el job diario consulta Boostr y mindicador.cl; `false` apaga las llamadas salientes (CI, entornos sin internet); la UF se puede escribir a mano en cada cotización». `ci.yml`: el paso «Generar .env de CI» agrega `echo 'UF_ACTUALIZAR=false' >> .env` (la API que levanta `test:movil` no sale a internet; las semillas aportan la UF, §10).
- **Tests** (`uf.test.ts`, Postgres real, `fetch` doble): sin fila de hoy y Boostr responde el JSON del 2026-10-05 → una fila `{ fecha: hoy, valor: 41098.15, fuente: 'boostr' }` y `estado: 'actualizada'`; con la fila de hoy → `al_dia` y el doble **no se llama**; Boostr 500 y mindicador bien → `fuente: 'mindicador'` y un `warn` con `motivo: 'http_500'`; ambos fallan → `sin_fuente`, cero filas nuevas, un `error` sin el valor ni el cuerpo; Boostr devuelve `date` de ayer → se guarda bajo ayer y la siguiente ejecución vuelve a consultar (sigue sin fila de hoy); fecha futura → `fecha` y cae a mindicador; `value: 1` → `rango`; HTML en vez de JSON → `tipo`/`json`; cuerpo de 70 KB → `tamano`; `status: 'error'` → `estado`; timeout simulado (`fetch` que rechaza con `TimeoutError`) → `timeout`; redirección (`fetch` que rechaza con `TypeError` «redirect») → `redireccion`; dos valores distintos para la misma fecha (ya existe) → `ya_existia`, la fila no cambia. El logger de test no contiene «41098».

## 8. Web (bloque 8bE)

### 8.1 API del front

`features/configuracion/api.ts` y `features/clientes/api.ts`: tipos nuevos de `shared` (sin rutas nuevas). `features/cotizador/api.ts`: `indicadorUf = () => obtener<IndicadorUfSalidaDatos | null>('/api/indicadores/uf')`, `clavesCotizacion.uf = ['indicador-uf']`, `staleTime` 5 min. `invalidarCotizacion` sin cambios.

### 8.2 Configuración → Tarifas (`TarifasTab.tsx`)

- Cada concepto de `CONCEPTOS_TARIFA` pasa a una fila con **`Seleccion` de moneda** (`CLP` «$ pesos» / `UF`) y el `Input` del valor (`step 1` y prefijo `$` en CLP; `step 0.01`, `inputMode="decimal"` y prefijo `UF` en UF); vacío = `null` (se muestra `[TARIFA]` como hoy). Al cambiar la moneda **no se convierte** el número escrito (es una tarifa nueva en otra moneda). `costo_interno` sigue como está (solo `$`). RHF con `zodResolver(TarifasEntrada)`; el valor del formulario es `{ moneda, valor } | null` por concepto (un `Controller` por fila).
- Bajo las tarifas, una línea `tinta-3` con el indicador: «UF del día: $41.098,15 · 5 oct 2026 · Boostr» o, si `desactualizado`, «UF del 1 oct 2026 ($41.098,15, Boostr): **puede estar desactualizada**» en `text-alta`; sin indicador: «Sin valor de la UF todavía: en cada cotización puedes escribirlo a mano». Es informativo (el admin no edita la UF aquí; §15.7).
- Tests (`TarifasTab.test.tsx`): guardar envía `hora_normal: { moneda: 'UF', valor: 0.8 }` y `hora_urgencia: null`; `0,123` en UF muestra error; `38000,5` en CLP muestra error; la línea de la UF muestra «puede estar desactualizada» con `desactualizado: true`.

### 8.3 Ficha de cliente (`ClienteFichaPage.tsx`, `DialogoTarifas.tsx`)

- Ficha: cada concepto muestra `formatearMonto(valor, moneda) + ' + IVA'` (`UF 0,80 + IVA`) o «Tarifa global».
- `DialogoTarifas`: por concepto, casilla «Usar tarifa global» (como hoy) y, si no, `Seleccion` de moneda + `Input` (mismas reglas que §8.2); `DialogDescription` pasa a «Valores netos, más IVA. En UF se convierten con el valor UF de cada cotización.»; validación con `TarifaClienteEntrada` (mensaje de error como hoy).
- Tests: enviar `[{ concepto: 'hora_normal', moneda: 'UF', valor: 0.8 }]`; la ficha muestra `UF 0,80 + IVA`.

### 8.4 Cotizador (`DatosCotizacion.tsx`, `TotalesCotizacion.tsx`, `TablaLineas.tsx`, `DialogoImportarHoras.tsx`, `CotizadorPage.tsx`)

- **Campo «Valor UF» siempre visible** (también en CLP), `step 0.01`, con `ayuda` según la procedencia guardada: «Del 5 oct 2026 · Boostr», «Ingresado a mano», o «Sin valor: las tarifas en UF no se podrán convertir» (`text-alta`). Junto al campo, botón `variant="outline"` **«Usar UF del día»** (solo con `editable`): escribe en el formulario el `valor` de `indicadorUf()`; deshabilitado con tooltip «No hay valor de la UF» si la consulta devuelve `null`; si `desactualizado`, el botón sigue activo y la ayuda muestra «UF del 1 oct 2026: puede estar desactualizada». En UF el campo sigue siendo obligatorio (mensaje de Zod «Indica el valor de la UF»). Al guardar, la API fija `fecha`/`fuente` (§4.7) y el formulario se resetea con la respuesta (como hoy), así la ayuda refleja la procedencia real.
- **Precio de «Agregar línea»** (`precioNuevaLinea`): `convertirTarifa(tarifas.hora_normal, moneda, valorUf) ?? 0` (con tarifa del cliente si existe, si no la global; ya se cargan ambas); desaparece el «en UF deja 0» de ADR 0025.28.
- **`TotalesCotizacion`**: sin cambio de contrato; el texto «≈ $… al valor UF indicado» pasa a «≈ $… al valor UF de <fecha>/ingresado a mano» cuando se conoce la procedencia (prop opcional `procedencia`).
- **`DialogoImportarHoras`**: recibe `moneda` y `valorUf` **guardados** de la cotización (importar exige guardar antes, ADR 0025.28); el texto de la tarifa muestra la tarifa en su moneda y, si difiere de la de la cotización, el precio convertido: «Tarifa del cliente UF 0,80/h ≈ $32.879/h al valor UF $41.098,15»; si hace falta convertir y `valorUf` es `null`, el botón «Importar» se deshabilita con el mensaje «Indica el valor de la UF en Datos y guarda antes de importar». Mismo tratamiento para la tarifa extendida con origen `registradas`.
- **`DialogoPlantilla`** del cotizador: sin cambios de contrato; el 400 `VALIDACION { valor_uf }` se muestra como toast con el mensaje de la API (como los demás 400/409 del cotizador).
- Al cambiar la **moneda** del borrador, las líneas existentes **no** se reconvierten (§14.4); un texto bajo el selector lo dice: «Cambiar la moneda no convierte las líneas ya escritas».
- Tests (`CotizadorPage.test.tsx`): con `valor_uf_fuente: 'boostr'` la ayuda muestra «Del … · Boostr»; «Usar UF del día» escribe `41098.15` y, al guardar, el cuerpo lleva `valor_uf: 41098.15` en una cotización CLP; con `indicadorUf → null` el botón está deshabilitado; en CLP con tarifa `hora_normal: { UF, 0.8 }` y `valor_uf 41098.15`, «Agregar línea» crea la línea con `precio_unitario 32879`; en UF con tarifa CLP 38 000 → `0.92`; `DialogoImportarHoras` muestra «≈ $32.879/h» y deshabilita «Importar» sin `valor_uf`.

### 8.5 Rutas y menú

Sin cambios (`/configuracion/tarifas`, `/clientes/:id`, `/cotizaciones/:id` existen). Sin entradas nuevas en el menú.

### 8.6 Móvil (ADR 0029)

`npm run test:movil` debe seguir **verde sin tocar `movil.spec.ts`**: el cotizador y las pestañas de Configuración no están en el inventario de pantallas de terreno, pero `/configuracion/*` y `/clientes` están en la lista de «usables» a 375 px solo para desbordes (`/configuracion/equipo`, `/clientes`). Reglas para los cambios de esta fase: la fila moneda + valor de las tarifas usa `grid gap-2 sm:grid-cols-[auto_1fr]` (en una columna bajo `sm`), el campo «Valor UF» con su botón se apila bajo `sm` (`flex flex-col sm:flex-row`), ningún `Input` con `min-w` superior a 100 % y los botones nuevos son `Button` (44 px bajo `lg`). Verificación manual en §13 a 375 px (sin scroll horizontal en `/configuracion/tarifas`, en la ficha del cliente con el diálogo abierto y en el cotizador). Las capturas de las pantallas que cambian se regeneran con `npm run docs:capturas` (§11).

## 9. Pruebas de seguridad obligatorias (`cotizaciones/seguridad.test.ts`, `configuracion/tarifas.test.ts`, `clientes.test.ts`, `indicadores/seguridad.test.ts`, `integraciones/uf/uf.cliente.test.ts`, `core/jobs/uf.test.ts`)

1. **Permisos**: test genérico de permisos (Fase 1) verde con `GET /api/indicadores/uf` (sin sesión → 401; cualquier rol → 200, también Bearer del bot); `PUT /api/config/tarifas` y `PUT /api/clientes/:id/tarifas` siguen 403 para técnico, coordinación y lectura.
2. **Entradas de tarifas manipuladas**: `hora_normal: 38000` (forma antigua), `{ moneda: 'UTM', valor: 1 }`, `{ moneda: 'UF', valor: 0.123 }`, `{ moneda: 'CLP', valor: 38000.5 }`, `{ moneda: 'UF', valor: 1e9 }`, `valor: -1`, `costo_interno: { … }` → 400 `VALIDACION` por campo; tarifa por cliente con `concepto: 'costo_interno'` o repetido → 400. Nada queda escrito (la clave `tarifas` y `tarifa_cliente` no cambian) y no hay `auditoria`.
3. **Auditoría sin montos**: `PUT /api/config/tarifas` cambiando `hora_normal` de `{ CLP, 38000 }` a `{ UF, 0.8 }` → una `config_cambiada { seccion: 'tarifas', campos: ['hora_normal'] }` cuyo `JSON.stringify(detalle)` no contiene `UF`, `0.8` ni `38000`; cambiar solo la moneda con el mismo número también lista el concepto.
4. **`valor_uf` manipulado en el `PUT` de la cotización**: `0`, `-1`, `1e7`, `41098.155` → 400 `VALIDACION { valor_uf }`; `valor_uf_fecha` / `valor_uf_fuente` en el cuerpo se **ignoran** (Zod los descarta): enviar `valor_uf_fuente: 'boostr'` con un valor inventado deja `fuente = 'manual'`; enviar exactamente `41098.15` cuando existe esa fila deja `fuente = 'semilla'` y `fecha` de la fila; un `valor_uf` de `999999` con una tarifa en UF de 99 999 → el total supera el máximo → 400 `VALIDACION { lineas }` (ADR 0025.29), sin desbordar.
5. **Conversión**: cotización CLP sin `valor_uf` + tarifa del cliente en UF → `importar-horas` 400 `VALIDACION { valor_uf }` y el borrador sigue con 0 líneas y `actualizado_en` igual; con `valor_uf 41098.15` → líneas a 32 879; cotización UF (`valor_uf 41098.15`) + tarifa global CLP 38 000 → 0,92; plantilla con precio fijo 90 000 en cotización UF → 2,19; tarifa en la misma moneda → sin redondeo extra (`0.8` en UF; `38000` en CLP); sin tarifa alguna → 409 `TARIFA_FALTANTE` (antes que el 400 de `valor_uf`); la cotización `enviada` → 409 `COTIZACION_NO_EDITABLE` antes de cualquier conversión.
6. **Snapshot**: tras crear la v1 con indicador `semilla 41098.15`, insertar un indicador nuevo de fecha posterior (`hoy + 1`, `45000`, `boostr`) y cambiar la tarifa global **no** altera `valor_uf`, `neto`, `neto_clp` ni `total_clp` de la cotización (`GET /api/cotizaciones/:id` y `GET /api/ots` idénticos); duplicar como v2 toma `45000` con su fecha y fuente; la v1 `enviada` conserva `41098.15`.
7. **Lectura del indicador**: `GET /api/indicadores/uf` sin filas → `200 null`; con filas de ayer y hoy → la de hoy, `desactualizado: false`; solo de hace 3 días → `desactualizado: true` y `hoy` = fecha de Santiago (test con `TZ=UTC`, como corre la suite); la respuesta no incluye claves fuera del esquema.
8. **Llamadas salientes** (`uf.cliente.test.ts`, con dobles de `fetch`): URL fija exacta, `GET`, sin cuerpo ni cookies ni `Authorization`, `redirect: 'error'`, `signal` presente; respuestas malformadas (HTML, JSON truncado, `{ status: 'error' }`, `serie: []`, `value: 'abc'`, `value: NaN` como `null`), valores absurdos (`1`, `1e9`, negativo), fechas absurdas (futura, de hace 30 días, `'2026-13-01'`), cuerpo de 70 KB, `status` 301/429/500 y timeout → `ErrorFuenteUf` con el motivo esperado y **nada guardado**; claves extra en el JSON se ignoran; el error no contiene el cuerpo de la respuesta (`String(err)` sin «<html»). Guarda de `NODE_ENV=test`: llamar sin doble lanza antes de tocar la red.
9. **El job no es una vía de escritura arbitraria**: no existe ruta `POST`/`PUT` sobre `/api/indicadores/*` (el test de permisos genérico lo cubre al enumerar rutas); `registrarUf` con `fuente: 'manual'` viola el `CHECK` (la fuente manual solo vive en `cotizacion`).
10. **Logs**: el logger de test, tras el job con éxito y con fallo, no contiene «41098», «41098.15» ni fragmentos del JSON externo; sí `fuente` y `motivo`.
11. **Módulos**: `grep` en `cotizaciones.service.ts`: la única lectura de `indicador_uf` es `leerUfVigente` (import de `indicadores.service.ts`), que también resuelve la procedencia de §4.7; ninguna escritura fuera de `indicadores.service.ts` y las semillas.
12. `X-Request-Id` presente en los 400 nuevos.

## 10. Semillas y cifras esperadas (bloque 8bF)

### 10.1 Semilla base (`sembrarBase`)

La clave `tarifas` se inserta con la **forma nueva** (`hora_normal: null`, … , `costo_interno: null`, `iva_pct 19`, `validez_dias_defecto 30`, `condiciones_defecto null`; el `null` es igual en ambas formas, así que el JSON no cambia). **No** inserta `indicador_uf`: `sembrarBase` corre en producción al arrancar y una UF ficticia ahí sería un dato falso.

### 10.2 Semilla de desarrollo (`desarrollo.ts`)

- `TARIFAS_DESARROLLO`: `hora_normal: { moneda: 'CLP', valor: 38000 }`, `hora_extendida: { moneda: 'CLP', valor: 45000 }`, `costo_interno: 18000`, resto como hoy (`TARIFAS_BASE` con la forma nueva; el `UPDATE … WHERE valor = $1` sigue comparando con la base).
- Viña Santa Clara: sus dos tarifas pasan a `{ concepto, moneda: 'CLP', valor }` (mismos números).
- **Transportes Austral** (nuevo, solo si no tiene tarifas): `hora_normal UF 0,80`, `hora_extendida UF 1,00`. Queda a la vista en la ficha («UF 0,80 + IVA») y sirve para probar la conversión con fábricas; sus OT sembradas (OT-0213) están cerradas, así que ninguna cotización sembrada cambia.
- **`sembrarIndicadorUf()`**: `INSERT INTO indicador_uf (fecha, valor, fuente) VALUES ($1, 41098.15, 'semilla') ON CONFLICT (fecha) DO NOTHING` con `$1 = hoyEnSantiago()` (el valor verificado el 2026-10-05). En desarrollo con internet el job agrega las fechas siguientes con fuente real; en CI (`UF_ACTUALIZAR=false`) la semilla es la única fila.
- Las cotizaciones sembradas siguen en CLP **sin `valor_uf`** (nacieron antes del indicador; `valor_uf_fuente` `null`): es un estado legítimo que la interfaz cubre con «Usar UF del día».

### 10.3 Escenario de fábricas (`cotizaciones.test.ts`, valores exactos)

Cliente `Austral` con `crearTarifaCliente(id, 'hora_normal', { moneda: 'UF', valor: 0.8 })`; tarifas globales `hora_normal { CLP, 38000 }`, `hora_extendida { CLP, 45000 }`; `crearIndicadorUf()` (hoy, 41 098,15, `semilla`); OT facturable de `Austral` en `borrador` con tareas «Diagnóstico» (3 h estimadas) y «Instalación» (4 h estimadas).

```
POST /api/ots/:id/cotizaciones            → valor_uf 41098.15, valor_uf_fecha = hoy, valor_uf_fuente 'semilla', moneda 'CLP'
POST …/importar-horas { origen: 'estimadas' }
                                          → líneas: Diagnóstico 3 h × 32879 = 98637; Instalación 4 h × 32879 = 131516
                                            neto 230153 · iva 43729 · total 273882 · neto_clp 230153
PUT  …  { …, moneda: 'UF', lineas: [] }   → UF con valor_uf 41098.15 (fuente 'semilla' se conserva: el valor no cambió)
POST …/importar-horas                     → tarifa del cliente UF 0,80 en la misma moneda: 3 × 0.8 = 2.4; 4 × 0.8 = 3.2
                                            neto 5.6 · iva 1.06 · total 6.66 · neto_clp 230150 (round(5.6 × 41098.15) = 230149.64)
                                            total_clp 273714 (round(6.66 × 41098.15) = 273713.68)
Sin tarifa del cliente (otra OT, cliente sin tarifas), cotización UF:
POST …/importar-horas                     → global CLP 38000 → 0.92/h: 3 × 0.92 = 2.76; 4 × 0.92 = 3.68 → neto 6.44 · iva 1.22 · total 7.66
PUT  … { valor_uf: 41000 }                → fuente 'manual', fecha null; `evento` cambio valor_uf '$41.098,15' → '$41.000,00'
PUT  … { moneda: 'CLP', valor_uf: null }  → 200 (permitido en CLP; fuente y fecha null); luego importar con la tarifa UF del cliente → 400 VALIDACION { valor_uf }
```

Las cinco líneas del diseño (COT-0218) en UF con las tarifas globales convertidas (0,92 · 0,92 · 1,09 · 0,92 y 90 000 → 2,19 con 10 %): subtotal **11,73**, descuentos **0,22**, neto **11,51**, IVA **2,19**, total **13,70**, `neto_clp` **473 040** (`round(11.51 × 41098.15)`). Este caso va en `calcular.test.ts` como contraparte en UF del caso $475.000 / $565.250 de la Fase 4.

### 10.4 Cifras con las semillas (`desarrollo.test.ts`)

Tras sembrar dos veces: `tarifa_cliente` **4** filas (2 de Viña en CLP, 2 de Transportes Austral en UF); `indicador_uf` **1** fila (`fuente 'semilla'`, `fecha = hoy`); `GET /api/indicadores/uf` → `{ valor: 41098.15, fuente: 'semilla', desactualizado: false }`; `GET /api/clientes/<Transportes Austral>` → `tarifas: [{ hora_normal, UF, 0.8 }, { hora_extendida, UF, 1 }]`; `GET /api/config/tarifas` → `hora_normal: { moneda: 'CLP', valor: 38000 }`, `costo_interno: 18000`; las cifras de la Fase 7 (§10.3 de `fase-7.md`: 7 OT, 5 cotizaciones, COT-0218 `neto 475000`, OT-0213 `380000`, reportes) **no cambian**; las cotizaciones sembradas tienen `valor_uf null`.

## 11. Documentación (bloque 8bF)

- `docs/manuales/administracion.md`: §7 «Tarifas por cliente» y §14 «Tarifas, IVA y validez» explican la moneda por concepto («cada tarifa puede estar en pesos o en UF; la UF se convierte con el valor UF guardado en cada cotización»), la línea «UF del día» y qué significa «puede estar desactualizada»; §14 agrega «Valor de la UF»: de dónde sale (Boostr, respaldo mindicador.cl, una vez por hora, `UF_ACTUALIZAR`), que una cotización guarda el valor con que nació y nunca cambia sola, y qué hacer si no hay valor (escribirlo a mano en la cotización). Sección 16 (`.env`) documenta `UF_ACTUALIZAR`.
- `docs/manuales/usuario/01-tecnico.md` (Cotizador): el campo «Valor UF» existe en pesos y en UF, se precarga con la UF del día, «Usar UF del día», procedencia, aviso de desactualizada; «Importar horas» y «Aplicar plantilla» funcionan en ambas monedas y muestran el precio convertido (0,8 UF → $32.879 a $41.098,15); quitar «No se puede importar en una cotización en UF»; «Agregar línea» usa la tarifa convertida.
- `docs/manuales/usuario/02-coordinacion.md`: una frase en «Cotizador»: las sumas en pesos de la lista de OT, Por facturar y Reportes usan el valor UF guardado en cada cotización.
- `docs/api/README.md`: `GET /api/indicadores/uf` con ejemplo de respuesta; forma nueva de `PUT /api/config/tarifas` y `PUT /api/clientes/:id/tarifas`; el 400 `VALIDACION { valor_uf }`. `docs/api/openapi.json` regenerado.
- `docs/CHANGELOG.md`: Fase 8b en «Añadido» (tarifas CLP/UF, indicador diario, snapshot y conversión, `GET /api/indicadores/uf`, `UF_ACTUALIZAR`, migración 15); «Cambiado»: forma de `tarifas` y `tarifa_cliente`, desaparece el error «las tarifas están en pesos», «Agregar línea» en UF ya no deja 0, la etiqueta del historial de `valor_uf` con dos decimales; sin dependencias nuevas.
- `.env.example`, `README.md` (variable nueva; nada de scripts), `CLAUDE.md` §2 (fila nueva de la tabla y la de tarifas; «`indicador_uf` lo escriben solo el job `indicadores.uf` por `indicadores.service.ts` y las semillas»; «toda llamada saliente usa `fetch` con URL fija, timeout, `redirect: 'error'`, validación Zod y rango de plausibilidad, y en tests siempre con un doble») y §6 (sin comandos nuevos).
- Capturas (ADR 0012 y 0029): regenerar con `npm run docs:capturas` las de las pantallas que cambian según `e2e/capturas.ts` (`administracion/tarifas.png`, `tecnico/cotizador.png` y la de la ficha de cliente si existe); el test de integridad de imágenes sigue verde.
- `docs/decisiones/0030-precisiones-de-la-fase-8b.md` con lo de §14–§16 y `README.md` de decisiones actualizado (fila 0030; la línea **Estado** de ADR 0007 gana «precisada por ADR 0030 (valor UF automático; tarifas con moneda)» y la de 0025 «precisada por ADR 0030 (sustituye 0025.24 y 0025.28 en UF)»; el resto del texto de ambas no se toca). `preguntas-abiertas.md` no se edita.

## 12. Tareas (en orden; cada una termina con tests verdes, `typecheck`, `lint`, `format:check` y un commit convencional en español, sin `Co-Authored-By`)

| Tarea                                          | Bloque | Crea/edita                                                                                                                                                              | Criterio de aceptación                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F8b-T1 Contratos compartidos y conversión**  | 8bA    | `shared/src/enums/tarifa.ts`, `esquemas/{configuracion,cliente,cotizacion,indicadores}.ts`, `cotizacion/calcular.ts`, `formato/moneda.ts`, tests                        | Tabla de §3.2 y el caso UF del diseño (§10.3) verdes en `calcular.test.ts`; `esquemas.test.ts` cubre §3.2; `typecheck` de api y web **falla** donde la forma de tarifas cambió (lo arreglan T4 y T7) y se anota en el commit.                                                                                                                                                                                                                                                                                                                                                                   |
| **F8b-T2 Migración, entidades y fábricas**     | 8bA    | migración 15, `entidades.ts`, tres entidades, `fabricas.ts`, `fabricas-fase8b.test.ts`                                                                                  | `db:migrar` desde cero aplica 15; `db:revertir` deja 14 y `hora_normal` numérico; §3.3 verde; `npm run db:reiniciar` carga sobre una base migrada desde la 14 con la clave `tarifas` convertida.                                                                                                                                                                                                                                                                                                                                                                                                |
| **F8b-T3 Cliente de fuentes, job y módulo**    | 8bB    | `integraciones/uf/{cliente,cliente.test}.ts`, `core/jobs/{uf,uf.test,boss,boss.test}.ts`, `modulos/indicadores/**`, `app.ts`, `config/env.ts`, `.env.example`, `ci.yml` | §5.4, §5.5, §7 y las pruebas 1, 7, 8, 9 y 10 de §9 verdes; `boss.test.ts` con 7 colas; `openapi.json` regenerado; CI con `UF_ACTUALIZAR=false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **F8b-T4 Tarifas con moneda (API)**            | 8bC    | `configuracion.service.ts`, `tarifas.test.ts`, `clientes.service.ts`, `clientes.test.ts`                                                                                | §5.3 y las pruebas 2 y 3 de §9; `ots.consulta.ts` sin cambios y su test de `costo_interno` verde; `typecheck` de la API verde.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **F8b-T5 Cotizaciones: snapshot y conversión** | 8bD    | `cotizaciones.service.ts`, `cotizaciones.consulta.ts`, `cotizaciones.test.ts`, `cotizaciones-flujo.test.ts`, `eventos.test.ts`                                          | §5.2 y §10.3 exactos (incluidas las variantes); pruebas 4, 5, 6, 11 y 12 de §9; el test de ADR 0025.24 («UF → 400 moneda») se **invierte**; `cotizacionVigente`/`netoVigenteClp` sin cambios.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **F8b-T6 Documentos**                          | 8bD    | `cotizacion.xlsx.ts`, `cotizacion.pdf.ts`, sus tests                                                                                                                    | §5.6: planilla con «Valor UF del … (fuente): $41.098,15» en UF y en CLP con valor; PDF solo en UF; fórmulas y formatos intactos (tests existentes verdes).                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **F8b-T7 Web: tarifas globales y por cliente** | 8bE    | `TarifasTab.tsx`, `TarifasTab.test.tsx`, `configuracion/api.ts`, `DialogoTarifas.tsx`, `ClienteFichaPage.tsx`, `clientes/api.ts`, `ClientesPage.test.tsx`               | §8.2 y §8.3 con sus tests; `typecheck` de la web verde; a 375 px sin scroll horizontal (manual).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **F8b-T8 Web: cotizador**                      | 8bE    | `cotizador/api.ts`, `DatosCotizacion.tsx`, `TotalesCotizacion.tsx`, `TablaLineas.tsx`, `DialogoImportarHoras.tsx`, `CotizadorPage.tsx`, `CotizadorPage.test.tsx`        | §8.4 con sus tests. En el navegador (1440 y 375 px) con `crojas`: ficha de Viña → «Editar tarifas» → hora normal `UF 0,80` → `COT-0218` → «Duplicar como v2» → v2 con «Valor UF $41.098,15 · Del <hoy> · Semilla de desarrollo» → «Importar horas de las tareas…» muestra «≈ $32.879/h» e importa a `$32.879`; cambiar a UF y «Agregar línea» deja `0,92` con la global.                                                                                                                                                                                                                        |
| **F8b-T9 Semillas**                            | 8bF    | `semillas/desarrollo.ts`, `desarrollo.test.ts`                                                                                                                          | §10.2 y §10.4; `npm run db:reiniciar` dos veces deja 4 `tarifa_cliente` y 1 `indicador_uf`; cifras de la Fase 7 intactas.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **F8b-T10 Documentación y capturas**           | 8bF    | §11 (manuales, `docs/api/README.md`, CHANGELOG, `openapi.json`, `.env.example`, `README.md`, `CLAUDE.md`), capturas                                                     | `npm run docs:capturas` regenera las capturas afectadas; test de integridad de imágenes verde; `git diff --exit-code docs/api/openapi.json` tras `api:openapi`.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **F8b-T11 Revisión de seguridad de la fase**   | —      | correcciones con test                                                                                                                                                   | PLAN §1: Fable con `sentry-security-review` y Opus con `/security-review` sobre el diff completo; cada hallazgo confirmado se corrige con un test; nada se mergea con hallazgos abiertos. Puntos a mirar: llamadas salientes (URL fija, `redirect: 'error'`, timeout, tamaño, Zod, rango, sin datos de la instalación), que el valor externo nunca entre a una cotización existente, `valor_uf` solo por `CotizacionEntrada`, procedencia que no confía en el cliente, auditoría sin montos, logs sin valores, SQL con `$n`, `indicador_uf` sin ruta de escritura, `UF_ACTUALIZAR=false` en CI. |
| **F8b-T12 ADR 0030, cierre y PR**              | 8bF    | `docs/decisiones/0030-precisiones-de-la-fase-8b.md`, `docs/decisiones/README.md`, estado de avance en esta spec                                                         | Criterios de §13 desde un clon limpio; rebase sobre `main` cuando la Fase 8 esté integrada; PR a `main` con CI verde (incluido `test:movil`), **con confirmación del usuario** antes de abrirlo y antes de mergearlo.                                                                                                                                                                                                                                                                                                                                                                           |

## 13. Criterios de aceptación de la fase (verificación final, en este orden)

```
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d
npm ci && npm run typecheck && npm run lint && npm run format:check                          → 0 errores
npm run db:migrar                                                                           → 15 migraciones aplicadas
npm test                                                                                    → verde (shared: calcular, esquemas; api: todos, sin ninguna llamada a internet; web; bot)
                                                                                              Duration de la API ≤ 7 min local (anotar la cifra)
npm run db:reiniciar                                                                        → 18 tickets, 7 OT, 5 cotizaciones, 4 tarifa_cliente, 1 indicador_uf (semilla, hoy)
npm run api:openapi && git diff --exit-code docs/api/openapi.json                           → sin diff
npm run dev                                                                                 → "api iniciada", "jobs iniciados" (7 colas); en ≤ 10 min, con internet, un "job terminado" de
                                                                                              indicadores.uf con estado al_dia | actualizada (sin el valor en el log)
curl -b cookie(sdiaz)  "localhost:3010/api/indicadores/uf"                                   → 200 { valor: 41098.15, fecha: <hoy>, fuente: 'semilla', desactualizado: false, hoy: <hoy> }
curl -b cookie(hikki)  -X PUT …/api/clientes/<Viña>/tarifas -d '[{"concepto":"hora_normal","moneda":"UF","valor":0.8}]'  → 200 [{ hora_normal, UF, 0.8 }]
curl -b cookie(crojas) -X POST …/api/cotizaciones/<COT-0218 v1>/duplicar                      → 201 { version: 2, moneda: 'CLP', valor_uf: 41098.15, valor_uf_fuente: 'semilla' }
curl -b cookie(crojas) -X POST …/api/cotizaciones/<v2>/importar-horas -d '{"origen":"estimadas"}' → 200: cada línea con precio_unitario 32879 (0,8 UF × 41.098,15 = 32.878,52 → 32.879)
curl -b cookie(crojas) -X PUT  …/api/cotizaciones/<v2> con moneda 'UF', valor_uf 41098.15 y lineas []  → 200; luego importar-horas sin tarifa del cliente (Viña vuelve a global) → precio_unitario 0.92
curl -b cookie(crojas) -X PUT  …/api/cotizaciones/<v2> con valor_uf 41000                     → 200 { valor_uf_fuente: 'manual', valor_uf_fecha: null }; evento cambio valor_uf '$41.098,15' → '$41.000,00'
curl -b cookie(crojas) -X PUT  …/api/cotizaciones/<v2> con moneda 'CLP', valor_uf null        → 200; importar-horas con Viña en UF → 400 VALIDACION { valor_uf }
curl -b cookie(hikki)  -X PUT  …/api/config/tarifas con hora_normal { UF, 0.8 }                → 200; auditoria.config_cambiada { seccion: 'tarifas', campos: ['hora_normal'] } sin montos
curl -b cookie(sdiaz)  -X PUT  …/api/config/tarifas …                                         → 403
curl -b cookie(crojas) "localhost:3010/api/ots" y "/api/ots/indicadores"                      → netos en CLP iguales a los de la Fase 7 (las cotizaciones existentes no cambiaron)
curl -b cookie(crojas) -X DELETE …/api/cotizaciones/<v2>                                      → 204 (limpieza del borrador de prueba)
npm run test:movil                                                                          → verde (60 pasan, 2 omitidos; sin cambios en movil.spec.ts)
GitHub Actions: workflow CI verde en la rama y en el PR a main; paso "Tests" ≤ 4 min; el job no sale a internet (UF_ACTUALIZAR=false)
```

En el navegador (1440 y 375 px): `/configuracion/tarifas` con `hikki` muestra selector CLP/UF por tarifa y «UF del día: $41.098,15 · <hoy> · Semilla de desarrollo»; cambiar «Hora normal» a `UF 0,8` y guardar deja la fila del registro de seguridad sin montos; `/clientes/<Transportes Austral>` muestra «UF 0,80 + IVA» y «UF 1,00 + IVA»; el flujo de F8b-T8 sobre COT-0218 v2 da `$32.879/h` y, en UF, `0,92`; con `valor_uf` vacío en CLP, «Importar» está deshabilitado con el mensaje; a 375 px ninguna de las tres pantallas tiene scroll horizontal. Detener `npm run dev` con `taskkill /PID <pid> /T /F` y comprobar que no queda ningún `node.exe` de `tickets-app`.

## 14. Decisiones tomadas en esta spec (con justificación)

1. **`costo_interno` sigue en CLP**: es un costo interno por hora que `cargarOt` multiplica al vuelo por las horas registradas; en UF obligaría a elegir un tipo de cambio por OT (¿de hoy?, ¿de cada día de trabajo?) sin una regla de negocio que lo pida. El usuario pidió moneda en «tarifas globales y por cliente»; `costo_interno` no es una tarifa por cliente (spec fase 4 §4.1) ni se cotiza. Pregunta §15.1.
2. **Las tarifas en UF llevan dos decimales y el precio unitario convertido también**: ADR 0007 fija 2 decimales para todo monto en UF y `precio_unitario` es `numeric(14,2)`; cambiar la escala del precio tocaría la migración 11, los formatos del `.xlsx` y `multipleOf(0.01)` en toda la cadena. El error de redondear el precio (38 000 → 0,92 en vez de 0,9246: 0,5 %) es el mismo que asumiría una persona escribiendo el precio en una planilla, y el precio que ve el cliente es el que recalcula a mano. Pregunta §15.2.
3. **Los precios fijos de las plantillas son CLP y se convierten**: hoy una plantilla con precio fijo aplicada en una cotización en UF copiaba el número tal cual (90 000 «UF»), un error silencioso; con «conversión automática tarifa ↔ cotización» lo coherente es tratar el precio fijo como pesos (que es como se escribieron) y convertirlo. Dar moneda propia a cada línea de plantilla es ampliar el alcance. Pregunta §15.3.
4. **Cambiar la moneda de un borrador no reconvierte las líneas existentes**: es el comportamiento actual y convertir de ida y vuelta con redondeo a 2 decimales degrada los números; la web lo advierte bajo el selector. Pregunta §15.4.
5. **Un solo valor UF por cotización, también en CLP**: la conversión necesita un tipo de cambio y guardarlo en la cotización (no leerlo del indicador al importar) es lo que garantiza que una cotización enviada no cambie y que «importar» hoy y «importar» mañana den lo mismo dentro del mismo borrador. El `CHECK` de la migración 11 se mantiene: en UF es obligatorio, en CLP opcional.
6. **Procedencia resuelta por el servidor** (§4.7): la web no envía `fecha` ni `fuente`; si el valor coincide con la fila **vigente** de `indicador_uf` se toma su procedencia, si no es `manual`. Evita una ruta más («usar UF del día» en la API) y evita confiar en lo que declara el cliente. Un valor escrito a mano que coincide con la UF vigente recibe esa fecha: es el mismo valor, la procedencia es correcta en el fondo; coincidir con una fila antigua no basta (ADR 0030.19). `fecha` y `fuente` no generan `evento`: el historial ya registra el cambio de `valor_uf`.
7. **Duplicar toma la UF del día**, no la de la original: una vN es una oferta nueva con fecha de emisión de hoy (ADR 0025.12); el usuario lo pidió así. Sin indicador se copia la original para no dejar una UF sin valor. Pregunta §15.6.
8. **Job cada hora e idempotente, no una vez al día**: la UF del día se conoce con anticipación pero las fuentes pueden estar caídas o atrasadas a una hora fija; con «si ya hay fila de hoy no llama» el costo es un `SELECT` por hora y a lo sumo dos peticiones salientes por hora en el peor caso (muy por debajo del límite de Boostr). El `send` de arranque cubre la instalación nueva. Pregunta §15.5.
9. **Boostr primero, mindicador.cl de respaldo, último valor conocido después**: lo decidió el usuario; ambas son gratuitas y sin garantía, así que el sistema no depende de ellas para funcionar: sin indicador la cotización admite el valor a mano y la interfaz avisa. `ON CONFLICT DO NOTHING` por fecha: la primera fuente que responde fija el valor del día (las dos publican el mismo dato oficial; si difirieran por un error de una de ellas, el rango y la fecha lo detectan en parte y el campo editable cubre el resto).
10. **Rango de plausibilidad 20 000–200 000**: la UF vale ≈ 41 000 hoy y sube ≈ 3–4 % al año; el tope de 200 000 tarda décadas en alcanzarse y el piso descarta respuestas como `0`, `1` o un porcentaje. Fecha entre `hoy − 7` y `hoy`: una fuente que entrega el valor de ayer sigue siendo útil (se guarda bajo ayer); una fecha futura o de hace semanas es una respuesta rota.
11. **`UF_ACTUALIZAR` en vez de reutilizar `EJECUTAR_JOBS`**: CI necesita los demás jobs apagados o encendidos según el caso, pero **nunca** salir a internet (ADR 0020: nada externo en CI; Boostr bloquea por abuso y cada corrida sería una llamada); una variable propia lo hace explícito y `.env.example` lo documenta. Los tests unitarios pasan dobles de `fetch` y una guarda impide que un test use el `fetch` real.
12. **Módulo `indicadores` de solo lectura hacia afuera**: una sola ruta `GET`; la escritura la hacen el job (por el servicio) y las semillas. No es «configuración» (nadie la edita) ni «reportes» (no agrega nada).
13. **`neto_clp` y los agregados no cambian** (ADR 0025.14, 0027, 0028): lista de OT, indicadores de la pantalla 10, exportación de OT, cierre de OT (`efectosCierreOt`) y reportes ya suman `round(neto × valor_uf)` con el valor guardado en cada cotización; esta fase solo garantiza que ese valor exista desde el nacimiento de la cotización y documenta su procedencia. Las tres copias de la expresión SQL (`cotizaciones.consulta.ts`, `ots.consulta.ts`, `reportes.consulta.ts`) se dejan como están (cambio quirúrgico); el test que compara el SQL con `enClp` sigue valiendo.
14. **`formatearValorUf`**: el historial, la planilla y el PDF mostraban el valor UF con `formatearCLP` (sin decimales: `$41.098`); con conversión de tarifas los decimales importan (0,15 pesos por UF son $0,12 por hora a 0,8 UF, y se acumulan en los totales). Función nueva de tres líneas en `shared/formato`.
15. **Sin alerta ni aviso cuando la UF no se actualiza**: el job deja `error` en el log (Grafana en la Fase 9 alertará por `level=error`) y la interfaz muestra «puede estar desactualizada» donde importa (tarifas y cotizador). Un `aviso` por canal exigiría destinatarios y preferencias nuevas.

## 15. Preguntas para el usuario

1. **[No bloquea · recomendación: solo CLP]** ¿`costo_interno` (OT internas) también puede estar en UF? Decisión §14.1: no; si lo quieres, hay que definir qué tipo de cambio usa cada OT interna (el del día en que se mira, o uno fijado al crearla).
2. **[No bloquea · recomendación: 2 decimales]** ¿Los precios unitarios en UF se redondean a **2 decimales** (ADR 0007; 38 000 → 0,92) o prefieres 4 decimales en `precio_unitario` para las cotizaciones en UF (0,9246; cambia la escala de la columna, los formatos del `.xlsx` y `multipleOf`)? Decisión §14.2.
3. **[No bloquea · recomendación: CLP y se convierten]** Los **precios fijos** de las plantillas, ¿son pesos que se convierten en una cotización en UF (decisión §14.3) o se dejan como hoy (se copian tal cual, lo que en UF es un error)?
4. **[No bloquea · recomendación: no reconvertir]** Al cambiar la **moneda** de un borrador, ¿las líneas ya escritas se quedan como están (decisión §14.4, con aviso en la web) o se convierten con el valor UF guardado?
5. **[No bloquea · recomendación: cada hora]** El job `indicadores.uf`, ¿cada hora e idempotente (decisión §14.8) o una vez al día a una hora fija (por ejemplo 09:15), con el riesgo de quedarse sin UF del día si las fuentes fallan justo a esa hora?
6. **[No bloquea · recomendación: sí]** Confirmas que **duplicar como vN** toma la UF **del día** (y no la de la versión anterior), como dijiste el 2026-10-05 (decisión §14.7).
7. **[No bloquea · recomendación: no en esta fase]** ¿Quieres además que Administración pueda **registrar la UF a mano** en Configuración → Tarifas cuando ambas fuentes fallen varios días? Hoy el valor se escribe en cada cotización; una entrada manual global sería una fila `indicador_uf` con `fuente = 'manual'` (hoy prohibida por el `CHECK`), una ruta `POST` con `config.editar` y auditoría. Propongo anotarlo en ADR 0030 como mejora.
8. **[No bloquea · recomendación: sí]** ¿Agregar a las semillas la tarifa en UF de **Transportes Austral** (0,80 y 1,00 UF) y la fila `indicador_uf` de hoy con fuente `semilla` (41 098,15)? Cambia `desarrollo.test.ts` (4 tarifas por cliente, 1 indicador); no cambia ninguna cifra de la Fase 7.
9. **[No bloquea · recomendación: sí]** ¿Aceptas que `valor_uf` quede **en `null`** en las cotizaciones ya sembradas y en cualquier cotización CLP creada sin indicador (la interfaz ofrece «Usar UF del día» o escribirlo), en vez de rellenarlas con un valor en la migración? Rellenar inventaría un tipo de cambio para cotizaciones que no lo usaron.

No hay preguntas bloqueantes: todo lo anterior se implementa con la recomendación si no hay respuesta (regla acordada en la Fase 7), y cada alternativa es un cambio local.

### Respuestas (2026-10-05)

El usuario decidió el alcance (solo CLP y UF, antes de la v1.0.0). Ninguna de las nueve preguntas bloquea, así que se resuelven con la recomendación: 1 `costo_interno` solo en CLP; 2 precio unitario en UF con 2 decimales; 3 precios fijos de plantilla en CLP y convertidos; 4 cambiar la moneda no reconvierte líneas; 5 job cada hora e idempotente; 6 duplicar toma la UF del día; 7 sin registro manual de la UF desde Configuración en esta fase; 8 tarifa en UF para Transportes Austral e `indicador_uf` de hoy en las semillas; 9 `valor_uf` en `null` en las cotizaciones existentes sin indicador. El usuario puede cambiar cualquiera antes del PR.

## 16. Cambios de ADR propuestos (no se editan las ADR; registrar en ADR 0030 «Precisiones de la Fase 8b» al cerrar, y actualizar solo la línea **Estado** de 0007 y 0025)

- **ADR 0007**: «`valor_uf` ingresado a mano… la app no consulta el valor de la UF» queda sustituido: la app consulta la UF una vez por hora (Boostr, respaldo mindicador.cl), la guarda en `indicador_uf` y la precarga en cada cotización como snapshot (`valor_uf`, `valor_uf_fecha`, `valor_uf_fuente`), editable a mano. Tarifas globales (salvo `costo_interno`) y por cliente con `{ moneda, valor }`; conversión del precio unitario con `convertirTarifa` en `shared` (redondeo como monto de la moneda destino) antes de `calcularCotizacion`; `formatearValorUf` con dos decimales. `enClp`, `redondear` y el cálculo no cambian.
- **ADR 0008**: job nuevo `indicadores.uf` (`7 * * * *`, America/Santiago, idempotente por fecha, `send` de arranque con `singletonKey`); `iniciarJobs` registra 7 colas; `UF_ACTUALIZAR` apaga la programación.
- **ADR 0010**: ruta nueva `GET /api/indicadores/uf` (`sesion`, `IndicadorUfSalida | null`); forma nueva de `PUT /api/config/tarifas` y `PUT /api/clientes/:id/tarifas`; 400 `VALIDACION { valor_uf }` cuando hace falta convertir sin valor; sin códigos nuevos.
- **ADR 0017**: logs del job con `fuente`, `motivo`, `estado` y `fecha`, nunca el valor ni el cuerpo externo; `config_cambiada { seccion: 'tarifas', campos }` sigue sin montos y ahora también sin monedas; `indicador_uf` es el registro del job (sin `evento` ni `auditoria`).
- **ADR 0018.8 / 0020**: Boostr pasa a ser dependencia en tiempo de ejecución, con respaldo y degradación (último valor conocido + edición manual); CI nunca sale a internet (`UF_ACTUALIZAR=false`, dobles de `fetch`, guarda en `NODE_ENV=test`).
- **ADR 0025.14**: `OtResumen.neto`, `neto_clp` y los agregados siguen usando el `valor_uf` guardado; ahora existe desde la creación. **ADR 0025.16**: importar horas y aplicar plantillas convierten la tarifa (del cliente, si no la global, con su moneda) a la moneda de la cotización; los precios fijos de plantilla son CLP y se convierten. **ADR 0025.17**: la clave `tarifas` cambia de forma (migración 15 la convierte). **ADR 0025.24 queda sustituido** (ya no hay 400 `VALIDACION { moneda }`). **ADR 0025.28**: «en UF, Agregar línea deja el precio en 0» queda sustituido por la tarifa convertida.
- **ADR 0026.10**: con origen `registradas` la tarifa extendida se convierte igual que la normal.
- **ADR 0027.40**: el patrón de llamada saliente con `fetch` (URL fija, timeout de 10 s, clasificación de errores sin copiar el mensaje original) se generaliza a `integraciones/uf/cliente.ts`, sumando `redirect: 'error'`, tope de tamaño, validación Zod y rango de plausibilidad.
- **ADR 0028.16**: `facturado` y `por_facturar` por cliente siguen sumando `cv.neto_clp`; sin cambios de fórmula.
- **ADR 0029**: `npm run test:movil` sigue siendo bloqueante; las pantallas de tarifas y cotizador cumplen la regla de 44 px y no desbordan a 375 px (verificación manual; sin casos nuevos en `movil.spec.ts`); capturas regeneradas por fase.
- **Spec funcional §4.7 / §6 / PLAN §4**: `Cotizacion` gana `valor_uf_fecha` y `valor_uf_fuente`; `TarifaCliente` gana `moneda`; tabla nueva `IndicadorUf`; la Fase 9 carga tarifas reales en CLP o UF; versión: Fase 8b entra antes de la v1.0.0.
- **Infraestructura**: `UF_ACTUALIZAR` en `config/env.ts`, `.env.example`, `docker/` (Fase 9: `docs/despliegue.md` la documenta; en producción `true`).

## 17. Estado de avance

Cerrado el 2026-10-05 en la rama `feat/fase-8b-uf` (12 commits antes del de cierre). Las decisiones y desviaciones están en **ADR 0030**; aquí solo lo que esta spec pedía anotar.

- **Commits por bloque**: 8bA `feat(shared)` contratos y conversión, `feat(api)` migración 15, entidades y fábricas; 8bB `feat(api)` job, cliente de fuentes y módulo `indicadores` (+ `fix(api)` 20 s de timeout); 8bC `feat(api)` tarifas con moneda; 8bD `feat(api)` snapshot y conversión en cotizaciones y documentos (+ `fix(api)` procedencia solo con la UF vigente); 8bE `feat(web)` tarifas, ficha de cliente y cotizador; 8bF `feat(api)` semillas, `docs` openapi, capturas y este cierre.
- **Respuestas a §15**: las nueve con la recomendación (ver «Respuestas (2026-10-05)» y ADR 0030.1–9).
- **Desviaciones**: procedencia por coincidencia **solo con la UF vigente** (§4.7, §5.2, §9.11 y §14.6 corregidos; ADR 0030.19); timeout de las fuentes **20 s** en vez de 10 s (mindicador tarda 3–8 s; ADR 0030.20); `obtenerUfDelDia` devuelve `fallos` también con éxito y la fecha de mindicador se convierte con `Intl.DateTimeFormat`, no con `@date-fns/tz` (ADR 0030.21); `datos.tarifa_moneda` es la de la primera tarifa usada y `datos.valor_uf` va solo si hubo conversión (ADR 0030.22); el 400 `valor_uf` de plantilla con precio fijo en UF es inalcanzable por el `CHECK` y queda como defensa (ADR 0030.23); la captura del cotizador duplica COT-0218 como v2 y la borra después (ADR 0030.25).
- **Verificación manual** (2026-10-05): Boostr y mindicador.cl devolvieron 41 098,15 para el 2026-10-05 (mindicador estuvo caído un rato esa tarde y el respaldo funcionó en ambos sentidos); flujo de F8b-T8 sobre COT-0218 v2 en el navegador: «Valor UF $41.098,15 · Del <hoy> · Semilla de desarrollo», importar a `$32.879/h`, en UF `0,92`; capturas regeneradas (`administracion/tarifas.png`, `tecnico/cotizador.png`, ficha de cliente). La base de desarrollo necesitó `npm run db:migrar` antes de `db:reiniciar` (no migra; anotado en README y `CLAUDE.md`).
- **Cifras**: suite de la API ~8 min en local con la base por defecto (`zydesk_test`; el objetivo de ≤ 7 min de §13 no se alcanzó con esa base: la suite creció con 8 archivos de test de la fase); CI de la Fase 8 (el primero con Playwright) 8–9 min; `npm run test:movil` sin cambios en `movil.spec.ts`.
- **Revisión de seguridad (F8b-T11)**: Fable (`sentry-security-review`) y `/security-review` sin hallazgos HIGH; una observación MEDIUM de diseño (procedencia por coincidencia con cualquier fila histórica) corregida con test (ADR 0030.28).
- **PR a `main`**: pendiente de la confirmación del usuario (F8b-T12), tras rebase sobre `main` con la Fase 8 integrada.
