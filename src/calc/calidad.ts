import type { Catalogo, Eficiencias, Remocion, Tuberia, UnidadInstancia } from '../types';
import type { ResultadoCaudal } from './grafo';

/**
 * Propagación de la calidad del agua por la línea principal.
 *
 *  - La calidad de entrada de una unidad es la mezcla, ponderada por caudal,
 *    de las tuberías de agua que le llegan desde salidas principales.
 *  - Cada unidad aplica su remoción típica (eficiencias.json): fracción para
 *    concentraciones, unidades logarítmicas para CF y HH.
 *  - No se modela la calidad de corrientes laterales (sobrenadante, rechazo,
 *    lixiviado, recirculación de lodos): se ignoran en la mezcla.
 */

export type Calidad = Record<string, number>;

export interface CalidadUnidad {
  entrada: Calidad | null;
  salida: Calidad | null;
}

export function aplicarRemocion(c: Calidad, efic: Record<string, Remocion | boolean | string> | undefined): Calidad {
  if (!efic) return { ...c };
  const r: Calidad = { ...c };
  for (const [param, e] of Object.entries(efic)) {
    if (typeof e !== 'object' || !(param in r)) continue;
    if (e.log !== undefined) r[param] = r[param] / 10 ** e.log;
    else if (e.remocion !== undefined) r[param] = r[param] * (1 - Math.min(1, Math.max(0, e.remocion)));
  }
  return r;
}

export function propagarCalidad(
  unidades: UnidadInstancia[],
  tuberias: Tuberia[],
  catalogo: Catalogo,
  eficiencias: Eficiencias,
  influente: Calidad,
  caudal: ResultadoCaudal,
): Record<string, CalidadUnidad> {
  const cats = new Map(catalogo.unidades.map((c) => [c.id, c]));
  const tipo = new Map(unidades.map((u) => [u.id, u.tipo]));
  const res: Record<string, CalidadUnidad> = {};
  for (const u of unidades) res[u.id] = { entrada: null, salida: null };

  /** Tuberías que transportan agua de proceso: salida principal de agua → entrada de agua. */
  const principales = tuberias.filter((t) => {
    const po = cats.get(tipo.get(t.desde.unidad) ?? '')?.puertos.find((p) => p.id === t.desde.puerto);
    const pd = cats.get(tipo.get(t.hasta.unidad) ?? '')?.puertos.find((p) => p.id === t.hasta.puerto);
    return !!po && !!pd && po.fluido === 'agua' && !po.caudal && pd.fluido === 'agua';
  });

  const clave = (c: Calidad | null) => (c ? Object.values(c).map((v) => v.toPrecision(9)).join('|') : '');

  // Pasadas sucesivas hasta estabilizar (el grafo principal casi siempre es acíclico).
  for (let pasada = 0; pasada < unidades.length + 2; pasada++) {
    let cambio = false;
    for (const u of unidades) {
      const cat = cats.get(u.tipo);
      if (!cat) continue;
      let entrada: Calidad | null = null;
      if (cat.esFuente) {
        entrada = { ...influente };
      } else {
        let qTotal = 0;
        const suma: Calidad = {};
        for (const t of principales) {
          if (t.hasta.unidad !== u.id) continue;
          const c = res[t.desde.unidad]?.salida;
          const q = caudal.tuberias[t.id] ?? 0;
          if (!c || q <= 0) continue;
          qTotal += q;
          for (const [k, v] of Object.entries(c)) suma[k] = (suma[k] ?? 0) + v * q;
        }
        if (qTotal > 0) {
          entrada = {};
          for (const [k, v] of Object.entries(suma)) entrada[k] = v / qTotal;
        }
      }
      const salida = entrada ? (cat.esFuente ? entrada : aplicarRemocion(entrada, eficiencias.unidades[u.tipo])) : null;
      if (clave(salida) !== clave(res[u.id].salida) || clave(entrada) !== clave(res[u.id].entrada)) cambio = true;
      res[u.id] = { entrada, salida };
    }
    if (!cambio) break;
  }
  return res;
}
