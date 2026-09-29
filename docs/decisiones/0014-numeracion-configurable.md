# ADR 0014 — Numeración configurable: prefijo, inicial, dígitos y modo aleatorio para tickets

**Estado**: aceptada · 2026-09-29 · sustituye parcialmente a ADR 0006 (formato fijo de 4 dígitos, inicial solo en la semilla, correlativo único para tickets)

## Contexto

ADR 0006 fija 4 dígitos y el valor inicial en la semilla. El usuario decidió (2026-09-29) que Administración configure prefijo, número inicial y cantidad de dígitos desde la app, y que los **tickets** puedan numerarse de forma **aleatoria** (para no exponer el volumen de trabajo en códigos visibles a clientes). OT y COT no cambian de naturaleza.

## Decisión

**Configuración** en Configuración → Tarifas/numeración, una fila por tipo en `contador`:

```
contador(clave text PK, prefijo text, inicial int, digitos int, modo text, valor int)
  clave ∈ {ticket, ot} · modo ∈ {correlativo, aleatorio} (solo `ticket` admite aleatorio)
```

- **Prefijo**: libre (`TK-`, `OT-`); solo afecta a códigos futuros (ADR 0006).
- **Dígitos**: 3–8. Formato = prefijo + número con relleno a `digitos`; un correlativo que supere `10^digitos − 1` simplemente crece, como en 0006.
- **Inicial**: primer número que se emitirá. Guardar la configuración es **rechazado** (400 `NUMERACION_INICIAL_MENOR`) si `inicial` ≤ último número ya usado de ese tipo (`MAX(numero)`), y (400 `NUMERACION_DIGITOS_INSUFICIENTES`) si algún número existente no cabe en `digitos`. Nunca se renumera nada.
- **Modo `correlativo`** (OT siempre; tickets por defecto): `UPDATE contador SET valor = valor + 1 … RETURNING valor` dentro de la transacción de creación, igual que 0006. Al cambiar `inicial`, `valor = inicial − 1`.
- **Modo `aleatorio`** (solo tickets): número uniforme en `[inicial, 10^digitos − 1]` con `crypto.randomInt`, dentro de la misma transacción: `SELECT` de existencia, hasta 5 reintentos ante colisión; la restricción `UNIQUE(numero)` es la red final (si aun así choca, la creación falla y el cliente reintenta). Si se han usado más del **95 %** del rango, la creación responde 409 `NUMERACION_AGOTADA` y Administración debe aumentar los dígitos. La pantalla de configuración muestra "usados / capacidad" y una **advertencia** desde el 50 %.
- **Orden cronológico** siempre por `creado_en`, nunca por `numero`: listados, Kanban, línea de tiempo y "siguiente/anterior" ordenan por fecha. `numero` solo identifica.
- **Cambio de modo**: correlativo → aleatorio es inmediato. Aleatorio → correlativo fija `valor = MAX(numero)` para no reutilizar números.
- **OT**: siempre correlativa. **COT**: siempre derivada de su OT (`COT-0218 v1`, ADR 0006); no tiene fila en `contador` ni configuración propia salvo el prefijo `COT-`.
- **Auditoría**: cada guardado de numeración emite un `Evento` (`entidad = 'contador'`, `entidad_id = clave`, `accion = 'numeracion_cambiada'`, `valor_anterior/valor_nuevo` con la configuración legible), reutilizando `registrarEvento` de ADR 0003. Se ve en Configuración → "Historial de cambios de numeración".

**Semilla**: `ticket` → `TK-`, inicial 1000, 4 dígitos, correlativo; `ot` → `OT-`, inicial 200, 4 dígitos.

## Consecuencias

- Búsqueda por código o número sigue funcionando igual (0006): el número es único por tipo en cualquier modo.
- En modo aleatorio dos tickets consecutivos no tienen números cercanos; el equipo debe apoyarse en fechas y filtros, no en el número, para saber "cuál es más nuevo" (la UI ya lo hace).
- Cambiar dígitos a un valor mayor no altera códigos emitidos: `TK-1048` sigue siendo `TK-1048` aunque los nuevos sean `TK-001049`.
- `contador` pasa a ser configuración y, a diferencia del resto de Configuración, **sí** se audita (excepción explícita a ADR 0003).
