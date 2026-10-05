import { Link } from 'react-router';

// Pie global: dentro de <main> al final y también en la pantalla de ingreso.
export function Pie({ nombreApp, className }: { nombreApp: string; className?: string }) {
  return (
    <footer className={`mt-10 text-sm text-tinta-2 ${className ?? ''}`}>
      {nombreApp} ·{' '}
      <Link
        to="/terminos"
        className="inline-flex min-h-11 items-center underline underline-offset-2 lg:min-h-0"
      >
        Términos de uso
      </Link>{' '}
      ·{' '}
      <Link
        to="/privacidad"
        className="inline-flex min-h-11 items-center underline underline-offset-2 lg:min-h-0"
      >
        Privacidad
      </Link>
    </footer>
  );
}
