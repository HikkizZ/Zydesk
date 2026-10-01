import { ETIQUETA_ESPERA_DE, type EsperaDe, type EventoTicketSalida } from '@zydesk/shared';
import type { z } from 'zod';

export type EventoDatos = z.infer<typeof EventoTicketSalida>;

export interface DescripcionEvento {
  /** Frase sin el nombre de quien la hizo: "cambió el estado". */
  texto: string;
  /** Chip `anterior → nuevo` de los cambios. */
  cambio?: string;
  /** Segunda línea (motivo de descarte, ticket original). */
  detalle?: string;
}

const CAMPOS: Record<string, string> = {
  estado: 'el estado',
  asunto: 'el asunto',
  descripcion: 'la descripción',
  cliente: 'el cliente',
  solicitante: 'el solicitante',
  origen: 'el origen',
  prioridad: 'la prioridad',
  categoria: 'la categoría',
  inicio_planificado: 'el inicio planificado',
  fecha_limite: 'la fecha límite',
  horas_estimadas: 'las horas estimadas',
  responsable_principal: 'el responsable principal',
  responsables: 'los responsables',
  seguidores: 'los seguidores',
};

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function tituloDeTarea(e: EventoDatos): string {
  const titulo = texto(e.datos?.['titulo']);
  return titulo ? `«${titulo}»` : '';
}

function codigoDeOt(valor: unknown): string | null {
  if (typeof valor !== 'object' || valor === null) return null;
  return texto((valor as Record<string, unknown>)['codigo']);
}

const conTarea = (frase: string, e: EventoDatos) => `${frase} ${tituloDeTarea(e)}`.trim();

function describirCambio(e: EventoDatos): DescripcionEvento {
  const campo = e.campo ?? '';
  const frase = CAMPOS[campo] ?? campo;
  const datos = e.datos ?? {};
  let nuevo = e.valor_nuevo;
  const detalle: string[] = [];

  if (campo === 'estado') {
    const esperaDe = texto(datos['espera_de']) as EsperaDe | null;
    if (esperaDe) nuevo = `${nuevo ?? 'En espera'} · ${ETIQUETA_ESPERA_DE[esperaDe] ?? esperaDe}`;
    const espera = texto(datos['espera_detalle']);
    if (espera) detalle.push(espera);
    const motivo = texto(datos['motivo']);
    if (motivo) detalle.push(motivo);
    const original = texto(datos['duplicado_de_codigo']);
    if (original) detalle.push(`Duplicado de ${original}`);
  }

  return {
    texto: `cambió ${frase}`.trim(),
    cambio: `${e.valor_anterior ?? '—'} → ${nuevo ?? '—'}`,
    ...(detalle.length > 0 ? { detalle: detalle.join(' · ') } : {}),
  };
}

// Frase del historial de un ticket. La persona que lo hizo se muestra aparte (`autor`).
export function describirEvento(e: EventoDatos): DescripcionEvento {
  switch (e.accion) {
    case 'creado':
      return {
        texto:
          e.datos?.['desde_correo'] === true
            ? 'creó el ticket desde un correo adjunto'
            : 'creó el ticket',
      };
    case 'cambio':
      return describirCambio(e);
    case 'tarea_creada':
      return { texto: conTarea('agregó la tarea', e) };
    case 'tarea_hecha':
      return { texto: conTarea('marcó hecha la tarea', e) };
    case 'tarea_reabierta':
      return { texto: conTarea('reabrió la tarea', e) };
    case 'tarea_quitada':
      return { texto: conTarea('quitó la tarea', e) };
    case 'tarea_editada':
      return { texto: conTarea('editó la tarea', e) };
    case 'convertido_en_ot': {
      const desde = codigoDeOt(e.datos?.['desde_ot']);
      return {
        texto: 'convirtió el ticket en',
        cambio: e.valor_nuevo ?? texto(e.datos?.['codigo']) ?? 'OT',
        ...(desde ? { detalle: `A partir de ${desde}` } : {}),
      };
    }
    case 'ot_cerrada': {
      const codigo = texto(e.datos?.['codigo']) ?? 'la OT';
      const resumen = texto(e.datos?.['resumen']);
      const resolvio = e.datos?.['resolvio_ticket'] === true;
      return {
        texto: 'cerró',
        cambio: `${codigo} · ${resolvio ? 'resolvió' : 'no resolvió'} el ticket`,
        ...(resumen
          ? { detalle: resumen.length > 120 ? `${resumen.slice(0, 119)}…` : resumen }
          : {}),
      };
    }
    case 'ot_cancelada': {
      const motivo = texto(e.datos?.['motivo']);
      return {
        texto: `canceló ${texto(e.datos?.['codigo']) ?? 'la OT'}`,
        ...(motivo ? { detalle: motivo } : {}),
      };
    }
    case 'seguimiento_copiado':
      return {
        texto: `copió un seguimiento desde ${texto(e.datos?.['codigo']) ?? 'la OT'}`,
      };
    case 'archivado':
      return { texto: 'El sistema archivó el ticket' };
    default:
      return { texto: e.accion.replaceAll('_', ' ') };
  }
}
