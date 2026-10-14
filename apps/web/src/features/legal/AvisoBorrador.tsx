import { Chip } from '@/components/dominio/Chip';

// Aviso de los documentos legales que aún son borrador (pendiente E3).
export function AvisoBorrador() {
  return (
    <p role="note" className="my-3 flex flex-wrap items-center gap-2 text-sm text-tinta-2">
      <Chip tono="suave-atento">Borrador</Chip>
      Pendiente de revisión
    </p>
  );
}
