import { areaTerreno } from '../calc/geometria';
import { compararConNorma, type EstadoFila } from '../calc/normas';
import { lpsAm3d, m3dALps } from '../calc/unidades';
import type { Analisis } from '../store/analisis';
import type { ConfigNormas, ConfigPrecios, ConfigTuberias, Catalogo, Diseno } from '../types';
import { dinero, nombreUnidad, num, numCalidad, PARAMETROS_CALIDAD, textoDimensiones } from './formato';

/** Contenido del resumen del diseño; lo usan la ventana de resumen y el PDF. */
export interface TablaResumen {
  titulo: string;
  columnas: string[];
  filas: string[][];
  nota?: string;
}

export interface Resumen {
  proyecto: string;
  alumno: string;
  fecha: string;
  tablas: TablaResumen[];
  leyendaCostos: string;
}

const ESTADO_UNIDAD: Record<string, string> = {
  verde: 'Cumple',
  amarillo: 'Cerca del límite',
  rojo: 'Fuera de rango',
  sin_dato: 'Sin dato',
  sin_criterios: '—',
};
const ESTADO_NORMA: Record<EstadoFila, string> = {
  cumple: 'Cumple',
  no_cumple: 'No cumple',
  no_aplica: 'No aplica',
  sin_limite: 'Sin límite',
  no_concluyente: 'No concluyente',
  sin_dato: 'Sin dato',
};

