import { createBrowserRouter, Navigate } from 'react-router';
import { AyudaPage } from '@/features/ayuda/pages/AyudaPage';
import { AvisosPage } from '@/features/avisos/pages/AvisosPage';
import { CambiarContrasenaPage } from '@/features/auth/pages/CambiarContrasenaPage';
import { IngresoPage } from '@/features/auth/pages/IngresoPage';
import { RequierePermiso } from '@/features/auth/RequierePermiso';
import { RequiereSesion } from '@/features/auth/RequiereSesion';
import { RaizSesion } from '@/features/auth/SesionProvider';
import { ClientesPage } from '@/features/clientes/pages/ClientesPage';
import { ConfiguracionPage } from '@/features/configuracion/pages/ConfiguracionPage';
import { CotizacionesPage } from '@/features/cotizador/pages/CotizacionesPage';
import { CotizadorPage } from '@/features/cotizador/pages/CotizadorPage';
import { HorasPage } from '@/features/horas/pages/HorasPage';
import { DocumentoLegalPage } from '@/features/legal/DocumentoLegalPage';
import { MiDiaPage } from '@/features/mi-dia/pages/MiDiaPage';
import { OtDetallePage } from '@/features/ots/pages/OtDetallePage';
import { OtsPage } from '@/features/ots/pages/OtsPage';
import { PerfilPage } from '@/features/perfil/pages/PerfilPage';
import { ReportesPage } from '@/features/reportes/pages/ReportesPage';
import { LineaDeTiempoPage } from '@/features/tickets/pages/LineaDeTiempoPage';
import { NuevoTicketPage } from '@/features/tickets/pages/NuevoTicketPage';
import { TablaPage } from '@/features/tickets/pages/TablaPage';
import { TicketDetallePage } from '@/features/tickets/pages/TicketDetallePage';
import { TableroPage } from '@/features/tickets/pages/TableroPage';
import { Layout } from './layout/Layout';
import { PaginaNoEncontrada } from './PaginaNoEncontrada';

export const router = createBrowserRouter([
  {
    element: <RaizSesion />,
    children: [
      // Públicas (fuera del Layout)
      { path: '/ingresar', element: <IngresoPage /> },
      { path: '/terminos', element: <DocumentoLegalPage clave="terminos" /> },
      { path: '/privacidad', element: <DocumentoLegalPage clave="privacidad" /> },
      // Con sesión
      {
        element: <RequiereSesion />,
        children: [
          { path: '/cambiar-contrasena', element: <CambiarContrasenaPage /> },
          {
            element: <Layout />,
            children: [
              { path: '/', element: <Navigate to="/mi-dia" replace /> },
              { path: '/tickets/nuevo', element: <NuevoTicketPage /> },
              { path: '/mi-dia', element: <MiDiaPage /> },
              { path: '/avisos', element: <AvisosPage /> },
              { path: '/tickets', element: <TableroPage /> },
              { path: '/tickets/tabla', element: <TablaPage /> },
              { path: '/tickets/linea-de-tiempo', element: <LineaDeTiempoPage /> },
              { path: '/tickets/:id', element: <TicketDetallePage /> },
              { path: '/ots', element: <OtsPage /> },
              { path: '/ots/:id', element: <OtDetallePage /> },
              { path: '/cotizaciones', element: <CotizacionesPage /> },
              { path: '/cotizaciones/:id', element: <CotizadorPage /> },
              { path: '/horas', element: <HorasPage /> },
              {
                element: <RequierePermiso permiso="reportes.ver" />,
                children: [{ path: '/reportes', element: <ReportesPage /> }],
              },
              { path: '/clientes', element: <ClientesPage /> },
              { path: '/clientes/:id', element: <ClientesPage /> },
              {
                element: <RequierePermiso permiso="config.editar" />,
                children: [
                  {
                    path: '/configuracion',
                    element: <Navigate to="/configuracion/equipo" replace />,
                  },
                  { path: '/configuracion/:pestana', element: <ConfiguracionPage /> },
                ],
              },
              { path: '/ayuda', element: <Navigate to="/ayuda/primeros-pasos" replace /> },
              { path: '/ayuda/:manual', element: <AyudaPage /> },
              { path: '/perfil', element: <PerfilPage /> },
              { path: '*', element: <PaginaNoEncontrada /> },
            ],
          },
        ],
      },
    ],
  },
]);
