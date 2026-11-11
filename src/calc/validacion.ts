import type { Criterio, RangosUnidad, UnidadCatalogo, UnidadInstancia } from '../types';
import { paramNumero } from './grafo';
import { INDICADORES, type ContextoUnidad } from './indicadores';
import { clasificar, type Semaforo } from './semaforo';

export type EstadoCriterio = Semaforo | 'sin_dato';
export type EstadoUnidad = EstadoCriterio | 'sin_criterios';

export interface ResultadoCriterio {
  indicador: string;
  nombre: string;
  unidad: string;
  valor: number | null;
  min: number | null;
  max: number | null;
  estado: EstadoCriterio;
  /** Qué falla, el valor calculado y el rango. Nunca la dimensión correcta. */
  mensaje: string;
}

export interface ResultadoUnidad {
  estado: EstadoUnidad;
  criterios: ResultadoCriterio[];
}

/** Formato con cifras significativas razonables para mensajes. */
export function cifra(v: number): string {
  const a = Math.abs(v);
  const dec = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return (Math.round(v * 10 ** dec) / 10 ** dec).toString();
}

export function textoRango(min: number | null, max: number | null, unidad: string): string {
  const u = unidad ? (unidad.startsWith(':') ? unidad : ` ${unidad}`) : '';
  if (min !== null && max !== null) return `${min}–${max}${u}`;
  if (min !== null) return `≥ ${min}${u}`;
  if (max !== null) return `≤ ${max}${u}`;
  return 'sin rango';
}

function criteriosDe(u: UnidadInstancia, rangos: RangosUnidad | undefined): Criterio[] {
  if (!rangos) return [];
  if ('criterios' in rangos) return rangos.criterios;
  return rangos.variantes[String(u.params[rangos.variantePor])] ?? Object.values(rangos.variantes)[0] ?? [];
}

const PESO: Record<EstadoCriterio, number> = { verde: 0, sin_dato: 1, amarillo: 2, rojo: 3 };

export function validarUnidad(
  u: UnidadInstancia,
  cat: UnidadCatalogo,
  rangos: RangosUnidad | undefined,
  ctx: ContextoUnidad,
  tolerancia: number,
): ResultadoUnidad {
  const criterios = criteriosDe(u, rangos);
  if (criterios.length === 0) return { estado: 'sin_criterios', criterios: [] };
  const valores = INDICADORES[u.tipo]?.(u, cat, ctx) ?? {};

  const resultados = criterios.map((c): ResultadoCriterio => {
    const min = c.min ?? null;
    const max = c.maxParam ? paramNumero(u, cat, c.maxParam) : (c.max ?? null);
    const base = { indicador: c.indicador, nombre: c.nombre, unidad: c.unidad, min, max };
    const v = valores[c.indicador];
    if (v === undefined || typeof v !== 'number') {
      const motivo = v === undefined ? 'indicador no disponible' : v.falta;
      return { ...base, valor: null, estado: 'sin_dato', mensaje: `${c.nombre}: no se puede calcular (${motivo}).` };
    }
    let estado = clasificar(v, min, max, tolerancia);
    if (c.estricto && estado === 'amarillo') estado = 'rojo';
    const u_ = c.unidad && !c.unidad.startsWith(':') ? ` ${c.unidad}` : c.unidad;
    const mensaje =
      estado === 'verde'
        ? `${c.nombre}: ${cifra(v)}${u_}, dentro del rango ${textoRango(min, max, c.unidad)}.`
        : `${c.nombre}: ${cifra(v)}${u_}, ${estado === 'amarillo' ? 'ligeramente fuera' : 'fuera'} del rango ${textoRango(min, max, c.unidad)}.`;
    return { ...base, valor: v, estado, mensaje };
  });

  const estado = resultados.reduce<EstadoCriterio>((peor, r) => (PESO[r.estado] > PESO[peor] ? r.estado : peor), 'verde');
  return { estado, criterios: resultados };
}
