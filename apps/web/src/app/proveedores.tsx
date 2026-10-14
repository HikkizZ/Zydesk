import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { DatosMigas } from './migas';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } },
});

// Estado de la barra superior (§6.3). Dos contextos: las páginas solo usan los fijadores (estables),
// así publicar migas o la acción no las vuelve a renderizar; solo `BarraSuperior` lee el estado.
interface EstadoBarra {
  datos: DatosMigas;
  accion: ReactNode;
}
interface Fijadores {
  fijarDatos: (datos: DatosMigas) => void;
  fijarAccion: (accion: ReactNode) => void;
}

const EstadoBarraContext = createContext<EstadoBarra>({ datos: {}, accion: null });
const FijadoresContext = createContext<Fijadores>({ fijarDatos: () => {}, fijarAccion: () => {} });

export function MigasProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<DatosMigas>({});
  const [accion, setAccion] = useState<ReactNode>(null);
  const fijadores = useMemo<Fijadores>(
    () => ({ fijarDatos: setDatos, fijarAccion: setAccion }),
    [],
  );
  const estado = useMemo(() => ({ datos, accion }), [datos, accion]);
  return (
    <FijadoresContext.Provider value={fijadores}>
      <EstadoBarraContext.Provider value={estado}>{children}</EstadoBarraContext.Provider>
    </FijadoresContext.Provider>
  );
}

export const useEstadoBarra = () => useContext(EstadoBarraContext);

// La página publica el código o el nombre de la entidad abierta cuando ya tiene los datos.
export function useMigas({ codigo, nombre }: DatosMigas) {
  const { fijarDatos } = useContext(FijadoresContext);
  useEffect(() => {
    fijarDatos({ codigo, nombre });
    return () => fijarDatos({});
  }, [fijarDatos, codigo, nombre]);
}

// La página registra su acción principal en la barra superior (solo desde `lg`).
export function useAccionBarra(accion: ReactNode) {
  const { fijarAccion } = useContext(FijadoresContext);
  useEffect(() => {
    fijarAccion(accion);
    return () => fijarAccion(null);
  }, [fijarAccion, accion]);
}

export function Proveedores({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MigasProvider>{children}</MigasProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
