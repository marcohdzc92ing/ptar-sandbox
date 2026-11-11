import { describe, expect, it } from 'vitest';
import type { Catalogo, ConfigTuberias, Diseno, Tuberia, UnidadInstancia } from '../types';
import catalogoJson from '../data/catalogo.json';
import tuberiasJson from '../data/tuberias.json';
import ejemplo from '../data/ejemplo-50lps.json';
import { propagarCaudal } from './grafo';
import { evaluarTuberia } from './tuberias';
import { lpsAm3d } from './unidades';

const catalogo = catalogoJson as unknown as Catalogo;
const cfg = tuberiasJson as unknown as ConfigTuberias;

function unidad(id: string, tipo: string, params: Record<string, number | string> = {}): UnidadInstancia {
  return { id, tipo, x: 0, y: 0, rot: 0, forma: 'rectangular', dim: {}, params };
}
function tubo(id: string, a: string, pa: string, b: string, pb: string): Tuberia {
  return { id, desde: { unidad: a, puerto: pa }, hasta: { unidad: b, puerto: pb }, fluido: 'agua', dn_mm: 250, material: 'PVC', regimen: 'presion', puntos: [] };
}

describe('propagación de caudal', () => {
  it('cadena simple: el caudal pasa completo', () => {
    const us = [unidad('f', 'influente'), unidad('c', 'canal_entrada'), unidad('d', 'descarga_alcantarillado')];
    const ts = [tubo('1', 'f', 'out', 'c', 'in'), tubo('2', 'c', 'out', 'd', 'in')];
    const r = propagarCaudal(us, ts, catalogo, 1000);
    expect(r.tuberias).toEqual({ '1': 1000, '2': 1000 });
    expect(r.unidades.d.entrada).toBe(1000);
    expect(r.convergio).toBe(true);
  });

  it('sin influente no hay caudal', () => {
    const us = [unidad('c', 'canal_entrada'), unidad('d', 'descarga_alcantarillado')];
    const r = propagarCaudal(us, [tubo('1', 'c', 'out', 'd', 'in')], catalogo, 1000);
    expect(r.tuberias['1']).toBe(0);
  });

  it('dos tuberías en la misma salida se reparten por mitades y luego se suman', () => {
    const us = [unidad('f', 'influente'), unidad('a', 'canal_entrada'), unidad('b', 'canal_entrada'), unidad('d', 'descarga_alcantarillado')];
    const ts = [tubo('1', 'f', 'out', 'a', 'in'), tubo('2', 'f', 'out', 'b', 'in'), tubo('3', 'a', 'out', 'd', 'in'), tubo('4', 'b', 'out', 'd', 'in')];
    const r = propagarCaudal(us, ts, catalogo, 1000);
    expect(r.tuberias['1']).toBe(500);
    expect(r.tuberias['2']).toBe(500);
    expect(r.unidades.d.entrada).toBe(1000);
  });

  it('la purga de lodos se resta del efluente', () => {
    const us = [unidad('f', 'influente'), unidad('s', 'sedimentador_primario', { purga_m3d: 40 }), unidad('e', 'espesador'), unidad('d', 'descarga_alcantarillado')];
    const ts = [tubo('1', 'f', 'out', 's', 'in'), tubo('2', 's', 'out', 'd', 'in'), tubo('3', 's', 'lodos', 'e', 'in')];
    const r = propagarCaudal(us, ts, catalogo, 1000);
    expect(r.tuberias['2']).toBe(960);
    expect(r.tuberias['3']).toBe(40);
    // espesador: 60 % sobrenadante por defecto
    expect(r.unidades.e.salidas.sobrenadante).toBeCloseTo(24);
    expect(r.unidades.e.salidas.out).toBeCloseTo(16);
  });

  it('la recirculación de lodos se suma en el reactor y el sedimentador', () => {
    const us = [
      unidad('f', 'influente'),
      unidad('r', 'lodos_activados', { recirculacion: 75 }),
      unidad('s', 'sedimentador_secundario', { purga_m3d: 60 }),
      unidad('d', 'descarga_alcantarillado'),
    ];
    const ts = [tubo('1', 'f', 'out', 'r', 'in'), tubo('2', 'r', 'out', 's', 'in'), tubo('3', 's', 'ras', 'r', 'ras'), tubo('4', 's', 'out', 'd', 'in')];
    const r = propagarCaudal(us, ts, catalogo, 4000);
    expect(r.tuberias['3']).toBeCloseTo(3000);
    expect(r.tuberias['2']).toBeCloseTo(7000);
    expect(r.unidades.r.fresco).toBeCloseTo(4000);
    expect(r.unidades.r.entrada).toBeCloseTo(7000);
    expect(r.unidades.s.entrada).toBeCloseTo(7000);
    expect(r.tuberias['4']).toBeCloseTo(3940);
    expect(r.convergio).toBe(true);
  });

  it('sin tubería de recirculación no se suma nada', () => {
    const us = [unidad('f', 'influente'), unidad('r', 'lodos_activados', { recirculacion: 75 }), unidad('s', 'sedimentador_secundario')];
    const r = propagarCaudal(us, [tubo('1', 'f', 'out', 'r', 'in'), tubo('2', 'r', 'out', 's', 'in')], catalogo, 4000);
    expect(r.tuberias['2']).toBeCloseTo(4000);
  });

  it('ósmosis: se resta el rechazo; con retorno a cabeza converge a la serie geométrica', () => {
    const us = [unidad('f', 'influente'), unidad('c', 'carcamo_rebombeo'), unidad('o', 'osmosis_inversa', { recuperacion_pct: 75 }), unidad('d', 'reuso_directo'), unidad('x', 'descarga_alcantarillado')];
    const base = [tubo('1', 'f', 'out', 'c', 'in'), tubo('2', 'c', 'out', 'o', 'in'), tubo('3', 'o', 'out', 'd', 'in')];
    const abierto = propagarCaudal(us, [...base, tubo('4', 'o', 'rechazo', 'x', 'in')], catalogo, 3000);
    expect(abierto.tuberias['3']).toBeCloseTo(2250);
    expect(abierto.tuberias['4']).toBeCloseTo(750);

    // rechazo de regreso al cárcamo: x = Q + 0.25·x  →  x = Q / 0.75
    const cerrado = propagarCaudal(us, [...base, tubo('4', 'o', 'rechazo', 'c', 'in')], catalogo, 3000);
    expect(cerrado.convergio).toBe(true);
    expect(cerrado.unidades.c.entrada).toBeCloseTo(4000, 3);
    expect(cerrado.tuberias['3']).toBeCloseTo(3000, 3);
  });

  it('avisa si las extracciones superan la entrada', () => {
    const us = [unidad('f', 'influente'), unidad('s', 'sedimentador_primario', { purga_m3d: 500 })];
    const r = propagarCaudal(us, [tubo('1', 'f', 'out', 's', 'in')], catalogo, 100);
    expect(r.avisos.map((a) => a.unidad)).toEqual(['s']);
    expect(r.unidades.s.salidas.out).toBe(0);
  });

  it('el aire no entra al balance', () => {
    const us = [unidad('f', 'influente'), unidad('b', 'sopladores'), unidad('r', 'lodos_activados')];
    const aire = { ...tubo('2', 'b', 'aire', 'r', 'aire'), fluido: 'aire' as const };
    const r = propagarCaudal(us, [tubo('1', 'f', 'out', 'r', 'in'), aire], catalogo, 1000);
    expect(r.tuberias['2']).toBeNull();
    expect(r.unidades.r.entrada).toBe(1000);
  });
});

