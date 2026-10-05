import { borrarSesiones } from './sesion.js';

export default function globalTeardown(): void {
  borrarSesiones();
}
