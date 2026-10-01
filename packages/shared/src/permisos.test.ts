import { describe, expect, it } from 'vitest';
import { ROLES } from './enums/rol.js';
import { MATRIZ_VISIBLE, PERMISOS, PERMISOS_POR_ROL, tienePermiso } from './permisos.js';

// Tabla de la spec funcional §2: [fila] → roles con ✓ (admin, coordinacion, tecnico, lectura)
const ESPERADO: Record<string, [boolean, boolean, boolean, boolean]> = {
  'Crear y editar tickets': [true, true, true, false],
  'Registrar seguimiento y notas': [true, true, true, false],
  'Asignar responsables': [true, true, true, false],
  'Convertir ticket en OT': [true, true, true, false],
  'Aprobar cotizaciones y OT internas': [true, true, false, false],
  'Cerrar OT': [true, true, false, false],
  'Marcar OT como facturada': [true, true, false, false],
  'Ver reportes y montos': [true, true, false, true],
  'Cambiar configuración': [true, false, false, false],
  'Ver horas de todo el equipo': [true, true, false, false],
};

describe('permisos', () => {
  it('tecnico no tiene config.editar; lectura solo reportes.ver; admin todos', () => {
    expect(tienePermiso('tecnico', 'config.editar')).toBe(false);
    expect(PERMISOS_POR_ROL.lectura).toEqual(['reportes.ver']);
    for (const p of PERMISOS) expect(tienePermiso('admin', p)).toBe(true);
  });

  it('horas.ver_todas: admin y coordinación sí; técnico y lectura no', () => {
    expect(tienePermiso('coordinacion', 'horas.ver_todas')).toBe(true);
    expect(tienePermiso('tecnico', 'horas.ver_todas')).toBe(false);
    expect(tienePermiso('lectura', 'horas.ver_todas')).toBe(false);
  });

  it('MATRIZ_VISIBLE tiene 10 filas y reproduce la tabla de la spec §2', () => {
    expect(MATRIZ_VISIBLE).toHaveLength(10);
    for (const fila of MATRIZ_VISIBLE) {
      const esperado = ESPERADO[fila.etiqueta];
      expect(esperado, fila.etiqueta).toBeDefined();
      expect(ROLES.map((r) => tienePermiso(r, fila.permiso))).toEqual(esperado);
    }
  });
});
