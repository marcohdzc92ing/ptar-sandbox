import type { Catalogo, Tuberia, UnidadCatalogo, UnidadInstancia } from '../types';
import type { Calidad, CalidadUnidad } from './calidad';
import { areaUnidad, numModulos } from './geometria';
import { paramNumero, type CaudalUnidad, type ResultadoCaudal } from './grafo';

/**
 * Indicadores de diseño de cada unidad, calculados con el caudal que le llega.
 * Convenciones:
 *  - Caudales en m³/d. Áreas y volúmenes suman todos los módulos en paralelo
 *    (equivale a repartir el caudal entre módulos iguales).
 *  - "Caudal fresco" excluye la recirculación de lodos; es el que se usa para
 *    TRH, F/M y carga superficial. La carga de sólidos sí incluye la recirculación.
 *  - F/M = Q·DBO₅ / (V·SSLM), con SSLM como aproximación de la biomasa.
 *  - TRC = V·X / (Qw·Xr), con Xr del balance de sólidos en el sedimentador
 *    (se desprecian los sólidos del efluente): TRC = V·(Qr + Qw) / (Qw·(Q + Qr)).
 */

export type Valor = number | { falta: string };

export interface ContextoUnidad {
  qMed?: CaudalUnidad;
  qMax?: CaudalUnidad;
  /** Calidad del agua que entra a la unidad. */
  calidad: Calidad | null;
  /** SSLM del reactor que alimenta a esta unidad (para el sedimentador secundario). */
  sslmEntrada: number | null;
  /** Purga (m³/d) del sedimentador que surte la recirculación de esta unidad. */
  purgaRecirculacion_m3d: number | null;
}

const SIN_CAUDAL = { falta: 'no llega caudal a la unidad' };
const SIN_DBO = { falta: 'no se conoce la DBO₅ de entrada' };

function cociente(a: number, b: number, falta = SIN_CAUDAL): Valor {
  return b > 0 && Number.isFinite(a / b) ? a / b : falta;
}

type Calculo = (u: UnidadInstancia, cat: UnidadCatalogo, ctx: ContextoUnidad) => Record<string, Valor>;

function datos(u: UnidadInstancia, cat: UnidadCatalogo, ctx: ContextoUnidad) {
  const A = areaUnidad(u);
  const h = u.dim.profundidadUtil ?? 0;
  const n = numModulos(u);
  return {
    A,
    h,
    n,
    V: A * h,
    /** Sección transversal de flujo en canales: ancho × tirante × módulos. */
    seccion: (u.dim.ancho ?? 0) * h * n,
    Qm: ctx.qMed?.entrada ?? 0,
    QM: ctx.qMax?.entrada ?? 0,
    Qf: ctx.qMed?.fresco ?? 0,
    QfM: ctx.qMax?.fresco ?? 0,
    p: (id: string) => paramNumero(u, cat, id),
    dbo: ctx.calidad?.DBO5 ?? null,
  };
}

/** TRC de un reactor con sedimentador y recirculación externos. */
function trcConRecirculacion(V: number, Qf: number, Qr: number, Qw: number | null): Valor {
  if (Qf <= 0) return SIN_CAUDAL;
  if (Qr <= 0 || Qw === null) return { falta: 'falta la tubería de recirculación desde el sedimentador secundario' };
  if (Qw <= 0) return { falta: 'el caudal de purga de lodos es cero' };
  return (V * (Qr + Qw)) / (Qw * (Qf + Qr));
}

const rejillas: Calculo = (u, cat, ctx) => {
  const d = datos(u, cat, ctx);
  const a = d.p('abertura_mm');
  const e = d.p('espesorBarra_mm');
  const libre = d.seccion * (a + e > 0 ? a / (a + e) : 0);
  return { abertura: a, velocidadBarras: d.Qm > 0 ? cociente(d.Qm / 86400, libre, { falta: 'la sección libre es cero' }) : SIN_CAUDAL };
};

