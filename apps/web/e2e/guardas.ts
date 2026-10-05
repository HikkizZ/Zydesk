// Guardas del script de capturas (spec fase 8 §10.2): las capturas de los manuales solo se toman con
// las semillas de desarrollo, nunca con datos reales.
export const CORREOS_SEMILLA: readonly string[] = [
  'hikki',
  'crojas',
  'fcastro',
  'dmunoz',
  'vsoto',
  'mfuentes',
  'jperez',
  'sdiaz',
  'treyes',
  'imorales',
  'nvega',
].map((usuario) => `${usuario}@zydesk.local`);

// Lanza si algún usuario no es de las semillas, o si falta alguna de las 11 personas sembradas.
export function soloSemillas(usuarios: readonly { correo: string }[]): void {
  const ajenos = usuarios.filter((u) => !CORREOS_SEMILLA.includes(u.correo.toLowerCase()));
  if (ajenos.length > 0) {
    throw new Error(
      `Hay ${ajenos.length} usuario(s) que no son de las semillas: las capturas se abortan. ` +
        'Ejecuta `npm run db:reiniciar` antes de `npm run docs:capturas`.',
    );
  }
  const presentes = new Set(usuarios.map((u) => u.correo.toLowerCase()));
  const faltan = CORREOS_SEMILLA.filter((c) => !presentes.has(c));
  if (faltan.length > 0) {
    throw new Error('Faltan usuarios de las semillas: ejecuta `npm run db:reiniciar`.');
  }
}

// El script solo corre contra un servidor local.
export function soloLocal(baseURL: string): void {
  const { hostname } = new URL(baseURL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error('Las capturas solo se toman contra un servidor local.');
  }
}
