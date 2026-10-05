import { expect, it } from 'vitest';
import { CORREOS_SEMILLA, soloLocal, soloSemillas } from '../../e2e/guardas';

const semillas = CORREOS_SEMILLA.map((correo) => ({ correo }));

it('acepta exactamente a las 11 personas de las semillas', () => {
  expect(CORREOS_SEMILLA).toHaveLength(11);
  expect(() => soloSemillas(semillas)).not.toThrow();
});

it('aborta con un usuario que no es de las semillas', () => {
  expect(() => soloSemillas([...semillas, { correo: 'persona.real@empresa.cl' }])).toThrow(
    /no son de las semillas/,
  );
});

it('aborta si faltan personas de las semillas', () => {
  expect(() => soloSemillas(semillas.slice(1))).toThrow(/Faltan usuarios/);
});

it('solo acepta servidores locales', () => {
  expect(() => soloLocal('http://localhost:4173')).not.toThrow();
  expect(() => soloLocal('https://zydesk.ejemplo.cl')).toThrow(/local/);
});