const lodosActivados: Calculo = (u, cat, ctx) => {
  const d = datos(u, cat, ctx);
  const X = d.p('sslm');
  return {
    trh_h: d.Qf > 0 ? (d.V / d.Qf) * 24 : SIN_CAUDAL,
    fm: d.Qf <= 0 ? SIN_CAUDAL : d.dbo === null ? SIN_DBO : cociente(d.Qf * d.dbo, d.V * X, { falta: 'el volumen o los SSLM son cero' }),
    trc_d: trcConRecirculacion(d.V, d.Qf, d.Qm - d.Qf, ctx.purgaRecirculacion_m3d),
    sslm: X,
  };
};

export const INDICADORES: Record<string, Calculo> = {
  canal_entrada: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return { velocidad: d.Qm > 0 ? cociente(d.Qm / 86400, d.seccion) : SIN_CAUDAL };
  },
  rejillas_gruesas: rejillas,
  rejillas_finas: rejillas,
  desarenador: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return {
      velocidad: d.Qm > 0 ? cociente(d.Qm / 86400, d.seccion) : SIN_CAUDAL,
      trh_s: cociente(d.V * 86400, d.Qm),
    };
  },
  hidrocriba: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return {
      abertura: d.p('abertura_mm'),
      cargaAncho: d.QM > 0 ? cociente(d.QM / 24, (u.dim.ancho ?? 0) * d.n) : SIN_CAUDAL,
    };
  },
  carcamo_rebombeo: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return { trh_min: cociente(d.V * 1440, d.Qm), numBombas: d.p('numBombas') };
  },
  sedimentador_primario: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return {
      cargaSup_Qmed: d.Qm > 0 ? cociente(d.Qm, d.A) : SIN_CAUDAL,
      cargaSup_Qmax: d.QM > 0 ? cociente(d.QM, d.A) : SIN_CAUDAL,
      trh_h: cociente(d.V * 24, d.Qm),
      profundidad: d.h,
    };
  },
  lodos_activados: lodosActivados,
  aireacion_extendida: lodosActivados,
  sbr: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    const X = d.p('sslm');
    const fd = Math.min(0.95, Math.max(0.01, d.p('decantacion_pct') / 100));
    const Qw = d.p('purga_m3d');
    return {
      modulos: d.n,
      fm: d.Qf <= 0 ? SIN_CAUDAL : d.dbo === null ? SIN_DBO : cociente(d.Qf * d.dbo, d.V * X, { falta: 'el volumen o los SSLM son cero' }),
      // la purga se extrae del lodo sedimentado, concentrado en (1 − fd) del volumen
      trc_d: Qw > 0 ? (d.V * (1 - fd)) / Qw : { falta: 'el caudal de purga de lodos es cero' },
      relacionDecantacion: d.Qf > 0 ? cociente((d.Qf * d.p('ciclo_h')) / 24, fd * d.V, { falta: 'el volumen es cero' }) : SIN_CAUDAL,
    };
  },
  anoxico_aerobio: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    const fa = Math.min(0.95, Math.max(0.01, d.p('fraccionAnoxica_pct') / 100));
    return {
      trhAnoxico_h: d.Qf > 0 ? (fa * d.V * 24) / d.Qf : SIN_CAUDAL,
      trhAerobio_h: d.Qf > 0 ? ((1 - fa) * d.V * 24) / d.Qf : SIN_CAUDAL,
      recirculacionInterna: d.p('recirculacionInterna'),
      trc_d: trcConRecirculacion(d.V, d.Qf, d.Qm - d.Qf, ctx.purgaRecirculacion_m3d),
    };
  },
  filtro_percolador: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return {
      // incluye la recirculación
      cargaHidraulica: d.Qm > 0 ? cociente(d.Qm, d.A) : SIN_CAUDAL,
      cargaOrganica: d.Qf <= 0 ? SIN_CAUDAL : d.dbo === null ? SIN_DBO : cociente((d.Qf * d.dbo) / 1000, d.V, { falta: 'el volumen es cero' }),
    };
  },
  mbbr: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    const areaMedio = d.V * (d.p('llenado_pct') / 100) * d.p('areaEspecifica');
    return {
      llenado: d.p('llenado_pct'),
      cargaMedio: d.Qf <= 0 ? SIN_CAUDAL : d.dbo === null ? SIN_DBO : cociente(d.Qf * d.dbo, areaMedio, { falta: 'el área de medio es cero' }),
    };
  },
  sedimentador_secundario: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    const rasMed = ctx.qMed?.salidas.ras ?? 0;
    const rasMax = ctx.qMax?.salidas.ras ?? 0;
    const X = ctx.sslmEntrada;
    return {
      cargaSup_Qmed: d.Qm > 0 ? cociente(d.Qm - rasMed, d.A) : SIN_CAUDAL,
      cargaSup_Qmax: d.QM > 0 ? cociente(d.QM - rasMax, d.A) : SIN_CAUDAL,
      cargaSolidos:
        d.Qm <= 0
          ? SIN_CAUDAL
          : X === null
            ? { falta: 'no hay un reactor con SSLM conectado a la entrada' }
            : cociente((d.Qm * X) / 1000 / 24, d.A),
      profundidad: d.h,
    };
  },
  contacto_cloro: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    const n = Math.max(1, Math.round(d.p('numCanales')));
    const anchoCanal = (u.dim.ancho ?? 0) / n;
    return {
      contacto_Qmed: cociente(d.V * 1440, d.Qm),
      contacto_Qmax: cociente(d.V * 1440, d.QM),
      relacionLA: cociente(n * (u.dim.largo ?? 0), anchoCanal, { falta: 'el ancho es cero' }),
    };
  },
  uv: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return {
      dosis: d.p('dosis_mJcm2'),
      sstEntrada: ctx.calidad?.SST ?? { falta: 'no se conoce la calidad de entrada (revisa las conexiones)' },
    };
  },
  ozono: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    return { dosis: d.p('dosis_mgL'), contacto_min: cociente(d.V * 1440, d.Qm) };
  },
  osmosis_inversa: (u, cat, ctx) => {
    const d = datos(u, cat, ctx);
    const rec = d.p('recuperacion_pct');
    return {
      recuperacion: rec,
      // permeado en L/h entre el área de membrana
      flux: d.Qm > 0 ? cociente((d.Qm * (rec / 100) * 1000) / 24, d.p('areaMembrana_m2'), { falta: 'el área de membrana es cero' }) : SIN_CAUDAL,
    };
  },
};

