# ADR 0006 — Numeración correlativa TK- / OT- / COT-

**Estado**: sustituida parcialmente por ADR 0014 (dígitos e inicial configurables, modo aleatorio para tickets) · 2026-09-29

## Contexto

Códigos `TK-####`, `OT-####`, `COT-#### v1/v2`, correlativos de 4 dígitos con prefijos configurables. Deben ser únicos, sin saltos visibles molestos, y cambiar el prefijo no debe alterar códigos ya emitidos. El diseño arranca en TK-1048 y muestra `COT-0218 v1` para `OT-0218`.

## Opciones consideradas

1. **Secuencias de Postgres** (`nextval`) — sin bloqueos, pero no transaccionales: cada creación fallida deja un hueco en el correlativo.
2. **Tabla contador con `UPDATE … RETURNING` dentro de la transacción de creación** — el `UPDATE` toma el lock de fila, serializa las creaciones del mismo tipo (irrelevante con 10 usuarios) y, si la transacción falla, el número no se consume.
3. `MAX(numero)+1` — carrera clásica; descartada.

## Decisión

Opción 2.

- Tabla `contador(clave text PK, valor int)` con filas `ticket`, `ot`. Servicio `siguienteNumero(tx, clave)`:
  ```sql
  UPDATE contador SET valor = valor + 1 WHERE clave = $1 RETURNING valor;
  ```
  Siempre dentro de la misma `enTransaccion` que inserta la entidad (ADR 0003).
- Cada entidad guarda `numero int` (único por tipo) **y** `codigo text` materializado (`TK-1048`) usando el prefijo vigente en ese momento. El prefijo (Configuración → Tarifas y formatos) solo afecta a los códigos futuros; los antiguos conservan su texto. Formato: prefijo + número con relleno a 4 dígitos (`padStart(4, '0')`); pasado 9999 simplemente crece.
- **Cotización sin contador propio**: su código se deriva de la OT: `COT-` + número de la OT + ` v` + versión (`COT-0218 v2`). Coincide con el diseño y evita una tercera secuencia; la versión es `MAX(version)+1` por OT dentro de la transacción. (Si se prefiere un correlativo independiente, se agrega la fila `cotizacion` al contador; ver preguntas abiertas.)
- Valor inicial de cada contador configurable en la semilla (`TK` desde 1000, `OT` desde 200, por ejemplo) para arrancar con números "de aspecto real" si el equipo quiere continuar una numeración previa.
- Las rutas de la API usan el `id` numérico interno, no el código (`/api/tickets/:id`); el front resuelve `TK-1048` → id vía búsqueda. Así cambiar el prefijo nunca rompe enlaces guardados.

## Consecuencias

- Correlativo sin huecos y sin condiciones de carrera con 5 líneas de SQL.
- Búsqueda por código exacto o por número (`1048`) en la barra de búsqueda, insensible al prefijo.
- No se soporta reiniciar la numeración por año (no lo pide la spec).
