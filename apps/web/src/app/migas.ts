import { matchPath } from 'react-router';
import { manualPorClave } from '@/features/ayuda/manuales';

export interface Miga {
  etiqueta: string;
  ruta?: string;
  mono?: boolean;
}

// Datos que publica cada página con `useMigas` (código o nombre de la entidad abierta).
export interface DatosMigas {
  codigo?: string | undefined;
  nombre?: string | undefined;
}

const PESTANAS_CONFIGURACION: Record<string, string> = {
  equipo: 'Equipo y permisos',
  departamentos: 'Departamentos y horarios',
  categorias: 'Categorías y plazos',
  numeracion: 'Numeración y marca',
  tarifas: 'Tarifas',
  plantillas: 'Plantillas',
  ingresos: 'Ingresos',
};

const PENDIENTE = '…';

// Migas de una ruta de `router.tsx` (§6.3). Los niveles sin ruta propia no llevan `ruta`.
export function migasDe(pathname: string, datos: DatosMigas = {}): Miga[] {
  const ruta = (patron: string) => matchPath({ path: patron, end: true }, pathname);
  const codigo = { etiqueta: datos.codigo ?? PENDIENTE, mono: true };

  if (ruta('/mi-dia')) return [{ etiqueta: 'Mi día' }];
  if (ruta('/tickets')) return [{ etiqueta: 'Tickets' }, { etiqueta: 'Tablero' }];
  if (ruta('/tickets/tabla')) return [{ etiqueta: 'Tickets' }, { etiqueta: 'Tabla' }];
  if (ruta('/tickets/linea-de-tiempo')) {
    return [{ etiqueta: 'Tickets' }, { etiqueta: 'Línea de tiempo' }];
  }
  if (ruta('/tickets/nuevo')) return [{ etiqueta: 'Tickets' }, { etiqueta: 'Nuevo ticket' }];
  if (ruta('/tickets/:id')) return [{ etiqueta: 'Tickets', ruta: '/tickets' }, codigo];
  if (ruta('/ots')) return [{ etiqueta: 'Trabajo' }, { etiqueta: 'Órdenes de trabajo' }];
  if (ruta('/ots/:id')) return [{ etiqueta: 'Órdenes de trabajo', ruta: '/ots' }, codigo];
  if (ruta('/cotizaciones')) return [{ etiqueta: 'Trabajo' }, { etiqueta: 'Cotizador' }];
  if (ruta('/cotizaciones/:id')) return [{ etiqueta: 'Cotizador', ruta: '/cotizaciones' }, codigo];
  if (ruta('/horas')) return [{ etiqueta: 'Trabajo' }, { etiqueta: 'Horas' }];
  if (ruta('/reportes')) return [{ etiqueta: 'Administración' }, { etiqueta: 'Reportes' }];
  if (ruta('/clientes')) return [{ etiqueta: 'Administración' }, { etiqueta: 'Clientes' }];
  if (ruta('/clientes/:id')) {
    return [{ etiqueta: 'Clientes', ruta: '/clientes' }, { etiqueta: datos.nombre ?? PENDIENTE }];
  }
  const config = ruta('/configuracion/:pestana');
  if (config) {
    return [
      { etiqueta: 'Administración' },
      { etiqueta: 'Configuración' },
      { etiqueta: PESTANAS_CONFIGURACION[config.params.pestana ?? ''] ?? PENDIENTE },
    ];
  }
  if (ruta('/avisos')) return [{ etiqueta: 'Avisos' }];
  if (ruta('/perfil')) return [{ etiqueta: 'Perfil' }];
  const manual = ruta('/ayuda/:manual');
  if (manual) {
    return [
      { etiqueta: 'Ayuda' },
      { etiqueta: manualPorClave(manual.params.manual)?.titulo ?? PENDIENTE },
    ];
  }
  return [];
}
