import type { PuertoCatalogo, UnidadCatalogo, UnidadInstancia } from '../types';
import { puedeConectar } from '../calc/tuberias';
import { ajustarACuadricula, dimsHuella } from '../calc/geometria';
import { useConfig } from '../store/config';
import { useDiseno, useUI } from '../store/diseno';

/** Agrega una unidad del catálogo con su esquina ajustada a la cuadrícula. */
export function agregarDesdeCatalogo(cat: UnidadCatalogo, x: number, y: number): void {
  const sepCirc = useConfig.getState().general.separacionModulosCirculares_m;
  const temporal: UnidadInstancia = {
    id: '',
    tipo: cat.id,
    x,
    y,
    rot: 0,
    forma: cat.formas[0],
    dim: cat.dimensionesDefecto,
    params: {},
  };
  const pos = ajustarACuadricula(x, y, dimsHuella(temporal, sepCirc), useUI.getState().paso);
  useDiseno.getState().agregarUnidad(cat, pos.x, pos.y);
}

export function duplicarSeleccion(): void {
  const { seleccion, diseno, duplicarUnidad } = useDiseno.getState();
  const u = diseno.unidades.find((v) => v.id === seleccion);
  if (!u) return;
  const sepCirc = useConfig.getState().general.separacionModulosCirculares_m;
  const { h } = dimsHuella(u, sepCirc);
  // la copia queda debajo del original, respetando la separación mínima
  duplicarUnidad(u.id, 0, Math.ceil(h + diseno.datos.separacionMinima_m));
}

/** Puerto (del catálogo) de una unidad del diseño. */
export function puertoDe(unidad: string, idPuerto: string): PuertoCatalogo | undefined {
  const u = useDiseno.getState().diseno.unidades.find((v) => v.id === unidad);
  return useConfig.getState().catalogo.unidades.find((c) => c.id === u?.tipo)?.puertos.find((p) => p.id === idPuerto);
}

/**
 * Clic en un puerto: una salida inicia (o cancela) la conexión;
 * una entrada compatible la completa y crea la tubería.
 */
export function clicEnPuerto(unidad: string, puerto: PuertoCatalogo): void {
  const ui = useUI.getState();
  if (puerto.tipo === 'salida') {
    const misma = ui.conexion?.unidad === unidad && ui.conexion.puerto === puerto.id;
    ui.setConexion(misma ? null : { unidad, puerto: puerto.id });
    return;
  }
  const desde = ui.conexion;
  const origen = desde && puertoDe(desde.unidad, desde.puerto);
  if (!desde || !origen) return;
  const cfg = useConfig.getState().tuberias;
  const { diseno, agregarTuberia } = useDiseno.getState();
  if (!puedeConectar({ unidad: desde.unidad, puerto: origen }, { unidad, puerto }, diseno.tuberias, cfg)) return;
  agregarTuberia({
    desde,
    hasta: { unidad, puerto: puerto.id },
    fluido: origen.fluido,
    dn_mm: cfg.dnDefecto_mm,
    material: cfg.materialDefecto,
    regimen: cfg.regimenDefecto,
    puntos: [],
  });
  ui.setConexion(null);
}
