import { politicaContrasena } from '@zydesk/shared';

// Mismo alfabeto que `generarTemporal()` de la API (spec §5.6): sin caracteres ambiguos.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function aleatorio(max: number): number {
  // rechazo de los valores que sesgarían el módulo
  const limite = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while ((buffer[0] ?? 0) >= limite);
  return (buffer[0] ?? 0) % max;
}

export function generarTemporal(correo: string): string {
  for (;;) {
    const candidata = Array.from({ length: 14 }, () => ALFABETO[aleatorio(ALFABETO.length)]).join(
      '',
    );
    if (politicaContrasena(candidata, correo).ok) return candidata;
  }
}
