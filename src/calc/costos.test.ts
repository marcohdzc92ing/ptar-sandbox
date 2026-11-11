import { describe, expect, it } from 'vitest';
import type { Catalogo, ConfigPrecios, Diseno, Tuberia, UnidadInstancia } from '../types';
import catalogoJson from '../data/catalogo.json';
import preciosJson from '../data/precios.json';
import ejemplo from '../data/ejemplo-50lps.json';
import { calcularCostos, cantidadesCivil, potenciaOperacion, precioTuberia_m } from './costos';
import { propagarCaudal } from './grafo';
import { longitudRuta, rutaTuberia } from './tuberias';
import { lpsAm3d } from './unidades';

const catalogo = catalogoJson as unknown as Catalogo;
const precios = preciosJson as unknown as ConfigPrecios;
const oc = precios.obraCivil;
const cat = (tipo: string) => catalogo.unidades.find((c) => c.id === tipo)!;

function unidad(id: string, tipo: string, dim: UnidadInstancia['dim'], params: UnidadInstancia['params'] = {}, forma: UnidadInstancia['forma'] = 'rectangular'): UnidadInstancia {
  return { id, tipo, x: 0, y: 0, rot: 0, forma, dim, params };
}
function tubo(id: string, a: string, pa: string, b: string, pb: string, dn = 250, material = 'PVC'): Tuberia {
  return { id, desde: { unidad: a, puerto: pa }, hasta: { unidad: b, puerto: pb }, fluido: 'agua', dn_mm: dn, material, regimen: 'presion', puntos: [] };
}

describe('cantidades de obra civil', () => {
  it('tanque rectangular de un módulo', () => {
    // 10 × 5 m, altura 4 m (3.5 + 0.5), losa y muros de 0.30 m
    const u = unidad('a', 'lodos_activados', { largo: 10, ancho: 5, profundidadUtil: 3.5, bordoLibre: 0.5, modulos: 1 });
    const c = cantidadesCivil(u, oc);
    const losa = 10.6 * 5.6 * 0.3;
    const muros = (2 * 10 + 2 * 5.6) * 0.3 * 4;
    expect(c.concreto_m3).toBeCloseTo(losa + muros);
    expect(c.acero_kg).toBeCloseTo((losa + muros) * 100);
    // enterrado a la mitad: 0.5 × 4 + 0.3 de losa, con 1 m de sobreexcavación por lado
    expect(c.excavacion_m3).toBeCloseTo(12.6 * 7.6 * 2.3);
  });

  it('dos módulos adosados comparten muro: menos concreto que dos tanques sueltos', () => {
    const dim = { largo: 10, ancho: 5, profundidadUtil: 3.5, bordoLibre: 0.5 };
    const uno = cantidadesCivil(unidad('a', 'lodos_activados', { ...dim, modulos: 1 }), oc);
    const dos = cantidadesCivil(unidad('a', 'lodos_activados', { ...dim, modulos: 2 }), oc);
    expect(dos.concreto_m3).toBeLessThan(2 * uno.concreto_m3);
    expect(dos.concreto_m3).toBeCloseTo(10.6 * 10.9 * 0.3 + (3 * 10 + 2 * 10.9) * 0.3 * 4);
  });

  it('tanque circular', () => {
    const u = unidad('a', 'sedimentador_primario', { diametro: 10, profundidadUtil: 3.5, bordoLibre: 0.5, modulos: 2 }, {}, 'circular');
    const c = cantidadesCivil(u, oc);
    expect(c.concreto_m3).toBeCloseTo(2 * (Math.PI * 5.3 ** 2 * 0.3 + Math.PI * 10.3 * 0.3 * 4));
  });

  it('el cárcamo se excava a toda su altura', () => {
    const u = unidad('a', 'carcamo_rebombeo', { largo: 4, ancho: 4, profundidadUtil: 2.8, bordoLibre: 0.6, modulos: 1 });
    expect(cantidadesCivil(u, oc).excavacion_m3).toBeCloseTo(6.6 * 6.6 * (3.4 + 0.3));
  });

  it('un equipo solo lleva losa; un destino no lleva obra civil', () => {
    const equipo = cantidadesCivil(unidad('a', 'uv', { largo: 5, ancho: 1.5, altura: 1.5, modulos: 1 }), oc);
    expect(equipo.concreto_m3).toBeCloseTo(5.6 * 2.1 * 0.3);
    expect(cantidadesCivil(unidad('d', 'descarga_alcantarillado', { largo: 3, ancho: 3 }), oc).concreto_m3).toBe(0);
  });
});

