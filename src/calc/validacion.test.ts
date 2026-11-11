import { describe, expect, it } from 'vitest';
import type { Catalogo, Diseno, Eficiencias, RangosUnidad, ReglasTren, Tuberia, UnidadInstancia } from '../types';
import catalogoJson from '../data/catalogo.json';
import rangosJson from '../data/rangos.json';
import reglasJson from '../data/reglasTren.json';
import eficienciasJson from '../data/eficiencias.json';
import ejemplo from '../data/ejemplo-50lps.json';
import { aplicarRemocion, propagarCalidad } from './calidad';
import { propagarCaudal } from './grafo';
import { contextoUnidad, INDICADORES, type ContextoUnidad } from './indicadores';
import { validarTren } from './tren';
import { lpsAm3d } from './unidades';
import { cifra, textoRango, validarUnidad } from './validacion';

const catalogo = catalogoJson as unknown as Catalogo;
const rangos = rangosJson.unidades as unknown as Record<string, RangosUnidad>;
const reglas = reglasJson as unknown as ReglasTren;
const eficiencias = eficienciasJson as unknown as Eficiencias;
const TOL = rangosJson.general.toleranciaAmarillo;
const cat = (tipo: string) => catalogo.unidades.find((c) => c.id === tipo)!;

function unidad(id: string, tipo: string, dim: UnidadInstancia['dim'] = {}, params: UnidadInstancia['params'] = {}, forma: UnidadInstancia['forma'] = 'rectangular'): UnidadInstancia {
  return { id, tipo, x: 0, y: 0, rot: 0, forma, dim, params };
}
function tubo(id: string, a: string, pa: string, b: string, pb: string, fluido: Tuberia['fluido'] = 'agua'): Tuberia {
  return { id, desde: { unidad: a, puerto: pa }, hasta: { unidad: b, puerto: pb }, fluido, dn_mm: 250, material: 'PVC', regimen: 'presion', puntos: [] };
}
function ctx(qMed: number, qMax = qMed * 2, extra: Partial<ContextoUnidad> = {}): ContextoUnidad {
  return {
    qMed: { fresco: qMed, entrada: qMed, salidas: {} },
    qMax: { fresco: qMax, entrada: qMax, salidas: {} },
    calidad: { DBO5: 200, SST: 100 },
    sslmEntrada: null,
    purgaRecirculacion_m3d: null,
    ...extra,
  };
}
const validar = (u: UnidadInstancia, c: ContextoUnidad) => validarUnidad(u, cat(u.tipo), rangos[u.tipo], c, TOL);
const estadoDe = (r: ReturnType<typeof validar>, ind: string) => r.criterios.find((c) => c.indicador === ind)!;

