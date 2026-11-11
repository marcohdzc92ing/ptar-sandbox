import type {
  Catalogo,
  ConfigGeneral,
  ConfigPrecios,
  Dimensiones,
  Diseno,
  Eficiencias,
  RangosUnidad,
  Regimen,
  Rotacion,
  Tuberia,
  UnidadInstancia,
} from '../types';

/**
 * Lectura y validación de archivos: el diseño del alumno y la configuración
 * del profesor. Son funciones puras: reciben el objeto ya interpretado del JSON.
 */

/** Parte de la configuración técnica que el profesor puede editar. */
export interface ConfigEditable {
  general: ConfigGeneral;
  rangos: Record<string, RangosUnidad>;
  eficiencias: Eficiencias;
  precios: ConfigPrecios;
}

export const TIPO_CONFIG = 'ptar-config';

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function numeros<T extends object>(defecto: T, origen: unknown): T {
  const r = { ...defecto } as Record<string, unknown>;
  if (esObjeto(origen)) {
    for (const k of Object.keys(r)) if (esNumero(r[k]) && esNumero(origen[k])) r[k] = origen[k];
  }
  return r as T;
}

/**
 * Convierte un JSON cualquiera en un diseño válido. Lanza un Error (mensaje
 * en español) si no parece un diseño; descarta lo que no reconoce y lo avisa.
 */
export function leerDiseno(json: unknown, catalogo: Catalogo, defecto: Diseno): { diseno: Diseno; avisos: string[] } {
  if (!esObjeto(json) || !Array.isArray(json.unidades) || !esObjeto(json.datos)) {
    throw new Error('El archivo no es un diseño de Sandbox PTAR (faltan "datos" o "unidades").');
  }
  const avisos: string[] = [];
  const d = json.datos;
  const datos = {
    ...numeros(defecto.datos, d),
    influente: numeros(defecto.datos.influente, d.influente),
    terreno: numeros(defecto.datos.terreno, d.terreno),
  };

  const ids = new Set<string>();
  const unidades: UnidadInstancia[] = [];
  for (const [i, bruto] of json.unidades.entries()) {
    if (!esObjeto(bruto)) continue;
    const cat = catalogo.unidades.find((c) => c.id === bruto.tipo);
    if (!cat) {
      avisos.push(`Se omitió una unidad de tipo desconocido: "${String(bruto.tipo)}".`);
      continue;
    }
    let id = typeof bruto.id === 'string' && bruto.id ? bruto.id : `u${i}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const dim: Dimensiones = { ...cat.dimensionesDefecto };
    if (esObjeto(bruto.dim)) {
      for (const k of Object.keys(dim) as (keyof Dimensiones)[]) {
        const v = bruto.dim[k];
        if (esNumero(v) && v >= 0) dim[k] = v;
      }
    }
    const params: Record<string, number | string> = {};
    for (const p of cat.parametros) {
      const v = esObjeto(bruto.params) ? bruto.params[p.id] : undefined;
      const valido = p.tipo === 'opcion' ? typeof v === 'string' && !!p.opciones?.some((o) => o.valor === v) : esNumero(v);
      params[p.id] = valido ? (v as number | string) : p.defecto;
    }
    unidades.push({
      id,
      tipo: cat.id,
      ...(typeof bruto.etiqueta === 'string' && bruto.etiqueta ? { etiqueta: bruto.etiqueta } : {}),
      x: esNumero(bruto.x) ? bruto.x : 0,
      y: esNumero(bruto.y) ? bruto.y : 0,
      rot: ([0, 90, 180, 270].includes(bruto.rot as number) ? bruto.rot : 0) as Rotacion,
      forma: cat.formas.includes(bruto.forma as never) ? (bruto.forma as UnidadInstancia['forma']) : cat.formas[0],
      dim,
      params,
    });
  }

  const puerto = (unidad: unknown, id: unknown, tipo: 'entrada' | 'salida') => {
    const u = unidades.find((v) => v.id === unidad);
    return catalogo.unidades.find((c) => c.id === u?.tipo)?.puertos.find((p) => p.id === id && p.tipo === tipo);
  };
  const tuberias: Tuberia[] = [];
  let omitidas = 0;
  for (const [i, bruto] of (Array.isArray(json.tuberias) ? json.tuberias : []).entries()) {
    if (!esObjeto(bruto) || !esObjeto(bruto.desde) || !esObjeto(bruto.hasta)) continue;
    const origen = puerto(bruto.desde.unidad, bruto.desde.puerto, 'salida');
    const destino = puerto(bruto.hasta.unidad, bruto.hasta.puerto, 'entrada');
    if (!origen || !destino) {
      omitidas += 1;
      continue;
    }
    let id = typeof bruto.id === 'string' && bruto.id ? bruto.id : `t${i}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const puntos = (Array.isArray(bruto.puntos) ? bruto.puntos : []).filter(
      (p): p is [number, number] => Array.isArray(p) && p.length === 2 && esNumero(p[0]) && esNumero(p[1]),
    );
    tuberias.push({
      id,
      desde: { unidad: String(bruto.desde.unidad), puerto: origen.id },
      hasta: { unidad: String(bruto.hasta.unidad), puerto: destino.id },
      fluido: origen.fluido,
      dn_mm: esNumero(bruto.dn_mm) && bruto.dn_mm > 0 ? bruto.dn_mm : 250,
      material: typeof bruto.material === 'string' ? bruto.material : 'PVC',
      regimen: (bruto.regimen === 'gravedad' ? 'gravedad' : 'presion') as Regimen,
      puntos,
    });
  }
  if (omitidas > 0) avisos.push(`Se omitieron ${omitidas} tuberías con extremos que no existen.`);

  return {
    diseno: {
      version: 1,
      alumno: typeof json.alumno === 'string' ? json.alumno : '',
      proyecto: typeof json.proyecto === 'string' ? json.proyecto : defecto.proyecto,
      datos,
      unidades,
      tuberias,
    },
    avisos,
  };
}

