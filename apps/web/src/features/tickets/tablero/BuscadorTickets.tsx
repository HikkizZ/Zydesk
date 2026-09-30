import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Búsqueda `q` de las pantallas de tickets: escribe en la URL (vía `onCambio`) tras 300 ms sin teclear.
export function BuscadorTickets({
  valor,
  onCambio,
  className,
}: {
  valor: string;
  onCambio: (q: string) => void;
  className?: string;
}) {
  const [busqueda, setBusqueda] = useState(valor);
  // Si la URL cambia desde fuera (atrás/adelante, quitar filtros), el campo la sigue.
  const [valorPrevio, setValorPrevio] = useState(valor);
  if (valor !== valorPrevio) {
    setValorPrevio(valor);
    if (busqueda.trim() !== valor) setBusqueda(valor);
  }
  useEffect(() => {
    if (busqueda.trim() === valor) return;
    const espera = setTimeout(() => onCambio(busqueda.trim()), 300);
    return () => clearTimeout(espera);
  }, [busqueda, valor, onCambio]);

  return (
    <Input
      type="search"
      autoComplete="off"
      aria-label="Buscar tickets"
      placeholder="Buscar por código, asunto o solicitante"
      value={busqueda}
      onChange={(e) => setBusqueda(e.target.value)}
      className={cn('h-11 w-full sm:w-72 lg:h-9', className)}
    />
  );
}