describe('indicadores', () => {
  it('canal de entrada: v = Q / (ancho × tirante)', () => {
    const u = unidad('a', 'canal_entrada', { largo: 6, ancho: 0.5, profundidadUtil: 0.25, modulos: 1 });
    expect(INDICADORES.canal_entrada(u, cat(u.tipo), ctx(4320)).velocidad).toBeCloseTo(0.4);
  });

  it('rejillas: velocidad entre barras con el área libre', () => {
    const u = unidad('a', 'rejillas_gruesas', { largo: 3, ancho: 0.4, profundidadUtil: 0.25, modulos: 1 }, { abertura_mm: 40, espesorBarra_mm: 10 });
    const v = INDICADORES.rejillas_gruesas(u, cat(u.tipo), ctx(4320));
    expect(v.velocidadBarras).toBeCloseTo(0.05 / (0.4 * 0.25 * 0.8));
    expect(v.abertura).toBe(40);
  });

  it('desarenador: velocidad horizontal y TRH en segundos', () => {
    const u = unidad('a', 'desarenador', { largo: 18, ancho: 0.6, profundidadUtil: 0.28, modulos: 1 });
    const v = INDICADORES.desarenador(u, cat(u.tipo), ctx(4320));
    expect(v.velocidad).toBeCloseTo(0.2976, 3);
    expect(v.trh_s).toBeCloseTo(60.48, 1);
  });

  it('sedimentador primario: los módulos en paralelo se reparten el caudal', () => {
    const dim = { diametro: 8.5, profundidadUtil: 3.3, modulos: 2 };
    const u = unidad('a', 'sedimentador_primario', dim, {}, 'circular');
    const v = INDICADORES.sedimentador_primario(u, cat(u.tipo), ctx(4320, 9504));
    const A = 2 * Math.PI * 4.25 ** 2;
    expect(v.cargaSup_Qmed).toBeCloseTo(4320 / A);
    expect(v.cargaSup_Qmax).toBeCloseTo(9504 / A);
    expect(v.trh_h).toBeCloseTo((A * 3.3 * 24) / 4320);
    // con un solo módulo la carga se duplica
    const uno = INDICADORES.sedimentador_primario({ ...u, dim: { ...dim, modulos: 1 } }, cat(u.tipo), ctx(4320, 9504));
    expect(uno.cargaSup_Qmed).toBeCloseTo((2 * 4320) / A);
  });

  it('lodos activados: TRH, F/M y TRC', () => {
    const u = unidad('a', 'lodos_activados', { largo: 18, ancho: 7.5, profundidadUtil: 4, modulos: 2 }, { sslm: 3000, recirculacion: 75 });
    const c = ctx(4280, 9464, {
      qMed: { fresco: 4280, entrada: 7490, salidas: {} },
      calidad: { DBO5: 175 },
      purgaRecirculacion_m3d: 60,
    });
    const v = INDICADORES.lodos_activados(u, cat(u.tipo), c);
    expect(v.trh_h).toBeCloseTo((1080 / 4280) * 24);
    expect(v.fm).toBeCloseTo((4280 * 175) / (1080 * 3000));
    expect(v.trc_d).toBeCloseTo((1080 * 3270) / (60 * 7490));
  });

  it('lodos activados sin recirculación: el TRC no se puede calcular', () => {
    const u = unidad('a', 'lodos_activados', { largo: 18, ancho: 7.5, profundidadUtil: 4, modulos: 2 });
    const r = validar(u, ctx(4280));
    expect(estadoDe(r, 'trc_d').estado).toBe('sin_dato');
    expect(estadoDe(r, 'trc_d').mensaje).toContain('recirculación');
  });

  it('SBR: exige 2 tanques y revisa el volumen de decantación', () => {
    const dim = { largo: 15, ancho: 10, profundidadUtil: 5, modulos: 1 };
    const params = { sslm: 3500, ciclo_h: 6, decantacion_pct: 30, purga_m3d: 60 };
    const u = unidad('a', 'sbr', dim, params);
    const r = validar(u, ctx(1000));
    expect(estadoDe(r, 'modulos').estado).toBe('rojo');
    // 1000 m³/d × 6 h / 24 = 250 m³ por ciclo; decantación 0.3 × 750 = 225 m³
    expect(estadoDe(r, 'relacionDecantacion').valor).toBeCloseTo(250 / 225);
    expect(estadoDe(r, 'relacionDecantacion').estado).toBe('amarillo');
    expect(estadoDe(r, 'trc_d').valor).toBeCloseTo((750 * 0.7) / 60);
  });

  it('filtro percolador: usa los rangos de la variante elegida', () => {
    const u = unidad('a', 'filtro_percolador', { diametro: 20, profundidadUtil: 2, modulos: 1 }, { tasa: 'alta_tasa' }, 'circular');
    const A = Math.PI * 100;
    const alta = validar(u, ctx(6000));
    expect(estadoDe(alta, 'cargaHidraulica').valor).toBeCloseTo(6000 / A);
    expect(estadoDe(alta, 'cargaHidraulica').estado).toBe('verde');
    expect(estadoDe(alta, 'cargaOrganica').valor).toBeCloseTo((6000 * 200) / 1000 / (A * 2));
    const baja = validar({ ...u, params: { tasa: 'baja_tasa' } }, ctx(6000));
    expect(estadoDe(baja, 'cargaHidraulica').estado).toBe('rojo');
    expect(estadoDe(baja, 'cargaHidraulica').max).toBe(4);
  });

  it('MBBR: carga sobre el área de medio', () => {
    const u = unidad('a', 'mbbr', { largo: 12, ancho: 6, profundidadUtil: 4.5, modulos: 1 }, { llenado_pct: 50, areaEspecifica: 500 });
    const v = INDICADORES.mbbr(u, cat(u.tipo), ctx(4000));
    expect(v.cargaMedio).toBeCloseTo((4000 * 200) / (324 * 0.5 * 500));
  });

  it('sedimentador secundario: la carga superficial excluye la recirculación; la de sólidos la incluye', () => {
    const u = unidad('a', 'sedimentador_secundario', { diametro: 11.2, profundidadUtil: 4, modulos: 2 }, {}, 'circular');
    const A = 2 * Math.PI * 5.6 ** 2;
    const c = ctx(0, 0, {
      qMed: { fresco: 7490, entrada: 7490, salidas: { ras: 3210 } },
      qMax: { fresco: 16562, entrada: 16562, salidas: { ras: 7098 } },
      sslmEntrada: 3000,
    });
    const v = INDICADORES.sedimentador_secundario(u, cat(u.tipo), c);
    expect(v.cargaSup_Qmed).toBeCloseTo(4280 / A);
    expect(v.cargaSup_Qmax).toBeCloseTo(9464 / A);
    expect(v.cargaSolidos).toBeCloseTo((7490 * 3) / 24 / A);
  });

  it('contacto de cloro: tiempos y relación largo:ancho del serpentín', () => {
    const u = unidad('a', 'contacto_cloro', { largo: 10, ancho: 5, profundidadUtil: 2, modulos: 1 }, { numCanales: 5 });
    const v = INDICADORES.contacto_cloro(u, cat(u.tipo), ctx(4220, 9404));
    expect(v.contacto_Qmed).toBeCloseTo((100 / 4220) * 1440);
    expect(v.contacto_Qmax).toBeCloseTo((100 / 9404) * 1440);
    expect(v.relacionLA).toBeCloseTo(50);
  });

  it('ósmosis: flux del permeado', () => {
    const u = unidad('a', 'osmosis_inversa', {}, { recuperacion_pct: 75, areaMembrana_m2: 5000 });
    expect(INDICADORES.osmosis_inversa(u, cat(u.tipo), ctx(3200)).flux).toBeCloseTo((3200 * 0.75 * 1000) / 24 / 5000);
  });

  it('hidrocriba: el máximo de carga viene del dato del fabricante', () => {
    const u = unidad('a', 'hidrocriba', { largo: 2, ancho: 1.5, altura: 2, modulos: 1 }, { abertura_mm: 1, cargaFabricante: 150 });
    const r = validar(u, ctx(4320, 9504));
    expect(estadoDe(r, 'cargaAncho').valor).toBeCloseTo(9504 / 24 / 1.5);
    expect(estadoDe(r, 'cargaAncho').max).toBe(150);
    expect(estadoDe(r, 'cargaAncho').estado).toBe('rojo');
  });
});

