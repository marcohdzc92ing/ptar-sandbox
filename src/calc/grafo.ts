import type { Catalogo, PuertoCatalogo, Tuberia, UnidadCatalogo, UnidadInstancia } from '../types';

/**
 * Propagación de caudal por el grafo de unidades y tuberías. Todo en m³/d.
 *
 * Modelo (reglas en catalogo.json, campo `caudal` de cada puerto):
 *  - La unidad fuente (influente) entrega el caudal del proyecto.
 *  - Caudal fresco de una unidad = suma de lo que llega por sus entradas
 *    normales. Las entradas de recirculación ("demanda") aportan además
 *    R % del caudal fresco, donde R es un parámetro de la unidad.
 *  - Salidas laterales: purga fija en m³/d, fracción del caudal de entrada
 *    (sobrenadante, rechazo de ósmosis) o recirculación, que entrega lo que
 *    pidan las unidades conectadas.
 *  - La salida principal lleva el resto del balance.
 *  - Varias tuberías en un mismo puerto de salida se reparten por partes iguales.
 *  - El aire no entra al balance (caudal null).
 *
 * Como puede haber retornos (sobrenadante a cabeza de planta), se resuelve
 * por iteración de punto fijo.
 */

export interface CaudalUnidad {
  /** Caudal fresco: entradas sin contar recirculaciones. */
  fresco: number;
  /** Caudal total que pasa por la unidad (fresco + recirculaciones). */
  entrada: number;
  /** Caudal por puerto de salida (null para aire). */
  salidas: Record<string, number | null>;
}

export interface ResultadoCaudal {
  tuberias: Record<string, number | null>;
  unidades: Record<string, CaudalUnidad>;
  convergio: boolean;
  avisos: { unidad: string; mensaje: string }[];
}

const MAX_ITER = 500;
const TOL = 1e-7;

export function paramNumero(u: UnidadInstancia, cat: UnidadCatalogo, id: string): number {
  const v = Number(u.params[id] ?? cat.parametros.find((p) => p.id === id)?.defecto ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function propagarCaudal(
  unidades: UnidadInstancia[],
  tuberias: Tuberia[],
  catalogo: Catalogo,
  qFuente_m3d: number,
): ResultadoCaudal {
  const cats = new Map(catalogo.unidades.map((c) => [c.id, c]));
  const nodos = unidades
    .map((u) => ({ u, cat: cats.get(u.tipo) }))
    .filter((n): n is { u: UnidadInstancia; cat: UnidadCatalogo } => !!n.cat);
  const porId = new Map(nodos.map((n) => [n.u.id, n]));
  const puerto = (unidad: string, id: string): PuertoCatalogo | undefined =>
    porId.get(unidad)?.cat.puertos.find((p) => p.id === id);

  // Solo tuberías con ambos extremos válidos.
  const validas = tuberias.filter((t) => puerto(t.desde.unidad, t.desde.puerto) && puerto(t.hasta.unidad, t.hasta.puerto));
  const entrantes = (unidad: string, idPuerto?: string) =>
    validas.filter((t) => t.hasta.unidad === unidad && (idPuerto === undefined || t.hasta.puerto === idPuerto));
  const salientes = (unidad: string, idPuerto: string) =>
    validas.filter((t) => t.desde.unidad === unidad && t.desde.puerto === idPuerto);

  let q: Record<string, number> = {};
  for (const t of validas) q[t.id] = 0;

  const fresco = (n: { u: UnidadInstancia; cat: UnidadCatalogo }, actual: Record<string, number>): number => {
    if (n.cat.esFuente) return qFuente_m3d;
    let s = 0;
    for (const t of entrantes(n.u.id)) {
      const p = puerto(t.hasta.unidad, t.hasta.puerto)!;
      if (p.fluido === 'aire' || p.caudal?.modo === 'demanda') continue;
      s += actual[t.id] ?? 0;
    }
    return s;
  };

  /** Recirculación que pide una unidad por uno de sus puertos de entrada. */
  const demanda = (n: { u: UnidadInstancia; cat: UnidadCatalogo }, p: PuertoCatalogo, actual: Record<string, number>): number => {
    if (p.caudal?.modo !== 'demanda' || !p.caudal.param) return 0;
    return (Math.max(0, paramNumero(n.u, n.cat, p.caudal.param)) / 100) * fresco(n, actual);
  };

  let resultado: Record<string, CaudalUnidad> = {};
  let avisos: ResultadoCaudal['avisos'] = [];
  let convergio = false;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const sig: Record<string, number> = {};
    resultado = {};
    avisos = [];

    for (const n of nodos) {
      const qFresco = fresco(n, q);
      let recirc = 0;
      for (const p of n.cat.puertos) {
        if (p.tipo === 'entrada' && p.caudal?.modo === 'demanda' && entrantes(n.u.id, p.id).length > 0) {
          recirc += demanda(n, p, q);
        }
      }
      const total = qFresco + recirc;
      let restante = total;
      const salidas: Record<string, number | null> = {};
      const principales: PuertoCatalogo[] = [];

      for (const p of n.cat.puertos) {
        if (p.tipo !== 'salida') continue;
        if (p.fluido === 'aire') {
          salidas[p.id] = null;
          continue;
        }
        const regla = p.caudal;
        if (!regla) {
          principales.push(p);
          continue;
        }
        let valor = 0;
        if (regla.modo === 'fijo_m3d') {
          valor = Math.max(0, paramNumero(n.u, n.cat, regla.param));
        } else if (regla.modo === 'fraccion') {
          const pct = Math.min(100, Math.max(0, paramNumero(n.u, n.cat, regla.param)));
          valor = (total * (regla.complemento ? 100 - pct : pct)) / 100;
        } else {
          // recirculación: lo que pide cada destino conectado
          for (const t of salientes(n.u.id, p.id)) {
            const destino = porId.get(t.hasta.unidad)!;
            const pd = puerto(t.hasta.unidad, t.hasta.puerto)!;
            const parte = demanda(destino, pd, q) / Math.max(1, entrantes(destino.u.id, pd.id).length);
            sig[t.id] = parte;
            valor += parte;
          }
        }
        salidas[p.id] = valor;
        restante -= valor;
        if (regla.modo !== 'demanda') {
          const tubos = salientes(n.u.id, p.id);
          for (const t of tubos) sig[t.id] = valor / tubos.length;
        }
      }

      if (restante < -1e-6) {
        avisos.push({ unidad: n.u.id, mensaje: 'Las extracciones (purga, recirculación) superan el caudal que entra a la unidad.' });
      }
      restante = Math.max(0, restante);
      for (const p of principales) {
        const valor = restante / principales.length;
        salidas[p.id] = valor;
        const tubos = salientes(n.u.id, p.id);
        for (const t of tubos) sig[t.id] = valor / tubos.length;
      }
      resultado[n.u.id] = { fresco: qFresco, entrada: total, salidas };
    }

    let delta = 0;
    for (const t of validas) delta = Math.max(delta, Math.abs((sig[t.id] ?? 0) - q[t.id]));
    for (const t of validas) q[t.id] = sig[t.id] ?? 0;
    if (delta < TOL) {
      convergio = true;
      break;
    }
  }

  const porTuberia: Record<string, number | null> = {};
  for (const t of tuberias) {
    const p = puerto(t.desde.unidad, t.desde.puerto);
    porTuberia[t.id] = !p || p.fluido === 'aire' || !(t.id in q) ? null : q[t.id];
  }
  return { tuberias: porTuberia, unidades: resultado, convergio, avisos };
}