export function construirResumen(
  diseno: Diseno,
  analisis: Analisis,
  cfg: { catalogo: Catalogo; normas: ConfigNormas; precios: ConfigPrecios; tuberias: ConfigTuberias },
): Resumen {
  const { catalogo, normas, precios } = cfg;
  const d = diseno.datos;
  const cat = (tipo: string) => catalogo.unidades.find((c) => c.id === tipo);
  const nombre = (id: string) => {
    const u = diseno.unidades.find((v) => v.id === id);
    return u ? nombreUnidad(u, cat(u.tipo)) : id;
  };
  const etapa = (id: string) => catalogo.etapas.find((e) => e.id === id)?.nombre ?? id;
  const tablas: TablaResumen[] = [];

  const disponible = areaTerreno(d.terreno);
  tablas.push({
    titulo: 'Datos del proyecto',
    columnas: ['Concepto', 'Valor'],
    filas: [
      ['Caudal medio', `${num(d.Qmed_Ls)} L/s (${num(lpsAm3d(d.Qmed_Ls), 0)} m³/d)`],
      ['Caudal máximo', `${num(d.Qmax_Ls)} L/s (${num(lpsAm3d(d.Qmax_Ls), 0)} m³/d)`],
      ['Caudal mínimo', `${num(d.Qmin_Ls)} L/s (${num(lpsAm3d(d.Qmin_Ls), 0)} m³/d)`],
      ['Población equivalente', `${num(d.poblacion, 0)} hab`],
      ['Terreno disponible', `${num(d.terreno.largo)} × ${num(d.terreno.ancho)} m (${num(disponible, 0)} m²)`],
      ['Área ocupada', `${num(analisis.areaOcupada, 0)} m² (${num(disponible > 0 ? (analisis.areaOcupada / disponible) * 100 : 0, 1)} % del terreno)`],
      ...PARAMETROS_CALIDAD.map((p) => [`Influente: ${p.nombre}`, `${numCalidad(d.influente[p.clave as keyof typeof d.influente])} ${p.unidad}`]),
    ],
  });

  tablas.push({
    titulo: 'Unidades y dimensiones',
    columnas: ['N.º', 'Unidad', 'Etapa', 'Dimensiones (largo × ancho × prof. útil, o Ø × prof.)', 'Caudal a Qmed', 'Criterios'],
    filas: diseno.unidades.map((u, i) => {
      const c = cat(u.tipo);
      const q = analisis.caudalMed.unidades[u.id]?.entrada;
      return [
        String(i + 1),
        nombreUnidad(u, c),
        etapa(c?.etapa ?? ''),
        textoDimensiones(u),
        c?.esFuente || q === undefined ? '—' : `${num(m3dALps(q))} L/s`,
        ESTADO_UNIDAD[analisis.validacion.get(u.id)?.estado ?? 'sin_criterios'],
      ];
    }),
  });

  if (diseno.tuberias.length > 0) {
    tablas.push({
      titulo: `Tuberías (${num(analisis.longitudTotal, 0)} m en total)`,
      columnas: ['Desde → hasta', 'Fluido', 'DN y material', 'Longitud', 'Velocidad a Qmed'],
      filas: diseno.tuberias.map((t) => {
        const a = analisis.tuberias.get(t.id);
        return [
          `${nombre(t.desde.unidad)} → ${nombre(t.hasta.unidad)}`,
          cfg.tuberias.fluidos[t.fluido]?.nombre ?? t.fluido,
          `DN ${t.dn_mm} ${t.material}`,
          a ? `${num(a.longitud, 1)} m` : '—',
          a && a.vMed !== null ? `${num(a.vMed)} m/s` : '—',
        ];
      }),
    });
  }

  // --- alertas activas ---
  const alertas: string[][] = [];
  for (const a of analisis.alertasTren) alertas.push(['Tren', a.mensaje]);
  for (const u of diseno.unidades) {
    for (const c of analisis.validacion.get(u.id)?.criterios ?? []) {
      if (c.estado !== 'verde') alertas.push(['Diseño', `${nombreUnidad(u, cat(u.tipo))}. ${c.mensaje}`]);
    }
  }
  for (const a of analisis.caudalMed.avisos) alertas.push(['Caudal', `${nombre(a.unidad)}: ${a.mensaje}`]);
  for (const t of diseno.tuberias) {
    const a = analisis.tuberias.get(t.id);
    if (a && (a.estado === 'amarillo' || a.estado === 'rojo')) {
      alertas.push(['Tubería', `${nombre(t.desde.unidad)} → ${nombre(t.hasta.unidad)}: ${a.mensajes.join(' ')}`]);
    }
  }
  for (const p of analisis.problemas) {
    const [a, b] = p.unidades;
    alertas.push([
      'Disposición',
      p.tipo === 'fuera'
        ? `${nombre(a)} está fuera del terreno.`
        : p.tipo === 'traslape'
          ? `${nombre(a)} se traslapa con ${nombre(b)}.`
          : `${nombre(a)} y ${nombre(b)} están a ${num(p.distancia ?? 0)} m (menos que la separación mínima).`,
    ]);
  }
  tablas.push({
    titulo: `Alertas activas (${alertas.length})`,
    columnas: ['Tipo', 'Alerta'],
    filas: alertas.length ? alertas : [['—', 'Sin alertas.']],
  });

  // --- norma por destino ---
  for (const u of diseno.unidades) {
    const c = cat(u.tipo);
    if (!c || c.etapa !== 'destino') continue;
    const defecto = (id: string) => {
      const p = c.parametros.find((x) => x.id === id);
      return p ? String(p.defecto) : undefined;
    };
    const r = compararConNorma(u, analisis.calidad[u.id]?.entrada ?? null, normas, defecto);
    if (!r) continue;
    const veredicto = r.cumple === true ? 'cumple' : r.cumple === false ? 'no cumple' : 'sin concluir';
    tablas.push({
      titulo: `Norma: ${nombreUnidad(u, c)} (${veredicto})`,
      columnas: ['Parámetro', 'Estimado', 'Límite', 'Resultado'],
      filas: r.filas.map((f) => [
        `${f.nombre} (${f.unidad})`,
        f.estimado === null ? '—' : numCalidad(f.estimado),
        f.limite === null ? '—' : `${numCalidad(f.limite)}${f.tipoLimite ? ` ${f.tipoLimite}` : ''}`,
        ESTADO_NORMA[f.estado],
      ]),
      nota: `${r.normaId}, ${r.nombreCategoria}. ${r.norma.tabla}. Valores estimados con eficiencias típicas; límites pendientes de verificación.`,
    });
  }

  // --- costos ---
  const k = analisis.costos;
  const pct = (v: number) => `${num(v * 100, 0)} %`;
  tablas.push({
    titulo: 'Costos (MXN)',
    columnas: ['Concepto', 'Monto'],
    filas: [
      ...k.porEtapa.map((e) => [`${etapa(e.etapa)}: obra civil y equipo`, dinero(e.total)]),
      [`Tuberías (${num(k.tuberias.longitud_m, 0)} m)`, dinero(k.tuberias.costo)],
      ['Costo directo', dinero(k.directo)],
      [`Indirectos (${pct(precios.porcentajes.indirectos)})`, dinero(k.indirectos)],
      [`Ingeniería (${pct(precios.porcentajes.ingenieria)})`, dinero(k.ingenieria)],
      [`IVA (${pct(precios.porcentajes.iva)})`, dinero(k.iva)],
      ['Inversión, valor central', dinero(k.total)],
      [`Inversión, rango (${pct(precios.rango.bajo)} / +${pct(precios.rango.alto)})`, `${dinero(k.rango.bajo)} a ${dinero(k.rango.alto)}`],
      ['Operación anual: energía', dinero(k.operacion.energia)],
      ['Operación anual: químicos', dinero(k.operacion.quimicos)],
      ['Costo por m³ tratado, solo operación', k.porM3.operacion === null ? '—' : `${dinero(k.porM3.operacion, false, 2)}/m³`],
      ['Costo por m³ tratado, operación + inversión', k.porM3.total === null ? '—' : `${dinero(k.porM3.total, false, 2)}/m³`],
    ],
    nota: `${precios.leyenda[0].toUpperCase()}${precios.leyenda.slice(1)}. Precios base ${precios.anioBase}, sin verificar.`,
  });

  return {
    proyecto: diseno.proyecto,
    alumno: diseno.alumno,
    fecha: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
    tablas,
    leyendaCostos: precios.leyenda,
  };
}