describe('semáforo por unidad', () => {
  const dim = { largo: 4, ancho: 4, profundidadUtil: 2.8, modulos: 1 };
  it('verde, amarillo y rojo según la desviación', () => {
    const u = unidad('a', 'carcamo_rebombeo', dim, { numBombas: 2 });
    // V = 44.8 m³. TRH = 44.8·1440/Q
    expect(validar(u, ctx(4320)).estado).toBe('verde'); // 14.9 min
    expect(validar(u, ctx(7000)).estado).toBe('amarillo'); // 9.2 min: 8 % bajo el mínimo
    expect(validar(u, ctx(9000)).estado).toBe('rojo'); // 7.2 min: 28 % bajo el mínimo
  });

  it('el mensaje dice el indicador, el valor y el rango, sin la dimensión correcta', () => {
    const u = unidad('a', 'carcamo_rebombeo', dim, { numBombas: 2 });
    const m = estadoDe(validar(u, ctx(9000)), 'trh_min').mensaje;
    expect(m).toBe('Tiempo de retención a Qmed: 7.17 min, fuera del rango 10–30 min.');
  });

  it('los requisitos estrictos no admiten amarillo', () => {
    const u = unidad('a', 'carcamo_rebombeo', dim, { numBombas: 1 });
    expect(estadoDe(validar(u, ctx(4320)), 'numBombas').estado).toBe('rojo');
  });

  it('sin caudal: los indicadores quedan sin dato', () => {
    const u = unidad('a', 'carcamo_rebombeo', dim, { numBombas: 2 });
    const r = validar(u, { qMed: undefined, qMax: undefined, calidad: null, sslmEntrada: null, purgaRecirculacion_m3d: null });
    expect(estadoDe(r, 'trh_min').estado).toBe('sin_dato');
    expect(r.estado).toBe('sin_dato');
  });

  it('unidades sin criterios', () => {
    const u = unidad('a', 'digestor', { diametro: 10, profundidadUtil: 6 }, {}, 'circular');
    expect(validar(u, ctx(100)).estado).toBe('sin_criterios');
  });

  it('formato de cifras y rangos', () => {
    expect(cifra(1234.56)).toBe('1235');
    expect(cifra(38.06)).toBe('38.1');
    expect(cifra(0.2314)).toBe('0.231');
    expect(textoRango(30, null, 'min')).toBe('≥ 30 min');
    expect(textoRango(null, 30, 'mg/L')).toBe('≤ 30 mg/L');
    expect(textoRango(20, null, ':1')).toBe('≥ 20:1');
  });
});

