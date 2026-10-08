import { useQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/dominio/Avatar';
import { Combo, type OpcionCombo } from '@/components/dominio/Combo';
import { usuarios } from '@/features/configuracion/api';
import { claves } from '@/features/tickets/api';

// Personas activas del equipo; la API no pagina (≤ 50 personas).
export function useUsuariosActivos() {
  return useQuery({
    queryKey: claves.usuariosActivos,
    queryFn: () => usuarios({ activo: 'true' }),
    staleTime: 5 * 60_000,
  });
}

type PropsComunes = {
  etiqueta: string;
  /** Ids que no se ofrecen (p. ej. el responsable principal en "Otros"). */
  excluir?: number[] | undefined;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

type Props =
  | (PropsComunes & { multiple: true; valor: number[]; onChange: (valor: number[]) => void })
  | (PropsComunes & {
      multiple?: false;
      valor: number | null;
      onChange: (valor: number | null) => void;
    });

// Lista de personas con búsqueda (`Combo`). `multiple` elige varias; si no, una o ninguna.
export function SelectorPersonas(props: Props) {
  const { etiqueta, excluir, placeholder, disabled, id, className } = props;
  const consulta = useUsuariosActivos();
  const opciones: OpcionCombo<number>[] = (consulta.data ?? [])
    .filter((p) => !excluir?.includes(p.id))
    .map((p) => ({
      valor: p.id,
      etiqueta: p.nombre,
      detalle: p.departamento?.nombre,
      inicio: (
        <Avatar iniciales={p.iniciales} color={p.color_avatar} className="size-6 text-[10px]" />
      ),
    }));
  const comunes = {
    opciones,
    etiqueta,
    placeholder: placeholder ?? (props.multiple ? 'Agregar personas' : 'Elegir persona'),
    placeholderBusqueda: 'Buscar persona…',
    ariaBusqueda: `Buscar ${etiqueta}`,
    textoVacio: 'Nadie coincide con la búsqueda',
    cargando: consulta.isPending,
    disabled,
    id,
    className,
  };

  return props.multiple ? (
    <Combo {...comunes} multiple valor={props.valor} alCambiar={props.onChange} />
  ) : (
    <Combo
      {...comunes}
      valor={props.valor}
      alCambiar={props.onChange}
      textoQuitar="Quitar selección"
      alternar
    />
  );
}
