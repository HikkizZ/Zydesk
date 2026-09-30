import { Link } from 'react-router';

export function SinPermiso() {
  return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p>No tienes permiso para ver esta sección</p>
      <Link to="/mi-dia" className="text-acento underline underline-offset-2">
        Ir a Mi día
      </Link>
    </div>
  );
}
