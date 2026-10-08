import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { hoyIso } from '@/components/dominio/formato-fecha';
import { useUsuariosActivos } from '@/components/dominio/SelectorPersonas';
import { Combo } from '@/components/dominio/Combo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { departamentos } from '@/features/configuracion/api';
import { useClientesActivos } from '@/features/tickets/components/SelectorCliente';
import type { ReporteSalidaDatos } from '../api';
import {
  PRESETS_PERIODO,
  presetDeParams,
  rangoDePreset,
  sumarDias,
  type PresetPeriodo,
} from '../filtros';

interface Opcion {
  id: number;
  nombre: string;
}

// Un filtro de lista con búsqueda: «Todos» (sin selección) + opciones activas (+ la elegida aunque esté
// inactiva, p. ej. desde la URL).
function SelectorFiltro({
  etiqueta,
  todos,
  valor,
  opciones,
  actual,
  onCambiar,
}: {
  etiqueta: string;
  todos: string;
  valor: string | null;
  opciones: Opcion[];
  actual: Opcion | null | undefined;
  onCambiar: (id: string | null) => void;
}) {
  const lista = [...opciones];
  if (actual && !lista.some((o) => o.id === actual.id)) lista.push(actual);
  const id = `filtro-${etiqueta.toLowerCase()}`;
  const numero = valor === null ? null : Number(valor);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Combo
        id={id}
        etiqueta={etiqueta}
        placeholder={todos}
        className="sm:w-52"
        opciones={lista.map((o) => ({ valor: o.id, etiqueta: o.nombre }))}
        valor={numero !== null && Number.isFinite(numero) ? numero : null}
        textoQuitar={todos}
        alCambiar={(v) => onCambiar(v === null ? null : String(v))}
      />
    </div>
  );
}

// Barra de filtros de la pantalla 14: el estado vive en la URL (`params`), ADR 0011.
export function FiltrosReportes({
  params,
  resueltos,
  onCambiar,
  onExportar,
}: {
  params: URLSearchParams;
  /** Filtros ya resueltos por la API; dan el rango de «Personalizado» y los nombres de ids inactivos. */
  resueltos: ReporteSalidaDatos['filtros'] | undefined;
  onCambiar: (cambios: Record<string, string | null>) => void;
  onExportar: () => void;
}) {
  const hoy = hoyIso();
  const [forzarPersonalizado, setForzarPersonalizado] = useState(false);
  const preset: PresetPeriodo = forzarPersonalizado ? 'personalizado' : presetDeParams(params, hoy);

  const deps = useQuery({ queryKey: ['departamentos'], queryFn: departamentos });
  const clientes = useClientesActivos();
  const usuarios = useUsuariosActivos();

  const elegirPreset = (valor: string) => {
    const p = valor as PresetPeriodo;
    setForzarPersonalizado(p === 'personalizado');
    if (p === 'personalizado') {
      // Parte del rango que se está viendo, para que las dos fechas aparezcan llenas.
      onCambiar({
        desde: params.get('desde') ?? resueltos?.desde ?? hoy.slice(0, 8) + '01',
        hasta: params.get('hasta') ?? resueltos?.hasta ?? hoy,
      });
      return;
    }
    const r = rangoDePreset(p, hoy);
    onCambiar({ desde: r.desde ?? null, hasta: r.hasta ?? null });
  };

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filtro-periodo">Período</Label>
          <Select value={preset} onValueChange={elegirPreset}>
            <SelectTrigger id="filtro-periodo" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS_PERIODO.map((p) => (
                <SelectItem key={p.valor} value={p.valor}>
                  {p.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {preset === 'personalizado' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filtro-desde">Desde</Label>
              <Input
                id="filtro-desde"
                type="date"
                max={sumarDias(hoy, 366)}
                value={params.get('desde') ?? ''}
                onChange={(e) => onCambiar({ desde: e.target.value || null })}
                className="w-full sm:w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filtro-hasta">Hasta</Label>
              <Input
                id="filtro-hasta"
                type="date"
                max={sumarDias(hoy, 366)}
                value={params.get('hasta') ?? ''}
                onChange={(e) => onCambiar({ hasta: e.target.value || null })}
                className="w-full sm:w-40"
              />
            </div>
          </>
        ) : null}
        <SelectorFiltro
          etiqueta="Departamento"
          todos="Todos"
          valor={params.get('departamento')}
          opciones={(deps.data ?? []).map((d) => ({ id: d.id, nombre: d.nombre }))}
          actual={resueltos?.departamento}
          onCambiar={(id) => onCambiar({ departamento: id })}
        />
        <SelectorFiltro
          etiqueta="Cliente"
          todos="Todos"
          valor={params.get('cliente')}
          opciones={(clientes.data ?? []).map((c) => ({
            id: c.id,
            nombre: c.es_interno ? `${c.nombre} · interno` : c.nombre,
          }))}
          actual={resueltos?.cliente}
          onCambiar={(id) => onCambiar({ cliente: id })}
        />
        <SelectorFiltro
          etiqueta="Persona"
          todos="Todas"
          valor={params.get('usuario')}
          opciones={(usuarios.data ?? []).map((u) => ({ id: u.id, nombre: u.nombre }))}
          actual={resueltos?.usuario}
          onCambiar={(id) => onCambiar({ usuario: id })}
        />
        <Button type="button" variant="outline" onClick={onExportar} className="sm:ml-auto">
          <Download aria-hidden="true" />
          Exportar (.xlsx)
        </Button>
      </div>
    </div>
  );
}
