import type { Catalogo, ConfigPrecios, Etapa, Tuberia, UnidadCatalogo, UnidadInstancia } from '../types';
import { areaUnidad, numModulos } from './geometria';
import { paramNumero, type CaudalUnidad, type ResultadoCaudal } from './grafo';

/**
 * Costos de orden de magnitud, en MXN sin IVA hasta el renglón de IVA.
 *  - Obra civil: excavación, concreto (losa + muros) y acero por cuantía.
 *  - Equipo: fijo × cantidad + unitario × capacidad (precios.json).
 *  - Tuberías: precio por metro según material y diámetro.
 *  - Indirectos e ingeniería como % del costo directo; IVA sobre el subtotal.
 *  - Operación anual: energía (potencia en operación × factor de uso) y cloro.
 */

export interface CantidadesCivil {
  excavacion_m3: number;
  concreto_m3: number;
  acero_kg: number;
}

export interface CostoEquipo {
  id: string;
  nombre: string;
  cantidad: number;
  capacidad: number;
  unidadCapacidad: string;
  costo: number;
}

export interface CostoUnidad {
  id: string;
  etapa: Etapa;
  cantidades: CantidadesCivil;
  civil: number;
  equipos: CostoEquipo[];
  equipo: number;
  total: number;
  /** Potencia en operación (kW) y energía anual (kWh). */
  potencia_kW: number;
  energia_kWh: number;
  /** Consumo anual de cloro activo, kg. */
  cloro_kg: number;
}

export interface ResultadoCostos {
  unidades: CostoUnidad[];
  porEtapa: { etapa: Etapa; civil: number; equipo: number; total: number }[];
  tuberias: { longitud_m: number; costo: number };
  directo: number;
  indirectos: number;
  ingenieria: number;
  subtotal: number;
  iva: number;
  total: number;
  rango: { bajo: number; alto: number };
  operacion: { energia_kWh: number; energia: number; cloro_kg: number; quimicos: number; total: number };
  volumenAnual_m3: number;
  /** MXN por m³ tratado: solo operación, y operación + inversión repartida en la vida útil (sin intereses). */
  porM3: { operacion: number | null; total: number | null };
}

/** Cantidades de obra civil de una unidad (todos sus módulos). */
export function cantidadesCivil(u: UnidadInstancia, oc: ConfigPrecios['obraCivil']): CantidadesCivil {
  const n = numModulos(u);
  const tl = oc.espesorLosa_m;
  const tm = oc.espesorMuro_m;
  const s = oc.sobreexcavacion_m;
  const esTanque = u.dim.profundidadUtil !== undefined;
  const esEquipo = u.dim.altura !== undefined;
  if (!esTanque && !esEquipo) return { excavacion_m3: 0, concreto_m3: 0, acero_kg: 0 };

  const H = esTanque ? (u.dim.profundidadUtil ?? 0) + (u.dim.bordoLibre ?? 0) : 0;
  const frac = esTanque ? (oc.fraccionEnterradaPorUnidad[u.tipo] ?? oc.fraccionEnterrada) : 0;
  const profExc = frac * H + tl;
  let losa = 0;
  let muros = 0;
  let excavacion = 0;

  if (u.forma === 'circular') {
    const D = u.dim.diametro ?? 0;
    losa = n * Math.PI * (D / 2 + tm) ** 2 * tl;
    muros = n * Math.PI * (D + tm) * tm * H;
    excavacion = n * Math.PI * (D / 2 + tm + s) ** 2 * profExc;
  } else {
    const L = u.dim.largo ?? 0;
    const W = u.dim.ancho ?? 0;
    // exterior: los módulos adosados comparten muro
    const largoExt = L + 2 * tm;
    const anchoExt = n * W + (n + 1) * tm;
    losa = largoExt * anchoExt * tl;
    muros = esTanque ? ((n + 1) * L + 2 * anchoExt) * tm * H : 0;
    excavacion = (largoExt + 2 * s) * (anchoExt + 2 * s) * profExc;
  }
  const concreto = losa + muros;
  return { excavacion_m3: excavacion, concreto_m3: concreto, acero_kg: concreto * oc.cuantiaAcero_kg_m3 };
}

