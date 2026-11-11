import { describe, expect, it } from 'vitest';
import type { Catalogo, ConfigGeneral, ConfigPrecios, Diseno, Eficiencias, RangosUnidad } from '../types';
import catalogoJson from '../data/catalogo.json';
import rangosJson from '../data/rangos.json';
import eficienciasJson from '../data/eficiencias.json';
import preciosJson from '../data/precios.json';
import proyectoDefecto from '../data/proyectoDefecto.json';
import ejemplo from '../data/ejemplo-50lps.json';
import { fijarEn, fusionar, leerConfig, leerDiseno, serializarConfig, type ConfigEditable } from './archivo';

const catalogo = catalogoJson as unknown as Catalogo;
const defecto = proyectoDefecto as unknown as Diseno;
const fabrica: ConfigEditable = {
  general: rangosJson.general as ConfigGeneral,
  rangos: rangosJson.unidades as unknown as Record<string, RangosUnidad>,
  eficiencias: eficienciasJson as unknown as Eficiencias,
  precios: preciosJson as unknown as ConfigPrecios,
};

describe('lectura de un diseño', () => {
  it('el ejemplo sobrevive a guardar y volver a cargar', () => {
    const { diseno, avisos } = leerDiseno(JSON.parse(JSON.stringify(ejemplo)), catalogo, defecto);
    expect(avisos).toEqual([]);
    expect(diseno.unidades).toHaveLength(ejemplo.unidades.length);
    expect(diseno.tuberias).toHaveLength(ejemplo.tuberias.length);
    expect(diseno.datos.Qmed_Ls).toBe(50);
    expect(diseno.tuberias.find((t) => t.id === 'p10')?.puntos).toEqual([[97, 47.5]]);
    expect(diseno.unidades.find((u) => u.id === 'e7')).toMatchObject({ rot: 90, forma: 'circular', dim: { diametro: 8.5, modulos: 2 } });
  });

  it('rechaza archivos que no son un diseño', () => {
    expect(() => leerDiseno({ hola: 1 }, catalogo, defecto)).toThrow('no es un diseño');
    expect(() => leerDiseno([1, 2], catalogo, defecto)).toThrow();
    expect(() => leerDiseno(null, catalogo, defecto)).toThrow();
  });

  it('descarta unidades desconocidas y tuberías huérfanas, y lo avisa', () => {
    const json = {
      datos: { Qmed_Ls: 30 },
      unidades: [
        { id: 'a', tipo: 'influente', x: 1, y: 2 },
        { id: 'b', tipo: 'reactor_cuantico', x: 0, y: 0 },
        { id: 'c', tipo: 'canal_entrada', x: 5, y: 2 },
      ],
      tuberias: [
        { id: 't1', desde: { unidad: 'a', puerto: 'out' }, hasta: { unidad: 'c', puerto: 'in' } },
        { id: 't2', desde: { unidad: 'b', puerto: 'out' }, hasta: { unidad: 'c', puerto: 'in' } },
        { id: 't3', desde: { unidad: 'c', puerto: 'in' }, hasta: { unidad: 'a', puerto: 'out' } },
      ],
    };
    const { diseno, avisos } = leerDiseno(json, catalogo, defecto);
    expect(diseno.unidades.map((u) => u.id)).toEqual(['a', 'c']);
    expect(diseno.tuberias.map((t) => t.id)).toEqual(['t1']);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain('reactor_cuantico');
  });

  it('completa lo que falta con valores por defecto y corrige lo inválido', () => {
    const json = {
      datos: { Qmed_Ls: 30, Qmax_Ls: 'mucho', terreno: { largo: 200 } },
      unidades: [{ id: 'f', tipo: 'filtro_percolador', x: 3, y: 4, rot: 45, forma: 'triangular', dim: { diametro: 12, largo: 99 }, params: { tasa: 'inventada', recirculacion: 150 } }],
    };
    const { diseno } = leerDiseno(json, catalogo, defecto);
    expect(diseno.datos.Qmed_Ls).toBe(30);
    expect(diseno.datos.Qmax_Ls).toBe(defecto.datos.Qmax_Ls);
    expect(diseno.datos.terreno).toEqual({ largo: 200, ancho: defecto.datos.terreno.ancho });
    expect(diseno.datos.influente).toEqual(defecto.datos.influente);
    const u = diseno.unidades[0];
    expect(u.rot).toBe(0);
    expect(u.forma).toBe('circular');
    expect(u.dim.diametro).toBe(12);
    expect(u.dim.largo).toBeUndefined();
    expect(u.params).toEqual({ tasa: 'alta_tasa', recirculacion: 150 });
  });

  it('no deja identificadores repetidos', () => {
    const json = { datos: {}, unidades: [{ id: 'a', tipo: 'influente' }, { id: 'a', tipo: 'canal_entrada' }] };
    const ids = leerDiseno(json, catalogo, defecto).diseno.unidades.map((u) => u.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('configuración del profesor', () => {
  it('exportar e importar devuelve la misma configuración', () => {
    const leida = leerConfig(JSON.parse(serializarConfig(fabrica)), fabrica);
    expect(leida).toEqual(fabrica);
  });

  it('una configuración parcial se completa con los valores de fábrica', () => {
    const parcial = { tipo: 'ptar-config', precios: { obraCivil: { concreto_m3: { precio: 6200 } } }, general: { separacionMinima_m: 2 } };
    const c = leerConfig(parcial, fabrica);
    expect(c.precios.obraCivil.concreto_m3.precio).toBe(6200);
    expect(c.precios.obraCivil.concreto_m3.fuente).toBe(fabrica.precios.obraCivil.concreto_m3.fuente);
    expect(c.precios.obraCivil.acero_kg).toEqual(fabrica.precios.obraCivil.acero_kg);
    expect(c.general.separacionMinima_m).toBe(2);
    expect(c.general.toleranciaAmarillo).toBe(0.15);
    expect(c.rangos).toEqual(fabrica.rangos);
  });

  it('rechaza archivos que no son configuración (por ejemplo, un diseño)', () => {
    expect(() => leerConfig(ejemplo, fabrica)).toThrow('no es una configuración');
  });

  it('fusionar reemplaza arreglos completos y fijarEn no muta el original', () => {
    expect(fusionar({ a: [1, 2, 3], b: { c: 1, d: 2 } }, { a: [9], b: { c: 5 } })).toEqual({ a: [9], b: { c: 5, d: 2 } });
    const original = { a: { b: [{ min: 1 }, { min: 2 }] } };
    const cambiado = fijarEn(original, ['a', 'b', 1, 'min'], 7);
    expect(cambiado.a.b[1].min).toBe(7);
    expect(original.a.b[1].min).toBe(2);
    expect(cambiado.a.b[0]).toBe(original.a.b[0]);
    expect(fijarEn({ x: 1, y: 2 }, ['y'], undefined)).toEqual({ x: 1 });
  });
});
