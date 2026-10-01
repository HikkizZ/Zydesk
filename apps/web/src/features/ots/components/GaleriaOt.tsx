import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { SubidaArchivos } from '@/components/dominio/SubidaArchivos';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermiso } from '@/features/auth/SesionProvider';
import { agregarArchivos, invalidarOt, type OtDatos } from '@/features/ots/api';
import { avisarErrorOt } from '@/features/ots/errores';
import type { ActividadDatos, ArchivoDatos, TicketDatos } from '@/features/tickets/api';
import {
  etiquetaDeMensaje,
  GaleriaArchivos,
  type ArchivoConOrigen,
} from '@/features/tickets/components/GaleriaArchivos';

type Pestana = 'todo' | 'foto' | 'documento' | 'correo';

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'todo', etiqueta: 'Todo' },
  { valor: 'foto', etiqueta: 'Fotos' },
  { valor: 'documento', etiqueta: 'Documentos' },
  { valor: 'correo', etiqueta: 'Correos' },
];

// Fotos = imágenes; Correos = categoría `correo`; Documentos = el resto.
export function pestanaDe(a: ArchivoDatos): Exclude<Pestana, 'todo'> {
  if (a.categoria === 'correo') return 'correo';
  if (a.es_imagen || a.categoria === 'foto') return 'foto';
  return 'documento';
}

// Galería compuesta en el front (spec §5): propios de la OT, de sus mensajes y del ticket de origen.
export function archivosDeOt(
  ot: OtDatos,
  ticket: TicketDatos | undefined,
  items: ActividadDatos['items'],
): ArchivoConOrigen[] {
  const vistos = new Set<number>();
  const lista: ArchivoConOrigen[] = [];
  const agregar = (archivo: ArchivoDatos, etiqueta?: string) => {
    if (vistos.has(archivo.id)) return;
    vistos.add(archivo.id);
    lista.push(etiqueta ? { archivo, etiqueta } : { archivo });
  };
  for (const a of ot.archivos) {
    agregar(a, a.id === ot.aprobacion?.archivo.id ? 'respaldo de aprobación' : undefined);
  }
  for (const item of items) {
    if (item.tipo !== 'mensaje') continue;
    for (const a of item.mensaje.archivos) {
      agregar(a, etiquetaDeMensaje(item.mensaje.tipo, item.mensaje.creado_en));
    }
  }
  if (ticket) {
    const desde = `desde ${ot.ticket.codigo}`;
    if (ticket.correo?.archivo) agregar(ticket.correo.archivo, desde);
    for (const a of ticket.correo?.adjuntos ?? []) agregar(a, desde);
    for (const a of ticket.archivos) agregar(a, desde);
  }
  return lista;
}

export function GaleriaOt({ ot, archivos }: { ot: OtDatos; archivos: ArchivoConOrigen[] }) {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso('tickets.editar');
  const [pestana, setPestana] = useState<Pestana>('todo');
  const final = ot.etapa === 'cerrada' || ot.etapa === 'cancelada';

  const refrescar = () => invalidarOt(queryClient, ot.id, ot.ticket.id);
  const asociar = useMutation({
    mutationFn: (ids: number[]) => agregarArchivos(ot.id, { archivo_ids: ids }),
    onSuccess: async (_, ids) => {
      toast.success(ids.length === 1 ? 'Archivo agregado' : `${ids.length} archivos agregados`);
      await refrescar();
    },
    onError: (err) => avisarErrorOt(err, refrescar),
  });

  const visibles = archivos.filter((x) => pestana === 'todo' || pestanaDe(x.archivo) === pestana);
  const cuenta = (p: Pestana) =>
    p === 'todo' ? archivos.length : archivos.filter((x) => pestanaDe(x.archivo) === p).length;

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
        <TabsList variant="line" className="h-auto w-full justify-start overflow-x-auto">
          {PESTANAS.map((p) => (
            <TabsTrigger key={p.valor} value={p.valor} className="min-h-11 flex-none px-3">
              {p.etiqueta} ({cuenta(p.valor)})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <GaleriaArchivos archivos={visibles} />
      {puedeEditar && !final ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          {/* Cada archivo se sube (paso 1) y se asocia a la OT (paso 2) apenas está listo. */}
          <SubidaArchivos
            compacto
            etiquetaFotos="Subir fotos"
            etiquetaArchivo="Subir archivo"
            archivos={[]}
            onChange={(subidos) => {
              if (subidos.length > 0) asociar.mutate(subidos.map((a) => a.id));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