type Medida = { cantidad: number; capacidad: number };
type Variable = (u: UnidadInstancia, cat: UnidadCatalogo, q: { med?: CaudalUnidad; max?: CaudalUnidad }) => Medida;

/** Variables de capacidad con las que se cotiza cada equipo. */
export const VARIABLES: Record<string, Variable> = {
  anchoCanal_m: (u) => ({ cantidad: numModulos(u), capacidad: (u.dim.ancho ?? 0) * numModulos(u) }),
  Qmax_Ls: (u, _c, q) => ({ cantidad: numModulos(u), capacidad: (q.max?.entrada ?? 0) / 86.4 }),
  Qmed_Ls: (_u, _c, q) => ({ cantidad: 1, capacidad: (q.med?.entrada ?? 0) / 86.4 }),
  potenciaBombas_kW: (u, c) => {
    const n = Math.max(0, Math.round(paramNumero(u, c, 'numBombas')));
    return { cantidad: n, capacidad: n * paramNumero(u, c, 'potenciaBomba_kW') };
  },
  potencia_kW: (u, c) => ({ cantidad: 1, capacidad: paramNumero(u, c, 'potencia_kW') }),
  areaTanque_m2: (u) => ({ cantidad: 0, capacidad: areaUnidad(u) }),
  modulos: (u) => ({ cantidad: 0, capacidad: numModulos(u) }),
  diametro_m: (u) => {
    const n = numModulos(u);
    return { cantidad: n, capacidad: n * (u.forma === 'circular' ? (u.dim.diametro ?? 0) : (u.dim.largo ?? 0)) };
  },
  volumenMedio_m3: (u, c) => {
    const V = areaUnidad(u) * (u.dim.profundidadUtil ?? 0);
    const tieneLlenado = c.parametros.some((p) => p.id === 'llenado_pct');
    return { cantidad: 0, capacidad: tieneLlenado ? (V * paramNumero(u, c, 'llenado_pct')) / 100 : V };
  },
  kgO3_d: (u, c, q) => ({ cantidad: 1, capacidad: (paramNumero(u, c, 'dosis_mgL') * (q.med?.entrada ?? 0)) / 1000 }),
  areaMembrana_m2: (u, c) => ({ cantidad: 0, capacidad: paramNumero(u, c, 'areaMembrana_m2') }),
  caudalLodos_Ls: (u, _c, q) => ({
    cantidad: numModulos(u),
    capacidad: ((q.med?.salidas.ras ?? 0) + (q.med?.salidas.lodos ?? 0)) / 86.4,
  }),
};

/** Potencia en operación, kW: la instalada, menos una bomba de reserva en los cárcamos. */
export function potenciaOperacion(u: UnidadInstancia, cat: UnidadCatalogo): number {
  let p = 0;
  if (cat.parametros.some((x) => x.id === 'potencia_kW')) p += paramNumero(u, cat, 'potencia_kW');
  if (cat.parametros.some((x) => x.id === 'potenciaBomba_kW')) {
    const n = Math.round(paramNumero(u, cat, 'numBombas'));
    p += Math.max(1, n - 1) * paramNumero(u, cat, 'potenciaBomba_kW');
  }
  return p;
}

export function precioTuberia_m(t: Pick<Tuberia, 'dn_mm' | 'material'>, precios: ConfigPrecios): number {
  const m = precios.tuberias[t.material];
  return m ? m.precioDN100_m * (t.dn_mm / 100) ** m.exponente * precios.factorActualizacion : 0;
}

