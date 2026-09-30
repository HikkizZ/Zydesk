import type { ReactNode } from 'react';
import { Pie } from '@/app/layout/Pie';

// Tarjeta centrada de las pantallas fuera del Layout (cambiar contraseña); el ingreso usa su propio diseño.
export function PantallaAuth({ nombreApp, children }: { nombreApp: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-lg border border-borde bg-superficie p-6 sm:p-8">
        {children}
      </div>
      <Pie nombreApp={nombreApp} />
    </div>
  );
}