describe('equipo, tuberías y operación', () => {
  it('precio de tubería por metro según material y diámetro', () => {
    expect(precioTuberia_m({ dn_mm: 100, material: 'PVC' }, precios)).toBeCloseTo(450);
    expect(precioTuberia_m({ dn_mm: 200, material: 'PVC' }, precios)).toBeCloseTo(450 * 2 ** 1.3);
    expect(precioTuberia_m({ dn_mm: 200, material: 'acero' }, precios)).toBeGreaterThan(precioTuberia_m({ dn_mm: 200, material: 'PVC' }, precios));
  });

  it('en el cárcamo una bomba queda de reserva', () => {
    const u = unidad('a', 'carcamo_rebombeo', {}, { numBombas: 3, potenciaBomba_kW: 10 });
    expect(potenciaOperacion(u, cat(u.tipo))).toBe(20);
  });

  it('cárcamo: bombas por potencia instalada', () => {
    const us = [unidad('f', 'influente', {}), unidad('c', 'carcamo_rebombeo', { largo: 4, ancho: 4, profundidadUtil: 2.8, bordoLibre: 0.6, modulos: 1 }, { numBombas: 2, potenciaBomba_kW: 7.5 })];
    const ts = [tubo('1', 'f', 'out', 'c', 'in')];
    const q = propagarCaudal(us, ts, catalogo, 4320);
    const r = calcularCostos(us, ts, { '1': 10 }, catalogo, precios, q, q, 4320);
    const c = r.unidades.find((x) => x.id === 'c')!;
    expect(c.equipos).toHaveLength(1);
    expect(c.equipos[0].costo).toBeCloseTo(2 * 60000 + 15 * 25000);
    expect(c.energia_kWh).toBeCloseTo(7.5 * 0.75 * 8760);
    expect(r.tuberias.costo).toBeCloseTo(10 * 450 * 2.5 ** 1.3);
  });

  it('cloración: consumo anual de cloro = dosis × caudal', () => {
    const us = [unidad('f', 'influente', {}), unidad('c', 'contacto_cloro', { largo: 10, ancho: 5, profundidadUtil: 2, bordoLibre: 0.4, modulos: 1 }, { dosis_mgL: 8, numCanales: 5 })];
    const q = propagarCaudal(us, [tubo('1', 'f', 'out', 'c', 'in')], catalogo, 4000);
    const r = calcularCostos(us, [], {}, catalogo, precios, q, q, 4000);
    expect(r.operacion.cloro_kg).toBeCloseTo((8 * 4000 * 365) / 1000);
    expect(r.operacion.quimicos).toBeCloseTo(11680 * 75);
  });
});

describe('integración del costo', () => {
  const d = ejemplo as unknown as Diseno;
  const qMed = lpsAm3d(d.datos.Qmed_Ls);
  const med = propagarCaudal(d.unidades, d.tuberias, catalogo, qMed);
  const max = propagarCaudal(d.unidades, d.tuberias, catalogo, lpsAm3d(d.datos.Qmax_Ls));
  const longitudes: Record<string, number> = {};
  for (const t of d.tuberias) longitudes[t.id] = longitudRuta(rutaTuberia(t, d.unidades, catalogo, 1.5, 1)!.puntos);
  const r = calcularCostos(d.unidades, d.tuberias, longitudes, catalogo, precios, med, max, qMed);

  it('directo = unidades + tuberías; luego indirectos, ingeniería e IVA', () => {
    const unidades = r.unidades.reduce((s, c) => s + c.total, 0);
    expect(r.directo).toBeCloseTo(unidades + r.tuberias.costo);
    expect(r.porEtapa.reduce((s, e) => s + e.total, 0)).toBeCloseTo(unidades);
    expect(r.indirectos).toBeCloseTo(r.directo * 0.2);
    expect(r.ingenieria).toBeCloseTo(r.directo * 0.08);
    expect(r.subtotal).toBeCloseTo(r.directo * 1.28);
    expect(r.iva).toBeCloseTo(r.subtotal * 0.16);
    expect(r.total).toBeCloseTo(r.subtotal * 1.16);
  });

  it('el total se reporta como rango de −30 % a +50 %', () => {
    expect(r.rango.bajo).toBeCloseTo(r.total * 0.7);
    expect(r.rango.alto).toBeCloseTo(r.total * 1.5);
  });

  it('costo por m³: operación, y operación más inversión en la vida útil', () => {
    expect(r.volumenAnual_m3).toBeCloseTo(4320 * 365);
    expect(r.porM3.operacion).toBeCloseTo(r.operacion.total / r.volumenAnual_m3);
    expect(r.porM3.total).toBeCloseTo((r.operacion.total + r.total / 20) / r.volumenAnual_m3);
  });

  it('el factor de actualización escala inversión y operación', () => {
    const doble = calcularCostos(d.unidades, d.tuberias, longitudes, catalogo, { ...precios, factorActualizacion: 2 }, med, max, qMed);
    expect(doble.total).toBeCloseTo(2 * r.total);
    expect(doble.operacion.total).toBeCloseTo(2 * r.operacion.total);
  });

  it('el ejemplo de 50 L/s queda en un orden de magnitud razonable', () => {
    // sanidad, no precisión: entre 10 y 150 millones de pesos, y menos de $20/m³
    expect(r.total).toBeGreaterThan(10e6);
    expect(r.total).toBeLessThan(150e6);
    expect(r.porM3.total!).toBeGreaterThan(0.5);
    expect(r.porM3.total!).toBeLessThan(20);
  });
});