/** Mezcla profunda: los valores de `extra` sustituyen a los de `base`; los arreglos se reemplazan completos. */
export function fusionar<T>(base: T, extra: unknown): T {
  if (!esObjeto(base) || !esObjeto(extra)) return (extra === undefined ? base : extra) as T;
  const r: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(extra)) r[k] = k in base ? fusionar((base as Record<string, unknown>)[k], v) : v;
  return r as T;
}

/**
 * Lee una configuración exportada desde el modo profesor. Lo que falte se
 * completa con los valores de fábrica. Lanza un Error si no es una configuración.
 */
export function leerConfig(json: unknown, fabrica: ConfigEditable): ConfigEditable {
  if (!esObjeto(json) || json.tipo !== TIPO_CONFIG) {
    throw new Error('El archivo no es una configuración de Sandbox PTAR.');
  }
  const seccion = <K extends keyof ConfigEditable>(k: K): ConfigEditable[K] =>
    esObjeto(json[k]) ? fusionar(fabrica[k], json[k]) : fabrica[k];
  // en los rangos, la unidad importada reemplaza completa a la de fábrica
  const rangos = esObjeto(json.rangos) ? { ...fabrica.rangos, ...(json.rangos as Record<string, RangosUnidad>) } : fabrica.rangos;
  return { general: seccion('general'), rangos, eficiencias: seccion('eficiencias'), precios: seccion('precios') };
}

export function serializarConfig(c: ConfigEditable): string {
  return JSON.stringify({ tipo: TIPO_CONFIG, version: 1, exportado: new Date().toISOString().slice(0, 10), ...c }, null, 2);
}

/** Cambia un valor dentro de un objeto anidado sin mutarlo. */
export function fijarEn<T>(obj: T, ruta: (string | number)[], valor: unknown): T {
  if (ruta.length === 0) return valor as T;
  const [k, ...resto] = ruta;
  if (Array.isArray(obj)) {
    const copia = [...obj];
    copia[k as number] = fijarEn(copia[k as number], resto, valor);
    return copia as unknown as T;
  }
  const base = (obj ?? {}) as Record<string, unknown>;
  if (resto.length === 0 && valor === undefined) {
    const { [k]: _quitado, ...sin } = base;
    return sin as T;
  }
  return { ...base, [k]: fijarEn(base[k], resto, valor) } as T;
}
