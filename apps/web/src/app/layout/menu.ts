import { tienePermiso, type Permiso, type Rol } from '@zydesk/shared';
import {
  BarChart3,
  Bell,
  Building2,
  Calculator,
  Clock,
  Columns3,
  GanttChart,
  Plus,
  Settings,
  Sun,
  Table,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface EntradaMenu {
  etiqueta: string;
  ruta: string;
  icono: LucideIcon;
  grupo?: 'Tickets' | 'Trabajo' | 'Administración';
  // Si se indica, la entrada solo se muestra a quien tiene el permiso (la ruta se protege aparte).
  permiso?: Permiso;
}

export const MENU: EntradaMenu[] = [
  { etiqueta: 'Nuevo ticket', ruta: '/tickets/nuevo', icono: Plus },
  { etiqueta: 'Mi día', ruta: '/mi-dia', icono: Sun },
  { etiqueta: 'Avisos', ruta: '/avisos', icono: Bell },
  { etiqueta: 'Tablero', ruta: '/tickets', icono: Columns3, grupo: 'Tickets' },
  { etiqueta: 'Tabla', ruta: '/tickets/tabla', icono: Table, grupo: 'Tickets' },
  {
    etiqueta: 'Línea de tiempo',
    ruta: '/tickets/linea-de-tiempo',
    icono: GanttChart,
    grupo: 'Tickets',
  },
  { etiqueta: 'Órdenes de trabajo', ruta: '/ots', icono: Wrench, grupo: 'Trabajo' },
  { etiqueta: 'Cotizador', ruta: '/cotizaciones', icono: Calculator, grupo: 'Trabajo' },
  { etiqueta: 'Horas', ruta: '/horas', icono: Clock, grupo: 'Trabajo' },
  {
    etiqueta: 'Reportes',
    ruta: '/reportes',
    icono: BarChart3,
    grupo: 'Administración',
    permiso: 'reportes.ver',
  },
  { etiqueta: 'Clientes', ruta: '/clientes', icono: Building2, grupo: 'Administración' },
  {
    etiqueta: 'Configuración',
    ruta: '/configuracion',
    icono: Settings,
    grupo: 'Administración',
    permiso: 'config.editar',
  },
  { etiqueta: 'Perfil', ruta: '/perfil', icono: User },
];

// Una entrada se muestra si no exige permiso o si el rol lo tiene (la usan el menú lateral y el panel móvil).
export const visible = (rol: Rol, e: EntradaMenu) => !e.permiso || tienePermiso(rol, e.permiso);
