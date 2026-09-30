import { fechaValida, normalizarCuerpo, type CorreoLeido } from './tipos.js';

type Campo = 'de' | 'para' | 'fecha' | 'asunto';

const ETIQUETAS: Array<[RegExp, Campo]> = [
  [/^(?:de|from)$/i, 'de'],
  [/^(?:para|to)$/i, 'para'],
  [/^(?:enviado|sent|fecha|date)$/i, 'fecha'],
  [/^(?:asunto|subject)$/i, 'asunto'],
];

// Heurística de "mejor esfuerzo" (ADR 0009) sobre las primeras 15 líneas; el resto es cuerpo.
export function leerTexto(texto: string): CorreoLeido {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  const campos: Partial<Record<Campo, string>> = {};
  const cuerpo: string[] = [];
  lineas.forEach((linea, i) => {
    const m = i < 15 ? /^\s*([^:\s][^:]*?)\s*:\s*(.*)$/.exec(linea) : null;
    const campo = m ? ETIQUETAS.find(([re]) => re.test(m[1]!))?.[1] : undefined;
    if (m && campo && campos[campo] === undefined) campos[campo] = m[2]!.trim();
    else cuerpo.push(linea);
  });
  return {
    origen: 'texto',
    de: campos.de || null,
    para: campos.para || null,
    fecha: fechaValida(campos.fecha),
    asunto: campos.asunto || null,
    cuerpo_texto: normalizarCuerpo(cuerpo.join('\n').replace(/^\n+/, '')),
    adjuntos: [],
  };
}
