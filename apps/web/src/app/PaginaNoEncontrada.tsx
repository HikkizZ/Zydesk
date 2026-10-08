import { Link } from 'react-router';
import { EstadoVacio } from '@/components/dominio/EstadoVacio';
import { CabeceraPagina } from './CabeceraPagina';

export function PaginaNoEncontrada() {
  return (
    <>
      <CabeceraPagina titulo="Página no encontrada" />
      <EstadoVacio
        titulo="No encontramos esta página"
        descripcion="La dirección no existe o ya no está disponible."
        accion={
          <Link
            to="/mi-dia"
            className="inline-flex min-h-11 items-center text-sm text-acento underline-offset-2 hover:underline lg:min-h-0"
          >
            Volver a Mi día
          </Link>
        }
      />
    </>
  );
}
