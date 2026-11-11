import { useMemo } from 'react';
import { areaOcupada, revisarDisposicion, type ProblemaDisposicion } from '../calc/geometria';
import { propagarCaudal, type ResultadoCaudal } from '../calc/grafo';
import { evaluarTuberia, longitudRuta, rutaTuberia, type EvaluacionTuberia, type Ruta } from '../calc/tuberias';
import { lpsAm3d } from '../calc/unidades';
import { propagarCalidad, type CalidadUnidad } from '../calc/calidad';
import { contextoUnidad } from '../calc/indicadores';
import { validarTren, type AlertaTren } from '../calc/tren';
import { validarUnidad, type ResultadoUnidad } from '../calc/validacion';
import { calcularCostos, type ResultadoCostos } from '../calc/costos';
import { useConfig } from './config';
import { useDiseno } from './diseno';

export interface AnalisisTuberia extends EvaluacionTuberia {
  ruta: Ruta;
  longitud: number;
}

/** Resultados derivados del diseño; se recalculan cuando este cambia. */
export interface Analisis {
  problemas: ProblemaDisposicion[];
  areaOcupada: number;
  caudalMed: ResultadoCaudal;
  caudalMax: ResultadoCaudal;
  tuberias: Map<string, AnalisisTuberia>;
  longitudTotal: number;
  /** Calidad estimada a la entrada y salida de cada unidad (a Qmed). */
  calidad: Record<string, CalidadUnidad>;
  /** Semáforo y criterios de diseño por unidad. */
  validacion: Map<string, ResultadoUnidad>;
  alertasTren: AlertaTren[];
  costos: ResultadoCostos;
}

export function useAnalisis(): Analisis {
  const unidades = useDiseno((s) => s.diseno.unidades);
  const tuberias = useDiseno((s) => s.diseno.tuberias);
  const datos = useDiseno((s) => s.diseno.datos);
  const catalogo = useConfig((s) => s.catalogo);
  const general = useConfig((s) => s.general);
  const cfgTuberias = useConfig((s) => s.tuberias);
  const rangos = useConfig((s) => s.rangos);
  const reglasTren = useConfig((s) => s.reglasTren);
  const eficiencias = useConfig((s) => s.eficiencias);
  const precios = useConfig((s) => s.precios);
  const sepCirc = general.separacionModulosCirculares_m;

  const problemas = useMemo(
    () => revisarDisposicion(unidades, datos.terreno, datos.separacionMinima_m, sepCirc),
    [unidades, datos.terreno, datos.separacionMinima_m, sepCirc],
  );
  const ocupada = useMemo(() => areaOcupada(unidades), [unidades]);

  // El caudal solo depende de la topología y los parámetros, pero recalcularlo
  // al mover una unidad es barato (decenas de nodos).
  const caudalMed = useMemo(
    () => propagarCaudal(unidades, tuberias, catalogo, lpsAm3d(datos.Qmed_Ls)),
    [unidades, tuberias, catalogo, datos.Qmed_Ls],
  );
  const caudalMax = useMemo(
    () => propagarCaudal(unidades, tuberias, catalogo, lpsAm3d(datos.Qmax_Ls)),
    [unidades, tuberias, catalogo, datos.Qmax_Ls],
  );

  const analisisTuberias = useMemo(() => {
    const m = new Map<string, AnalisisTuberia>();
    for (const t of tuberias) {
      const ruta = rutaTuberia(t, unidades, catalogo, sepCirc, cfgTuberias.longitudAcometida_m);
      if (!ruta) continue;
      const ev = evaluarTuberia(t, caudalMed.tuberias[t.id] ?? null, caudalMax.tuberias[t.id] ?? null, cfgTuberias, general.toleranciaAmarillo);
      m.set(t.id, { ...ev, ruta, longitud: longitudRuta(ruta.puntos) });
    }
    return m;
  }, [tuberias, unidades, catalogo, sepCirc, cfgTuberias, caudalMed, caudalMax, general.toleranciaAmarillo]);

  const longitudTotal = useMemo(() => {
    let l = 0;
    for (const a of analisisTuberias.values()) l += a.longitud;
    return l;
  }, [analisisTuberias]);

  const calidad = useMemo(
    () => propagarCalidad(unidades, tuberias, catalogo, eficiencias, { ...datos.influente }, caudalMed),
    [unidades, tuberias, catalogo, eficiencias, datos.influente, caudalMed],
  );

  const validacion = useMemo(() => {
    const m = new Map<string, ResultadoUnidad>();
    for (const u of unidades) {
      const cat = catalogo.unidades.find((c) => c.id === u.tipo);
      if (!cat) continue;
      const ctx = contextoUnidad(u, unidades, tuberias, catalogo, caudalMed, caudalMax, calidad);
      m.set(u.id, validarUnidad(u, cat, rangos[u.tipo], ctx, general.toleranciaAmarillo));
    }
    return m;
  }, [unidades, tuberias, catalogo, caudalMed, caudalMax, calidad, rangos, general.toleranciaAmarillo]);

  const alertasTren = useMemo(() => validarTren(unidades, tuberias, catalogo, reglasTren), [unidades, tuberias, catalogo, reglasTren]);

  const costos = useMemo(() => {
    const longitudes: Record<string, number> = {};
    for (const [id, a] of analisisTuberias) longitudes[id] = a.longitud;
    return calcularCostos(unidades, tuberias, longitudes, catalogo, precios, caudalMed, caudalMax, lpsAm3d(datos.Qmed_Ls));
  }, [unidades, tuberias, analisisTuberias, catalogo, precios, caudalMed, caudalMax, datos.Qmed_Ls]);

  return {
    costos,
    problemas,
    areaOcupada: ocupada,
    caudalMed,
    caudalMax,
    tuberias: analisisTuberias,
    longitudTotal,
    calidad,
    validacion,
    alertasTren,
  };
}