/** Reúne lo que cada unidad necesita saber de su entorno para calcular indicadores. */
export function contextoUnidad(
  u: UnidadInstancia,
  unidades: UnidadInstancia[],
  tuberias: Tuberia[],
  catalogo: Catalogo,
  caudalMed: ResultadoCaudal,
  caudalMax: ResultadoCaudal,
  calidad: Record<string, CalidadUnidad>,
): ContextoUnidad {
  const cat = (tipo: string) => catalogo.unidades.find((c) => c.id === tipo);
  const porId = new Map(unidades.map((v) => [v.id, v]));
  const miCat = cat(u.tipo);
  const tieneParam = (v: UnidadInstancia, id: string) => !!cat(v.tipo)?.parametros.some((p) => p.id === id);

  let sslmEntrada: number | null = null;
  let purga: number | null = null;
  for (const t of tuberias) {
    if (t.hasta.unidad !== u.id) continue;
    const origen = porId.get(t.desde.unidad);
    const co = origen && cat(origen.tipo);
    const puertoDestino = miCat?.puertos.find((p) => p.id === t.hasta.puerto);
    if (!origen || !co || !puertoDestino) continue;
    if (puertoDestino.caudal?.modo === 'demanda') {
      if (tieneParam(origen, 'purga_m3d')) purga = (purga ?? 0) + paramNumero(origen, co, 'purga_m3d');
    } else if (puertoDestino.fluido === 'agua' && tieneParam(origen, 'sslm')) {
      sslmEntrada = paramNumero(origen, co, 'sslm');
    }
  }
  return {
    qMed: caudalMed.unidades[u.id],
    qMax: caudalMax.unidades[u.id],
    calidad: calidad[u.id]?.entrada ?? null,
    sslmEntrada,
    purgaRecirculacion_m3d: purga,
  };
}
