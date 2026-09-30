import { Link } from 'react-router';

// Pie global: dentro de <main> al final y también en la pantalla de ingreso.
export function Pie({ nombreApp, className }: { nombreApp: string; className?: string }) {
  return (
    <footer className={`mt-10 text-sm text-tinta-2 ${className ?? ''}`}>
      {nombreApp} ·{' '}
      <Link to="/terminos" className="underline underline-offset-2">
        Términos de uso
      </Link>{' '}
      ·{' '}
      <Link to="/privacidad" className="underline underline-offset-2">
        Privacidad
      </Link>
    </footer>
  );
}
