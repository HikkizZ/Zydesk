import { createBrowserRouter, Navigate } from 'react-router';
import { AvisosPage } from '@/features/avisos/pages/AvisosPage';
import { ClientesPage } from '@/features/clientes/pages/ClientesPage';
import { ConfiguracionPage } from '@/features/configuracion/pages/ConfiguracionPage';
import { CotizadorPage } from '@/features/cotizador/pages/CotizadorPage';
import { HorasPage } from '@/features/horas/pages/HorasPage';
import { MiDiaPage } from '@/features/mi-dia/pages/MiDiaPage';
import { OtsPage } from '@/features/ots/pages/OtsPage';
import { PerfilPage } from '@/features/perfil/pages/PerfilPage';
import { ReportesPage } from '@/features/reportes/pages/ReportesPage';
import { LineaDeTiempoPage } from '@/features/tickets/pages/LineaDeTiempoPage';
import { NuevoTicketPage } from '@/features/tickets/pages/NuevoTicketPage';
import { TablaPage } from '@/features/tickets/pages/TablaPage';
import { TableroPage } from '@/features/tickets/pages/TableroPage';
import { Layout } from './layout/Layout';
import { PaginaNoEncontrada } from './PaginaNoEncontrada';

export const router = createBrowserRouter([
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
      { path: '/ots', element: <OtsPage /> },
      { path: '/cotizaciones', element: <CotizadorPage /> },
      { path: '/horas', element: <HorasPage /> },
      { path: '/reportes', element: <ReportesPage /> },
      { path: '/clientes', element: <ClientesPage /> },
      { path: '/configuracion', element: <ConfiguracionPage /> },
      { path: '/perfil', element: <PerfilPage /> },
      { path: '*', element: <PaginaNoEncontrada /> },
    ],
  },
]);
