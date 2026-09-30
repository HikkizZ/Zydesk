import { useNavigate } from 'react-router';
import { TituloPagina } from '@/app/TituloPagina';
import { FormularioCambiarContrasena } from '../FormularioCambiarContrasena';
import { PantallaAuth } from '../PantallaAuth';
import { useYo } from '../SesionProvider';

export function CambiarContrasenaPage() {
  const yo = useYo();
  const navigate = useNavigate();
  return (
    <PantallaAuth nombreApp={yo.nombre_app}>
      <TituloPagina titulo="Cambiar contraseña" />
      {yo.debe_cambiar_contrasena ? (
        <p className="mb-4 mt-2 text-sm text-tinta-2">
          Tu contraseña fue restablecida por Administración. Elige una nueva para continuar.
        </p>
      ) : (
        <div className="mb-4" />
      )}
      <FormularioCambiarContrasena alExito={() => void navigate('/mi-dia', { replace: true })} />
    </PantallaAuth>
  );
}
