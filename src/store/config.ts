import { create } from 'zustand';
import type { Catalogo, ConfigGeneral, ConfigNormas, ConfigPrecios, ConfigTuberias, Eficiencias, RangosUnidad, ReglasTren, UnidadCatalogo } from '../types';
import { fijarEn, type ConfigEditable } from '../calc/archivo';
import catalogoJson from '../data/catalogo.json';
import rangosJson from '../data/rangos.json';
import tuberiasJson from '../data/tuberias.json';
import reglasJson from '../data/reglasTren.json';
import eficienciasJson from '../data/eficiencias.json';
import normasJson from '../data/normas.json';
import preciosJson from '../data/precios.json';

/** Valores de fábrica de lo que el profesor puede editar. */
export const CONFIG_FABRICA: ConfigEditable = {
  general: rangosJson.general as ConfigGeneral,
  rangos: rangosJson.unidades as unknown as Record<string, RangosUnidad>,
  eficiencias: eficienciasJson as unknown as Eficiencias,
  precios: preciosJson as unknown as ConfigPrecios,
};

/**
 * Configuración técnica efectiva: los JSON de `src/data`, más los cambios
 * hechos en el modo profesor o cargados de un archivo de configuración.
 */
interface EstadoConfig extends ConfigEditable {
  catalogo: Catalogo;
  tuberias: ConfigTuberias;
  reglasTren: ReglasTren;
  normas: ConfigNormas;
  /**
   * De dónde viene la configuración editable:
   * fabrica = JSON del sitio; sitio = config-profesor.json publicado con el sitio;
   * local = editada o importada en este navegador.
   */
  origen: 'fabrica' | 'sitio' | 'local';
  aplicarConfig: (c: ConfigEditable, origen: EstadoConfig['origen']) => void;
  /** Cambia un valor de una sección (ruta dentro del objeto). `undefined` elimina la clave. */
  editar: (seccion: keyof ConfigEditable, ruta: (string | number)[], valor: unknown) => void;
  restaurar: () => void;
}

export const useConfig = create<EstadoConfig>()((set) => ({
  ...CONFIG_FABRICA,
  catalogo: catalogoJson as unknown as Catalogo,
  tuberias: tuberiasJson as unknown as ConfigTuberias,
  reglasTren: reglasJson as unknown as ReglasTren,
  normas: normasJson as unknown as ConfigNormas,
  origen: 'fabrica',
  aplicarConfig: (c, origen) => set({ ...c, origen }),
  editar: (seccion, ruta, valor) => set((s) => ({ [seccion]: fijarEn(s[seccion], ruta, valor), origen: 'local' }) as Partial<EstadoConfig>),
  restaurar: () => set({ ...CONFIG_FABRICA, origen: 'fabrica' }),
}));

export function configEditable(s: ConfigEditable): ConfigEditable {
  return { general: s.general, rangos: s.rangos, eficiencias: s.eficiencias, precios: s.precios };
}

export function buscarEnCatalogo(catalogo: Catalogo, tipo: string): UnidadCatalogo | undefined {
  return catalogo.unidades.find((u) => u.id === tipo);
}

/** El modo profesor se activa con el parámetro ?profesor en la URL. */
export function esModoProfesor(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('profesor');
}