describe('calidad', () => {
  it('remoción por fracción y por logaritmos', () => {
    const c = aplicarRemocion({ DBO5: 200, CF: 1e7 }, { DBO5: { remocion: 0.3 }, CF: { log: 2 }, verificado: false });
    expect(c.DBO5).toBeCloseTo(140);
    expect(c.CF).toBeCloseTo(1e5);
  });
});

describe('validación del tren', () => {
  const dimRect = { largo: 4, ancho: 4, profundidadUtil: 3, modulos: 1 };
  const reglasDe = (us: UnidadInstancia[], ts: Tuberia[]) => validarTren(us, ts, catalogo, reglas).map((a) => a.regla);

  it('exige exactamente un influente y al menos un destino', () => {
    const c = unidad('c', 'canal_entrada', dimRect);
    expect(reglasDe([c], [])).toEqual(expect.arrayContaining(['influente', 'destino']));
    const dos = [unidad('f1', 'influente'), unidad('f2', 'influente'), unidad('d', 'descarga_alcantarillado')];
    const r = validarTren(dos, [tubo('1', 'f1', 'out', 'd', 'in'), tubo('2', 'f2', 'out', 'd', 'in')], catalogo, reglas);
    expect(r.find((a) => a.regla === 'influente')?.mensaje).toContain('2 influentes');
  });

  it('detecta unidades sueltas y puertos obligatorios libres', () => {
    const us = [unidad('f', 'influente'), unidad('c', 'canal_entrada', dimRect), unidad('x', 'desarenador', dimRect), unidad('d', 'descarga_alcantarillado')];
    const r = validarTren(us, [tubo('1', 'f', 'out', 'c', 'in')], catalogo, reglas);
    expect(r.some((a) => a.regla === 'conexion' && a.unidades[0] === 'x')).toBe(true);
    expect(r.some((a) => a.regla === 'puerto' && a.unidades[0] === 'c' && a.mensaje.includes('"Salida"'))).toBe(true);
  });

  it('secundario sin pretratamiento', () => {
    const us = [unidad('f', 'influente'), unidad('r', 'sbr', dimRect), unidad('d', 'descarga_alcantarillado')];
    const ts = [tubo('1', 'f', 'out', 'r', 'in'), tubo('2', 'r', 'out', 'd', 'in')];
    expect(reglasDe(us, ts)).toContain('secundario_requiere_pretratamiento');
  });

  it('lodos activados requiere sedimentador secundario; el SBR no', () => {
    const base = [unidad('f', 'influente'), unidad('g', 'rejillas_gruesas', dimRect), unidad('d', 'descarga_alcantarillado')];
    const conLA = [...base, unidad('r', 'lodos_activados', dimRect)];
    const ts = [tubo('1', 'f', 'out', 'g', 'in'), tubo('2', 'g', 'out', 'r', 'in'), tubo('3', 'r', 'out', 'd', 'in')];
    expect(reglasDe(conLA, ts)).toContain('reactor_requiere_sedimentador');
    const conSBR = [...base, unidad('r', 'sbr', dimRect)];
    expect(reglasDe(conSBR, ts)).not.toContain('reactor_requiere_sedimentador');
    // el SBR genera lodos: su purga debe ir a la línea de lodos
    expect(reglasDe(conSBR, ts)).toContain('lodos');
  });

  it('ósmosis exige filtración previa y destino para el rechazo', () => {
    const us = [unidad('f', 'influente'), unidad('o', 'osmosis_inversa'), unidad('d', 'reuso_directo')];
    const ts = [tubo('1', 'f', 'out', 'o', 'in'), tubo('2', 'o', 'out', 'd', 'in')];
    const r = validarTren(us, ts, catalogo, reglas);
    expect(r.map((a) => a.regla)).toContain('osmosis_requiere_filtracion');
    expect(r.some((a) => a.regla === 'puerto' && a.mensaje.includes('"Rechazo"'))).toBe(true);
  });

  it('orden ilógico de etapas', () => {
    const us = [unidad('f', 'influente'), unidad('c', 'contacto_cloro', dimRect), unidad('s', 'sedimentador_primario', dimRect), unidad('d', 'descarga_alcantarillado')];
    const ts = [tubo('1', 'f', 'out', 'c', 'in'), tubo('2', 'c', 'out', 's', 'in'), tubo('3', 's', 'out', 'd', 'in')];
    expect(reglasDe(us, ts)).toContain('orden');
  });

  it('unidad que no recibe caudal del influente', () => {
    const us = [unidad('f', 'influente'), unidad('d', 'descarga_alcantarillado'), unidad('a', 'canal_entrada', dimRect), unidad('b', 'desarenador', dimRect)];
    const ts = [tubo('1', 'f', 'out', 'd', 'in'), tubo('2', 'a', 'out', 'b', 'in')];
    const r = validarTren(us, ts, catalogo, reglas);
    expect(r.filter((a) => a.regla === 'sin_caudal').map((a) => a.unidades[0]).sort()).toEqual(['a', 'b']);
  });
});