export function calcularCostos(
  unidades: UnidadInstancia[],
  tuberias: Tuberia[],
  longitudes: Record<string, number>,
  catalogo: Catalogo,
  precios: ConfigPrecios,
  caudalMed: ResultadoCaudal,
  caudalMax: ResultadoCaudal,
  qMed_m3d: number,
): ResultadoCostos {
  const f = precios.factorActualizacion;
  const oc = precios.obraCivil;
  const op = precios.operacion;
  const cats = new Map(catalogo.unidades.map((c) => [c.id, c]));

  const costoUnidades: CostoUnidad[] = [];
  for (const u of unidades) {
    const cat = cats.get(u.tipo);
    if (!cat) continue;
    const cantidades = cantidadesCivil(u, oc);
    const civil =
      f *
      (cantidades.excavacion_m3 * oc.excavacion_m3.precio +
        cantidades.concreto_m3 * oc.concreto_m3.precio +
        cantidades.acero_kg * oc.acero_kg.precio);

    const q = { med: caudalMed.unidades[u.id], max: caudalMax.unidades[u.id] };
    const equipos: CostoEquipo[] = [];
    for (const id of cat.equipos) {
      const pe = precios.equipos[id];
      const variable = pe && VARIABLES[pe.variable];
      if (!pe || !variable) continue;
      const m = variable(u, cat, q);
      equipos.push({
        id,
        nombre: pe.nombre,
        cantidad: m.cantidad,
        capacidad: m.capacidad,
        unidadCapacidad: pe.unidadVariable,
        costo: f * (pe.fijo * m.cantidad + pe.unitario * m.capacidad),
      });
    }
    const equipo = equipos.reduce((s, e) => s + e.costo, 0);
    const potencia = potenciaOperacion(u, cat);
    const cloro = cat.equipos.includes('cloracion')
      ? (paramNumero(u, cat, 'dosis_mgL') * (q.med?.entrada ?? 0) * op.diasOperacion) / 1000
      : 0;
    costoUnidades.push({
      id: u.id,
      etapa: cat.etapa,
      cantidades,
      civil,
      equipos,
      equipo,
      total: civil + equipo,
      potencia_kW: potencia,
      energia_kWh: potencia * op.factorUsoEnergia * 24 * op.diasOperacion,
      cloro_kg: cloro,
    });
  }

  const porEtapa = catalogo.etapas
    .map((e) => {
      const us = costoUnidades.filter((c) => c.etapa === e.id);
      const civil = us.reduce((s, c) => s + c.civil, 0);
      const equipo = us.reduce((s, c) => s + c.equipo, 0);
      return { etapa: e.id, civil, equipo, total: civil + equipo };
    })
    .filter((e) => e.total > 0);

  let longitud = 0;
  let costoTuberias = 0;
  for (const t of tuberias) {
    const l = longitudes[t.id] ?? 0;
    longitud += l;
    costoTuberias += l * precioTuberia_m(t, precios);
  }

  const directo = costoUnidades.reduce((s, c) => s + c.total, 0) + costoTuberias;
  const indirectos = directo * precios.porcentajes.indirectos;
  const ingenieria = directo * precios.porcentajes.ingenieria;
  const subtotal = directo + indirectos + ingenieria;
  const iva = subtotal * precios.porcentajes.iva;
  const total = subtotal + iva;

  const energia_kWh = costoUnidades.reduce((s, c) => s + c.energia_kWh, 0);
  const cloro_kg = costoUnidades.reduce((s, c) => s + c.cloro_kg, 0);
  const energia = energia_kWh * op.tarifa_kWh.precio * f;
  const quimicos = cloro_kg * op.cloro_kg.precio * f;
  const operacion = { energia_kWh, energia, cloro_kg, quimicos, total: energia + quimicos };

  const volumenAnual = qMed_m3d * op.diasOperacion;
  return {
    unidades: costoUnidades,
    porEtapa,
    tuberias: { longitud_m: longitud, costo: costoTuberias },
    directo,
    indirectos,
    ingenieria,
    subtotal,
    iva,
    total,
    rango: { bajo: total * (1 + precios.rango.bajo), alto: total * (1 + precios.rango.alto) },
    operacion,
    volumenAnual_m3: volumenAnual,
    porM3: {
      operacion: volumenAnual > 0 ? operacion.total / volumenAnual : null,
      total: volumenAnual > 0 && op.vidaUtil_anios > 0 ? (operacion.total + total / op.vidaUtil_anios) / volumenAnual : null,
    },
  };
}
