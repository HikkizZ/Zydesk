import { Navigate, useNavigate, useParams } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CategoriasTab } from '../CategoriasTab';
import { DepartamentosTab } from '../DepartamentosTab';
import { EquipoTab } from '../EquipoTab';
import { IngresosTab } from '../IngresosTab';
import { NumeracionTab } from '../NumeracionTab';

const PESTANAS = [
  { clave: 'equipo', etiqueta: 'Equipo y permisos' },
  { clave: 'departamentos', etiqueta: 'Departamentos y horarios' },
  { clave: 'categorias', etiqueta: 'Categorías y plazos' },
  { clave: 'numeracion', etiqueta: 'Numeración y marca' },
] as const;

const DESHABILITADAS = [
  { clave: 'tarifas', etiqueta: 'Tarifas' },
  { clave: 'plantillas', etiqueta: 'Plantillas' },
] as const;

type Pestana = (typeof PESTANAS)[number]['clave'] | 'ingresos';

function esPestana(valor: string | undefined): valor is Pestana {
  return valor === 'ingresos' || PESTANAS.some((p) => p.clave === valor);
}

export function ConfiguracionPage() {
  const { pestana } = useParams();
  const navigate = useNavigate();

  // `tarifas` y `plantillas` (Fase 4) y cualquier otra ruta desconocida vuelven a Equipo.
  if (!esPestana(pestana)) return <Navigate to="/configuracion/equipo" replace />;
  const ir = (clave: string) => void navigate(`/configuracion/${clave}`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <TituloPagina titulo="Configuración" />
        <p className="mt-1 text-tinta-2">
          Solo las personas con rol Administración pueden cambiar esta sección
        </p>
      </div>

      {pestana === 'ingresos' ? null : (
        <>
          <div className="hidden lg:block">
            <Tabs value={pestana} onValueChange={ir}>
              <TabsList>
                {PESTANAS.map((p) => (
                  <TabsTrigger key={p.clave} value={p.clave}>
                    {p.etiqueta}
                  </TabsTrigger>
                ))}
                {DESHABILITADAS.map((p) => (
                  <Tooltip key={p.clave}>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <TabsTrigger value={p.clave} disabled>
                          {p.etiqueta}
                        </TabsTrigger>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Fase 4</TooltipContent>
                  </Tooltip>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="lg:hidden">
            <Select value={pestana} onValueChange={ir}>
              <SelectTrigger aria-label="Sección de configuración" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PESTANAS.map((p) => (
                  <SelectItem key={p.clave} value={p.clave}>
                    {p.etiqueta}
                  </SelectItem>
                ))}
                {DESHABILITADAS.map((p) => (
                  <SelectItem key={p.clave} value={p.clave} disabled>
                    {p.etiqueta} (Fase 4)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {pestana === 'equipo' ? <EquipoTab /> : null}
      {pestana === 'departamentos' ? <DepartamentosTab /> : null}
      {pestana === 'categorias' ? <CategoriasTab /> : null}
      {pestana === 'numeracion' ? <NumeracionTab /> : null}
      {pestana === 'ingresos' ? <IngresosTab /> : null}
    </div>
  );
}
