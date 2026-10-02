import type {
  DiaLineaTiempoDatos,
  ItemLineaTiempoDatos,
  UsuarioBreveDatos,
} from '@/features/tickets/api';

export interface Intervalo {
  inicio: number;
  fin: number;
}

// Columnas (índices en `columnas`, solo días hábiles) que ocupa la barra de un ticket; `null` si cae
// fuera del rango dibujado. Vencido: se prolonga hasta hoy. Sin límite: una sola columna.
export function intervaloDeItem(
  item: ItemLineaTiempoDatos,
  columnas: DiaLineaTiempoDatos[],
  hoy: string,
): Intervalo | null {
  const primera = columnas[0]?.fecha;
  const ultima = columnas.at(-1)?.fecha;
  if (primera === undefined || ultima === undefined) return null;
  const limite = item.limite ?? item.inicio;
  const fin = item.vencido && hoy > limite ? hoy : limite;
  if (fin < primera || item.inicio > ultima) return null;

  // primera columna con fecha >= inicio (0 si empieza antes del rango)
  const inicio = columnas.findIndex((c) => c.fecha >= item.inicio);
  // última columna con fecha <= fin (mínimo, la del inicio: el ancho mínimo es una columna)
  let ultimaIdx = -1;
  columnas.forEach((c, i) => {
    if (c.fecha <= fin) ultimaIdx = i;
  });
  return { inicio, fin: Math.max(inicio, ultimaIdx) };
}

// Subfilas por intervalos: cada barra va en la primera subfila (0, 1, …) donde no se solape.
export function asignarSubfilas(intervalos: Intervalo[]): { subfilas: number[]; total: number } {
  const orden = intervalos
    .map((iv, i) => ({ iv, i }))
    .sort((a, b) => a.iv.inicio - b.iv.inicio || a.iv.fin - b.iv.fin);
  const finPorSubfila: number[] = [];
  const subfilas = new Array<number>(intervalos.length).fill(0);
  for (const { iv, i } of orden) {
    let s = finPorSubfila.findIndex((fin) => fin < iv.inicio);
    if (s === -1) s = finPorSubfila.length;
    finPorSubfila[s] = iv.fin;
    subfilas[i] = s;
  }
  return { subfilas, total: Math.max(1, finPorSubfila.length) };
}

export interface Barra {
  item: ItemLineaTiempoDatos;
  inicio: number;
  fin: number;
  subfila: number;
}

export function disponerBarras(
  items: ItemLineaTiempoDatos[],
  columnas: DiaLineaTiempoDatos[],
  hoy: string,
): { barras: Barra[]; subfilas: number } {
  const con = items.flatMap((item) => {
    const iv = intervaloDeItem(item, columnas, hoy);
    return iv ? [{ item, iv }] : [];
  });
  const { subfilas, total } = asignarSubfilas(con.map((c) => c.iv));
  return {
    barras: con.map((c, i) => ({ item: c.item, ...c.iv, subfila: subfilas[i] ?? 0 })),
    subfilas: total,
  };
}

export interface FilaDatos {
  clave: string;
  nombre: string;
  persona: UsuarioBreveDatos | null;
  items: ItemLineaTiempoDatos[];
}

const porNombre = (a: FilaDatos, b: FilaDatos) => a.nombre.localeCompare(b.nombre, 'es');

// Una fila por persona (quien mira primero, luego alfabético) y "Sin asignar" al final si hace falta.
export function filasPorPersona(
  items: ItemLineaTiempoDatos[],
  personas: UsuarioBreveDatos[],
  yoId: number,
): FilaDatos[] {
  const conocidas = new Map(personas.map((p) => [p.id, p]));
  for (const item of items) {
    const r = item.responsables.find((x) => x.id === item.responsable_id);
    if (r && !conocidas.has(r.id)) conocidas.set(r.id, r);
  }
  const filas: FilaDatos[] = [...conocidas.values()].map((p) => ({
    clave: `persona-${p.id}`,
    nombre: p.nombre,
    persona: p,
    items: items.filter((i) => i.responsable_id === p.id),
  }));
  filas.sort((a, b) => {
    const aYo = a.persona?.id === yoId;
    const bYo = b.persona?.id === yoId;
    return aYo === bYo ? porNombre(a, b) : aYo ? -1 : 1;
  });
  const sinAsignar = items.filter((i) => i.responsable_id === null);
  if (sinAsignar.length > 0) {
    filas.push({ clave: 'sin-asignar', nombre: 'Sin asignar', persona: null, items: sinAsignar });
  }
  return filas;
}

// Una fila por cliente/área con tickets (alfabético) y "Sin cliente" al final.
export function filasPorCliente(items: ItemLineaTiempoDatos[]): FilaDatos[] {
  const clientes = new Map<number, FilaDatos>();
  const sinCliente: ItemLineaTiempoDatos[] = [];
  for (const item of items) {
    if (!item.cliente) {
      sinCliente.push(item);
      continue;
    }
    const fila = clientes.get(item.cliente.id) ?? {
      clave: `cliente-${item.cliente.id}`,
      nombre: item.cliente.nombre,
      persona: null,
      items: [],
    };
    fila.items.push(item);
    clientes.set(item.cliente.id, fila);
  }
  const filas = [...clientes.values()].sort(porNombre);
  if (sinCliente.length > 0) {
    filas.push({ clave: 'sin-cliente', nombre: 'Sin cliente', persona: null, items: sinCliente });
  }
  return filas;
}

// "Lo que hace ahora": el ticket en curso del responsable con actividad más reciente.
export function enCursoDe(items: ItemLineaTiempoDatos[], personaId: number) {
  return items
    .filter((i) => i.responsable_id === personaId && i.estado === 'en_curso' && !i.cerrado)
    .sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en))[0];
}
