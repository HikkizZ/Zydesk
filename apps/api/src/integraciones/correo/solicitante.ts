// "Paula Herrera <p@x.cl>" → { nombre: 'Paula Herrera', correo: 'p@x.cl' }; solo correo → nombre null.
export function solicitanteDesde(de: string | null): {
  nombre: string | null;
  correo: string | null;
} {
  const texto = de?.trim();
  if (!texto) return { nombre: null, correo: null };
  const angular = /<([^<>\s]+@[^<>\s]+)>/.exec(texto);
  if (angular) {
    const correo = angular[1]!;
    const nombre = texto
      .slice(0, angular.index)
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim();
    return { nombre: nombre && nombre !== correo ? nombre : null, correo };
  }
  if (/^[^\s<>,;@]+@[^\s<>,;@]+$/.test(texto)) return { nombre: null, correo: texto };
  return { nombre: texto, correo: null };
}