describe('diseño de ejemplo (50 L/s)', () => {
  const d = ejemplo as unknown as Diseno;
  const med = propagarCaudal(d.unidades, d.tuberias, catalogo, lpsAm3d(d.datos.Qmed_Ls));
  const max = propagarCaudal(d.unidades, d.tuberias, catalogo, lpsAm3d(d.datos.Qmax_Ls));

  it('balance a Qmed', () => {
    expect(med.convergio).toBe(true);
    expect(med.avisos).toEqual([]);
    expect(med.tuberias.p6).toBeCloseTo(4320);
    expect(med.tuberias.p7).toBeCloseTo(4280);
    expect(med.tuberias.p9).toBeCloseTo(3210);
    expect(med.tuberias.p8).toBeCloseTo(7490);
    expect(med.tuberias.p10).toBeCloseTo(4220);
    expect(med.tuberias.p11).toBeCloseTo(4220);
    expect(med.unidades.e12.entrada).toBeCloseTo(100);
    expect(med.tuberias.p14).toBeCloseTo(40);
  });

  it('ninguna tubería tiene alerta de velocidad', () => {
    for (const t of d.tuberias) {
      const e = evaluarTuberia(t, med.tuberias[t.id], max.tuberias[t.id], cfg, 0.15);
      expect(['verde', 'sin_evaluar'], `${t.id}: ${e.mensajes.join(' ')}`).toContain(e.estado);
    }
  });
});
