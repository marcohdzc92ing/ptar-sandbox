import { describe, expect, it } from 'vitest';
import type { Catalogo, ConfigNormas, Diseno, Eficiencias, LimiteNorma, Tuberia, UnidadInstancia } from '../types';
import catalogoJson from '../data/catalogo.json';
import eficienciasJson from '../data/eficiencias.json';
import normasJson from '../data/normas.json';
import ejemplo from '../data/ejemplo-50lps.json';
import { propagarCalidad } from './calidad';
import { propagarCaudal } from './grafo';
import { aguasArriba, compararConNorma, compararFila, limiteAplicable } from './normas';
import { lpsAm3d } from './unidades';

const catalogo = catalogoJson as unknown as Catalogo;
const eficiencias = eficienciasJson as unknown as Eficiencias;
const normas = normasJson as unknown as ConfigNormas;

const limite = (extra: Partial<LimiteNorma>): LimiteNorma => ({
  parametro: 'SST', nombreNorma: 'SST', unidad: 'mg/L', aplica: true, pm: 60, pd: 72, vi: 84, verificado: false, ...extra,
});
function unidad(id: string, tipo: string, params: UnidadInstancia['params'] = {}): UnidadInstancia {
  return { id, tipo, x: 0, y: 0, rot: 0, forma: 'rectangular', dim: {}, params };
}
function tubo(id: string, a: string, pa: string, b: string, pb: string, fluido: Tuberia['fluido'] = 'agua'): Tuberia {
  return { id, desde: { unidad: a, puerto: pa }, hasta: { unidad: b, puerto: pb }, fluido, dn_mm: 250, material: 'PVC', regimen: 'presion', puntos: [] };
}

describe('comparación contra un límite', () => {
  it('usa el promedio mensual; si falta, el diario o el instantáneo', () => {
    expect(limiteAplicable(limite({}))).toEqual({ valor: 60, tipo: 'P.M.' });
    expect(limiteAplicable(limite({ pm: null }))).toEqual({ valor: 72, tipo: 'P.D.' });
    expect(limiteAplicable(limite({ pm: null, pd: null, vi: 40 }))).toEqual({ valor: 40, tipo: 'V.I.' });
    expect(limiteAplicable(limite({ pm: null, pd: null, vi: null }))).toBeNull();
  });

  it('cumple en el límite exacto y no cumple por encima', () => {
    expect(compararFila(limite({}), { SST: 60 }).estado).toBe('cumple');
    expect(compararFila(limite({}), { SST: 60.1 }).estado).toBe('no_cumple');
  });

  it('distingue "no aplica", "sin límite" y "sin dato"', () => {
    expect(compararFila(limite({ aplica: false, pm: null, pd: null, vi: null }), { SST: 500 }).estado).toBe('no_aplica');
    expect(compararFila(limite({ pm: null, pd: null, vi: null }), { SST: 500 }).estado).toBe('sin_limite');
    expect(compararFila(limite({}), null).estado).toBe('sin_dato');
  });

  it('cota superior: si excede, no se concluye incumplimiento', () => {
    const l = limite({ parametro: 'CF', pm: 250, comparacion: 'cota_superior' });
    expect(compararFila(l, { CF: 100 }).estado).toBe('cumple');
    expect(compararFila(l, { CF: 1000 }).estado).toBe('no_concluyente');
  });
});

describe('normas.json', () => {
  it('todos los límites están marcados como no verificados', () => {
    for (const n of Object.values(normas.normas)) {
      for (const c of Object.values(n.categorias)) {
        for (const l of c.limites) expect(l.verificado).toBe(false);
      }
    }
  });

  it('cada destino del catálogo tiene norma y sus categorías existen', () => {
    for (const cat of catalogo.unidades.filter((u) => u.etapa === 'destino')) {
      const d = normas.destinos[cat.id];
      expect(d, cat.id).toBeDefined();
      const norma = normas.normas[d.norma];
      expect(norma, d.norma).toBeDefined();
      const opciones = d.categoria
        ? [d.categoria]
        : (cat.parametros.find((p) => p.id === d.categoriaParam)?.opciones ?? []).map((o) => o.valor);
      expect(opciones.length).toBeGreaterThan(0);
      for (const o of opciones) expect(norma.categorias[o], `${cat.id}/${o}`).toBeDefined();
    }
  });

  it('la categoría depende del parámetro elegido en el destino', () => {
    const calidad = { SST: 50, DQO: 90, NT: 20, PT: 4, GyA: 5, CF: 100, HH: 0.5, T: 25, DBO5: 25 };
    const rios = compararConNorma(unidad('d', 'descarga_cuerpo_receptor', { receptor: 'rios' }), calidad, normas)!;
    const embalses = compararConNorma(unidad('d', 'descarga_cuerpo_receptor', { receptor: 'embalses' }), calidad, normas)!;
    expect(rios.normaId).toBe('NOM-001-SEMARNAT-2021');
    expect(rios.filas.find((f) => f.parametro === 'SST')?.estado).toBe('cumple');
    expect(embalses.filas.find((f) => f.parametro === 'SST')?.estado).toBe('no_cumple');
    expect(embalses.cumple).toBe(false);
    // riego según NOM-003: contacto directo exige DBO₅ ≤ 20
    const riego = compararConNorma(unidad('d', 'riego', { contacto: 'directo' }), calidad, normas)!;
    expect(riego.normaId).toBe('NOM-003-SEMARNAT-1997');
    expect(riego.filas.find((f) => f.parametro === 'DBO5')?.estado).toBe('no_cumple');
  });

  it('NOM-002: DBO₅ y SST quedan sin límite porque la norma remite a otra', () => {
    const r = compararConNorma(unidad('d', 'descarga_alcantarillado'), { DBO5: 300, SST: 300, GyA: 40, T: 25 }, normas)!;
    expect(r.filas.find((f) => f.parametro === 'DBO5')?.estado).toBe('sin_limite');
    expect(r.filas.find((f) => f.parametro === 'T')).toMatchObject({ limite: 40, tipoLimite: 'V.I.', estado: 'cumple' });
    expect(r.cumple).toBe(true);
  });

  it('una unidad que no es destino no tiene norma', () => {
    expect(compararConNorma(unidad('x', 'canal_entrada'), {}, normas)).toBeNull();
  });
});