describe('diseño de ejemplo (50 L/s)', () => {
  const d = ejemplo as unknown as Diseno;
  const med = propagarCaudal(d.unidades, d.tuberias, catalogo, lpsAm3d(d.datos.Qmed_Ls));
  const max = propagarCaudal(d.unidades, d.tuberias, catalogo, lpsAm3d(d.datos.Qmax_Ls));
  const calidad = propagarCalidad(d.unidades, d.tuberias, catalogo, eficiencias, { ...d.datos.influente }, med);

  it('la DBO que llega al reactor es la del efluente primario', () => {
    expect(calidad.e8.entrada?.DBO5).toBeCloseTo(175);
    expect(calidad.e11.entrada?.DBO5).toBeCloseTo(175 * 0.15 * 0.7);
  });

  it('todas las unidades cumplen sus criterios', () => {
    for (const u of d.unidades) {
      const c = contextoUnidad(u, d.unidades, d.tuberias, catalogo, med, max, calidad);
      const r = validarUnidad(u, cat(u.tipo), rangos[u.tipo], c, TOL);
      const fallas = r.criterios.filter((x) => x.estado !== 'verde').map((x) => x.mensaje);
      expect(fallas, `${u.tipo}`).toEqual([]);
    }
  });

  it('el tren no tiene alertas', () => {
    expect(validarTren(d.unidades, d.tuberias, catalogo, reglas).map((a) => a.mensaje)).toEqual([]);
  });
});
