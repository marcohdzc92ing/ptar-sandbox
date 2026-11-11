import type { ConfigNormas, LimiteNorma, Norma, Tuberia, UnidadInstancia } from '../types';
import type { Calidad } from './calidad';

/**
 * Comparación de la calidad estimada del efluente contra la norma del destino.
 * El valor estimado representa una condición media, así que se compara contra
 * el promedio mensual; si la norma no lo define, contra el diario o el instantáneo.
 */

export type EstadoFila =
  | 'cumple'
  | 'no_cumple'
  /** La norma marca "No aplica" para esta categoría. */
  | 'no_aplica'
  /** La norma remite a otro documento o el valor no se pudo transcribir. */
  | 'sin_limite'
  /** El estimado es solo una cota superior y excede el límite. */
  | 'no_concluyente'
  /** No se conoce la calidad que llega al destino. */
  | 'sin_dato';

export interface FilaNorma {
  parametro: string;
  nombre: string;
  unidad: string;
  estimado: number | null;
  limite: number | null;
  tipoLimite: 'P.M.' | 'P.D.' | 'V.I.' | null;
  estado: EstadoFila;
  verificado: boolean;
  nota?: string;
}

export interface ResultadoNorma {
  normaId: string;
  norma: Norma;
  categoria: string;
  nombreCategoria: string;
  filas: FilaNorma[];
  /** true: todo lo evaluado cumple. false: algo no cumple. null: no se puede afirmar. */
  cumple: boolean | null;
}

export function limiteAplicable(l: LimiteNorma): { valor: number; tipo: 'P.M.' | 'P.D.' | 'V.I.' } | null {
  if (l.pm !== null) return { valor: l.pm, tipo: 'P.M.' };
  if (l.pd !== null) return { valor: l.pd, tipo: 'P.D.' };
  if (l.vi !== null) return { valor: l.vi, tipo: 'V.I.' };
  return null;
}

export function compararFila(l: LimiteNorma, calidad: Calidad | null): FilaNorma {
  const estimado = calidad && l.parametro in calidad ? calidad[l.parametro] : null;
  const lim = l.aplica ? limiteAplicable(l) : null;
  let estado: EstadoFila;
  if (!l.aplica) estado = 'no_aplica';
  else if (!lim) estado = 'sin_limite';
  else if (estimado === null) estado = 'sin_dato';
  else if (estimado <= lim.valor) estado = 'cumple';
  else estado = l.comparacion === 'cota_superior' ? 'no_concluyente' : 'no_cumple';
  return {
    parametro: l.parametro,
    nombre: l.nombreNorma,
    unidad: l.unidad,
    estimado,
    limite: lim?.valor ?? null,
    tipoLimite: lim?.tipo ?? null,
    estado,
    verificado: l.verificado,
    nota: l.nota,
  };
}

/** Norma y categoría que corresponden a una unidad de destino, o null si no es destino. */
export function normaDeDestino(u: UnidadInstancia, cfg: ConfigNormas, paramDefecto: (id: string) => string | undefined) {
  const d = cfg.destinos[u.tipo];
  if (!d) return null;
  const norma = cfg.normas[d.norma];
  if (!norma) return null;
  const categoria = d.categoria ?? String(u.params[d.categoriaParam ?? ''] ?? paramDefecto(d.categoriaParam ?? '') ?? '');
  const cat = norma.categorias[categoria];
  return cat ? { normaId: d.norma, norma, categoria, cat } : null;
}

export function compararConNorma(
  u: UnidadInstancia,
  calidadEntrada: Calidad | null,
  cfg: ConfigNormas,
  paramDefecto: (id: string) => string | undefined = () => undefined,
): ResultadoNorma | null {
  const n = normaDeDestino(u, cfg, paramDefecto);
  if (!n) return null;
  const filas = n.cat.limites.map((l) => compararFila(l, calidadEntrada));
  const evaluadas = filas.filter((f) => f.estado !== 'no_aplica' && f.estado !== 'sin_limite');
  const cumple = evaluadas.some((f) => f.estado === 'no_cumple')
    ? false
    : evaluadas.length > 0 && evaluadas.every((f) => f.estado === 'cumple')
      ? true
      : null;
  return { normaId: n.normaId, norma: n.norma, categoria: n.categoria, nombreCategoria: n.cat.nombre, filas, cumple };
}

/** Unidades aguas arriba de `id` siguiendo las tuberías (sin recirculación ni aire). */
export function aguasArriba(id: string, tuberias: Tuberia[]): Set<string> {
  const vistos = new Set<string>();
  const cola = [id];
  while (cola.length) {
    const actual = cola.pop()!;
    for (const t of tuberias) {
      if (t.fluido === 'recirculacion' || t.fluido === 'aire') continue;
      if (t.hasta.unidad === actual && !vistos.has(t.desde.unidad) && t.desde.unidad !== id) {
        vistos.add(t.desde.unidad);
        cola.push(t.desde.unidad);
      }
    }
  }
  return vistos;
}