describe('propagación de calidad', () => {
  it('mezcla ponderada por caudal de dos líneas en paralelo', () => {
    // mitad del caudal pasa por un sedimentador primario (SST −60 %), mitad por un canal
    const us = [unidad('f', 'influente'), unidad('s', 'sedimentador_primario', { purga_m3d: 0 }), unidad('c', 'canal_entrada'), unidad('d', 'descarga_alcantarillado')];
    const ts = [tubo('1', 'f', 'out', 's', 'in'), tubo('2', 'f', 'out', 'c', 'in'), tubo('3', 's', 'out', 'd', 'in'), tubo('4', 'c', 'out', 'd', 'in')];
    const q = propagarCaudal(us, ts, catalogo, 1000);
    const cal = propagarCalidad(us, ts, catalogo, eficiencias, { SST: 200, CF: 1e6 }, q);
    expect(cal.s.salida?.SST).toBeCloseTo(80);
    expect(cal.d.entrada?.SST).toBeCloseTo(140);
  });

  it('una unidad sin conexión no tiene calidad', () => {
    const us = [unidad('f', 'influente'), unidad('d', 'descarga_alcantarillado')];
    const cal = propagarCalidad(us, [], catalogo, eficiencias, { SST: 200 }, propagarCaudal(us, [], catalogo, 1000));
    expect(cal.d.entrada).toBeNull();
  });

  it('aguas arriba ignora recirculaciones', () => {
    const ts = [tubo('1', 'a', 'out', 'b', 'in'), tubo('2', 'b', 'out', 'c', 'in'), tubo('3', 'c', 'ras', 'b', 'ras', 'recirculacion'), tubo('4', 'c', 'out', 'd', 'in')];
    expect([...aguasArriba('c', ts)].sort()).toEqual(['a', 'b']);
    expect([...aguasArriba('b', ts)]).toEqual(['a']);
  });
});

describe('diseño de ejemplo (50 L/s) contra NOM-001, ríos', () => {
  const d = ejemplo as unknown as Diseno;
  const q = propagarCaudal(d.unidades, d.tuberias, catalogo, lpsAm3d(d.datos.Qmed_Ls));
  const cal = propagarCalidad(d.unidades, d.tuberias, catalogo, eficiencias, { ...d.datos.influente }, q);
  const destino = d.unidades.find((u) => u.tipo === 'descarga_cuerpo_receptor')!;
  const r = compararConNorma(destino, cal[destino.id].entrada, normas)!;
  const fila = (p: string) => r.filas.find((f) => f.parametro === p)!;

  it('estima la calidad del efluente', () => {
    expect(fila('SST').estimado).toBeCloseTo(250 * 0.95 * 0.95 * 0.4 * 0.2, 3);
    expect(fila('DQO').estimado).toBeCloseTo(500 * 0.7 * 0.2 * 0.7, 3);
    expect(fila('T').estimado).toBe(20);
  });

  it('cumple SST, DQO, grasas y fósforo; el nitrógeno total excede el límite', () => {
    for (const p of ['SST', 'DQO', 'GyA', 'PT', 'T', 'CF']) expect(fila(p).estado, p).toBe('cumple');
    expect(fila('NT').estimado).toBeCloseTo(27);
    expect(fila('NT').estado).toBe('no_cumple');
    expect(fila('HH').estado).toBe('sin_limite');
    expect(r.cumple).toBe(false);
  });
});
