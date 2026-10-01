import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

// Búsqueda `q`: escribe en la URL (vía `onCambio`) tras 300 ms sin teclear.
export function BuscadorOts({
  valor,
  onCambio,
  etiqueta = 'Buscar órdenes de trabajo',
  placeholder = 'Buscar por código, título, ticket o cliente',
}: {
  valor: string;
  onCambio: (q: string) => void;
  etiqueta?: string;
  placeholder?: string;
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
      aria-label={etiqueta}
      placeholder={placeholder}
      value={busqueda}
      onChange={(e) => setBusqueda(e.target.value)}
      className="h-11 w-full sm:w-80 lg:h-9"
    />
  );
}
