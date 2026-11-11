import { describe, expect, it } from 'vitest';
import type { Diseno, UnidadInstancia } from '../types';
import ejemplo from '../data/ejemplo-50lps.json';
import {
  ajustarACuadricula,
  areaOcupada,
  areaUnidad,
  dentroDeTerreno,
  dimsHuella,
  distanciaFormas,
  distanciaUnidades,
  puertoMundo,
  revisarDisposicion,
  volumenModulo,
} from './geometria';
import { lpsAm3d, m3dALps } from './unidades';

const SEP = 1.5;

function rect(id: string, x: number, y: number, largo: number, ancho: number, extra: Partial<UnidadInstancia> = {}): UnidadInstancia {
  return { id, tipo: 't', x, y, rot: 0, forma: 'rectangular', dim: { largo, ancho, profundidadUtil: 4, modulos: 1 }, params: {}, ...extra };
}
function circ(id: string, x: number, y: number, diametro: number, modulos = 1): UnidadInstancia {
  return { id, tipo: 't', x, y, rot: 0, forma: 'circular', dim: { diametro, profundidadUtil: 3, modulos }, params: {} };
}

describe('conversión de caudal', () => {
  it('50 L/s son 4 320 m³/d y viceversa', () => {
    expect(lpsAm3d(50)).toBeCloseTo(4320);
    expect(m3dALps(4320)).toBeCloseTo(50);
  });
});

describe('huella', () => {
  it('módulos rectangulares se adosan a lo ancho', () => {
    const u = rect('a', 0, 0, 18, 7.5);
    u.dim.modulos = 2;
    expect(dimsHuella(u, SEP)).toEqual({ w: 18, h: 15 });
    expect(areaUnidad(u)).toBeCloseTo(270);
  });
  it('rotar 90° intercambia largo y ancho', () => {
    const u = rect('a', 0, 0, 10, 4, { rot: 90 });
    expect(dimsHuella(u, SEP)).toEqual({ w: 4, h: 10 });
  });
  it('módulos circulares van en fila con separación', () => {
    const u = circ('a', 0, 0, 10, 2);
    expect(dimsHuella(u, SEP)).toEqual({ w: 21.5, h: 10 });
    expect(areaUnidad(u)).toBeCloseTo(2 * Math.PI * 25);
  });
  it('volumen útil por módulo', () => {
    expect(volumenModulo(rect('a', 0, 0, 18, 7.5))).toBeCloseTo(540);
  });
});

describe('distancias', () => {
  it('rectángulos separados, tocándose y traslapados', () => {
    const a = { tipo: 'rect' as const, cx: 0, cy: 0, w: 4, h: 4 };
    expect(distanciaFormas(a, { ...a, cx: 7 })).toBeCloseTo(3);
    expect(distanciaFormas(a, { ...a, cx: 4 })).toBeCloseTo(0);
    expect(distanciaFormas(a, { ...a, cx: 3 })).toBeLessThan(0);
    expect(distanciaFormas(a, { ...a, cx: 7, cy: 8 })).toBeCloseTo(5);
  });
  it('círculo contra círculo y contra rectángulo', () => {
    const c = { tipo: 'circ' as const, cx: 0, cy: 0, r: 5 };
    expect(distanciaFormas(c, { ...c, cx: 12 })).toBeCloseTo(2);
    const r = { tipo: 'rect' as const, cx: 10, cy: 0, w: 4, h: 4 };
    expect(distanciaFormas(c, r)).toBeCloseTo(3);
    expect(distanciaFormas(r, c)).toBeCloseTo(3);
    expect(distanciaFormas(c, { ...r, cx: 6 })).toBeLessThan(0);
  });
  it('un círculo en la esquina de un rectángulo no traslapa si la diagonal libra', () => {
    const c = { tipo: 'circ' as const, cx: 0, cy: 0, r: 5 };
    const r = { tipo: 'rect' as const, cx: 6, cy: 6, w: 4, h: 4 };
    // esquina más cercana en (4, 4): distancia 5.657 − 5
    expect(distanciaFormas(c, r)).toBeCloseTo(Math.hypot(4, 4) - 5);
  });
  it('considera todos los módulos circulares', () => {
    const a = circ('a', 0, 0, 10, 2); // ocupa x de −10.75 a 10.75
    const b = rect('b', 14.75, 0, 4, 4); // inicia en x = 12.75
    expect(distanciaUnidades(a, b, SEP)).toBeCloseTo(2);
  });
});

describe('revisión de disposición', () => {
  const terreno = { largo: 50, ancho: 30 };
  it('detecta traslape, separación insuficiente y fuera del terreno', () => {
    const us = [rect('a', 5, 5, 4, 4), rect('b', 8, 5, 4, 4), rect('c', 20, 5, 4, 4), rect('d', 25, 5, 4, 4), rect('e', 49, 5, 4, 4)];
    const p = revisarDisposicion(us, terreno, 1.5, SEP);
    expect(p).toContainEqual({ tipo: 'traslape', unidades: ['a', 'b'] });
    expect(p.find((x) => x.tipo === 'separacion')).toMatchObject({ unidades: ['c', 'd'] });
    expect(p.find((x) => x.tipo === 'separacion')?.distancia).toBeCloseTo(1);
    expect(p).toContainEqual({ tipo: 'fuera', unidades: ['e'] });
    expect(p).toHaveLength(3);
  });
  it('acepta una separación exactamente igual a la mínima', () => {
    const us = [rect('a', 5, 5, 4, 4), rect('b', 10.5, 5, 4, 4)];
    expect(revisarDisposicion(us, terreno, 1.5, SEP)).toEqual([]);
  });
  it('una unidad al ras del lindero está dentro', () => {
    expect(dentroDeTerreno(rect('a', 2, 2, 4, 4), terreno, SEP)).toBe(true);
    expect(dentroDeTerreno(rect('a', 1.9, 2, 4, 4), terreno, SEP)).toBe(false);
  });
});

describe('ajuste a cuadrícula', () => {
  it('alinea la esquina de la huella, no el centro', () => {
    expect(ajustarACuadricula(5.3, 7.8, { w: 3, h: 0.6 }, 1)).toEqual({ x: 5.5, y: 8.3 });
    expect(ajustarACuadricula(5.3, 7.8, { w: 3, h: 0.6 }, 0.5).x).toBeCloseTo(5.5);
    expect(ajustarACuadricula(5.3, 7.8, { w: 3, h: 0.6 }, 0.5).y).toBeCloseTo(7.8);
  });
});

describe('puertos', () => {
  it('siguen la rotación de la unidad', () => {
    const puerto = { id: 'out', nombre: '', tipo: 'salida' as const, fluido: 'agua' as const, lado: 'E' as const, obligatorio: true };
    const u = rect('a', 10, 10, 6, 2);
    expect(puertoMundo(u, puerto, SEP)).toEqual({ x: 13, y: 10 });
    const p90 = puertoMundo({ ...u, rot: 90 }, puerto, SEP);
    expect(p90.x).toBeCloseTo(10);
    expect(p90.y).toBeCloseTo(13);
  });
});

describe('diseño de ejemplo (50 L/s)', () => {
  const d = ejemplo as unknown as Diseno;
  it('no tiene problemas de disposición', () => {
    expect(revisarDisposicion(d.unidades, d.datos.terreno, d.datos.separacionMinima_m, SEP)).toEqual([]);
  });
  it('ocupa menos área que el terreno', () => {
    expect(areaOcupada(d.unidades)).toBeLessThan(d.datos.terreno.largo * d.datos.terreno.ancho);
  });
});
