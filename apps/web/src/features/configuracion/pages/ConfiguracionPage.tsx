import { TituloPagina } from '@/app/TituloPagina';
import { EstadoSistema } from '@/features/salud/EstadoSistema';

export function ConfiguracionPage() {
  return (
    <>
      <TituloPagina titulo="Configuración" />
      <p className="mt-2 text-tinta-2">Pendiente (Fase 1)</p>
      <div className="mt-6 max-w-xl">
        <EstadoSistema />
      </div>
    </>
  );
}
