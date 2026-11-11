import type { UnidadCatalogo, UnidadInstancia } from '../types';
import { numModulos } from '../calc/geometria';

const fmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

export function num(v: number, decimales = 2): string {
  if (!Number.isFinite(v)) return '—';
  return decimales === 0 ? fmt0.format(v) : fmt.format(Math.round(v * 10 ** decimales) / 10 ** decimales);
}

export function nombreUnidad(u: UnidadInstancia, cat?: UnidadCatalogo): string {
  return u.etiqueta?.trim() || cat?.nombre || u.tipo;
}

/** Texto de dimensiones para la etiqueta: "18 × 7.5 × 4 m · 2 módulos". */
export function textoDimensiones(u: UnidadInstancia): string {
  const alto = u.dim.profundidadUtil ?? u.dim.altura;
  const partes =
    u.forma === 'circular'
      ? [`Ø ${num(u.dim.diametro ?? 0)}`]
      : [num(u.dim.largo ?? 0), num(u.dim.ancho ?? 0)];
  if (alto !== undefined) partes.push(num(alto));
  const n = numModulos(u);
  return `${partes.join(' × ')} m${n > 1 ? ` · ${n} módulos` : ''}`;
}

/** Parámetros de calidad: nombre y unidad para mostrar. */
export const PARAMETROS_CALIDAD: { clave: string; nombre: string; unidad: string }[] = [
  { clave: 'DBO5', nombre: 'DBO₅', unidad: 'mg/L' },
  { clave: 'DQO', nombre: 'DQO', unidad: 'mg/L' },
  { clave: 'SST', nombre: 'SST', unidad: 'mg/L' },
  { clave: 'NT', nombre: 'Nitrógeno total', unidad: 'mg/L' },
  { clave: 'PT', nombre: 'Fósforo total', unidad: 'mg/L' },
  { clave: 'GyA', nombre: 'Grasas y aceites', unidad: 'mg/L' },
  { clave: 'CF', nombre: 'Coliformes fecales', unidad: 'NMP/100 mL' },
  { clave: 'HH', nombre: 'Huevos de helminto', unidad: 'h/L' },
  { clave: 'T', nombre: 'Temperatura', unidad: '°C' },
];

/** Concentraciones: pocas cifras, y notación compacta para valores muy grandes o muy chicos. */
export function numCalidad(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e5) return v.toExponential(1).replace('e+', '×10^');
  if (a >= 100) return num(v, 0);
  if (a >= 10) return num(v, 1);
  if (a >= 0.01 || a === 0) return num(v, 2);
  return v.toExponential(1).replace('e', '×10^');
}

const fmtDinero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

/** Pesos. Con `corto`, los millones se abrevian: "$12.3 M". */
export function dinero(v: number, corto = false, decimales = 0): string {
  if (!Number.isFinite(v)) return '—';
  if (corto && Math.abs(v) >= 1e6) return `$${num(v / 1e6, Math.abs(v) >= 1e7 ? 1 : 2)} M`;
  if (corto && Math.abs(v) >= 1e4) return `$${num(v / 1e3, 0)} mil`;
  return decimales > 0 ? `$${v.toFixed(decimales)}` : `$${fmtDinero.format(v)}`;
}
