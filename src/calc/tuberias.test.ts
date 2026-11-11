import { describe, expect, it } from 'vitest';
import type { Catalogo, ConfigTuberias, Diseno } from '../types';
import catalogoJson from '../data/catalogo.json';
import tuberiasJson from '../data/tuberias.json';
import ejemplo from '../data/ejemplo-50lps.json';
import { clasificar } from './semaforo';
import { areaTubo, conectar, evaluarTuberia, longitudRuta, puedeConectar, rutaOrtogonal, rutaTuberia, velocidad } from './tuberias';

const cfg = tuberiasJson as unknown as ConfigTuberias;
const catalogo = catalogoJson as unknown as Catalogo;
const TOL = 0.15;

describe('semáforo', () => {
  it('verde dentro, amarillo hasta 15 % fuera, rojo más allá', () => {
    expect(clasificar(1, 0.6, 3, TOL)).toBe('verde');
    expect(clasificar(0.6, 0.6, 3, TOL)).toBe('verde');
    expect(clasificar(0.55, 0.6, 3, TOL)).toBe('amarillo');
    expect(clasificar(0.5, 0.6, 3, TOL)).toBe('rojo');
    expect(clasificar(3.4, 0.6, 3, TOL)).toBe('amarillo');
    expect(clasificar(3.5, 0.6, 3, TOL)).toBe('rojo');
    expect(clasificar(100, 30, null, TOL)).toBe('verde');
  });
});

describe('hidráulica de tuberías', () => {
  it('área y velocidad a tubo lleno', () => {
    expect(areaTubo(250)).toBeCloseTo(0.04909, 4);
    // 50 L/s = 4 320 m³/d en DN 250
    expect(velocidad(4320, 250)).toBeCloseTo(1.0186, 3);
  });

  it('a presión: revisa mínimo a Qmed y máximo a Qmáx', () => {
    const t = { dn_mm: 250, regimen: 'presion' as const, fluido: 'agua' as const };
    expect(evaluarTuberia(t, 4320, 9504, cfg, TOL).estado).toBe('verde');
    const lenta = evaluarTuberia({ ...t, dn_mm: 400 }, 4320, 9504, cfg, TOL);
    expect(lenta.estado).toBe('rojo');
    expect(lenta.mensajes[0]).toContain('0.4 m/s');
    const rapida = evaluarTuberia({ ...t, dn_mm: 200 }, 4320, 9504, cfg, TOL);
    // 3.5 m/s a Qmáx: más de 15 % sobre 3.0
    expect(rapida.vMax).toBeCloseTo(3.501, 2);
    expect(rapida.estado).toBe('rojo');
    expect(rapida.mensajes).toHaveLength(1);
  });

  it('canal o gravedad: amarillo entre 0.6 y 0.9 m/s, rojo por debajo', () => {
    const t = { dn_mm: 300, regimen: 'gravedad' as const, fluido: 'agua' as const };
    expect(evaluarTuberia(t, 4320, 9504, cfg, TOL).estado).toBe('amarillo'); // 0.71 m/s
    expect(evaluarTuberia({ ...t, dn_mm: 250 }, 4320, 9504, cfg, TOL).estado).toBe('verde');
    expect(evaluarTuberia({ ...t, dn_mm: 400 }, 4320, 9504, cfg, TOL).estado).toBe('rojo');
  });

  it('no evalúa lodos ni aire, pero sí reporta la velocidad de lodos', () => {
    const lodos = evaluarTuberia({ dn_mm: 100, regimen: 'presion', fluido: 'lodos' }, 40, 40, cfg, TOL);
    expect(lodos.estado).toBe('sin_evaluar');
    expect(lodos.vMed).toBeGreaterThan(0);
    expect(evaluarTuberia({ dn_mm: 100, regimen: 'presion', fluido: 'aire' }, null, null, cfg, TOL).estado).toBe('sin_evaluar');
  });
});

describe('trazo ortogonal', () => {
  it('puertos enfrentados: tramo recto', () => {
    const r = rutaOrtogonal({ x: 4, y: 10 }, { x: 1, y: 0 }, { x: 8, y: 10 }, { x: -1, y: 0 }, [], 1);
    expect(r.puntos).toEqual([{ x: 4, y: 10 }, { x: 5, y: 10 }, { x: 7, y: 10 }, { x: 8, y: 10 }]);
    expect(longitudRuta(r.puntos)).toBeCloseTo(4);
    expect(r.insercion).toEqual([-1, 0, -1]);
  });

  it('no llega atravesando la unidad de destino', () => {
    // salida hacia el este; entrada en la cara norte de una unidad al sureste
    const r = rutaOrtogonal({ x: 48, y: 10 }, { x: 1, y: 0 }, { x: 60, y: 6.75 }, { x: 0, y: -1 }, [], 1);
    expect(r.puntos).toEqual([
      { x: 48, y: 10 },
      { x: 49, y: 10 },
      { x: 49, y: 5.75 },
      { x: 60, y: 5.75 },
      { x: 60, y: 6.75 },
    ]);
  });

  it('no regresa hacia la unidad de origen', () => {
    const esquinas = conectar({ x: 91, y: 16 }, { x: 71, y: 40 }, { x: 1, y: 0 }, { x: -1, y: 0 });
    expect(esquinas).toEqual([{ x: 91, y: 28 }, { x: 71, y: 28 }]);
  });

  it('pasa por los puntos intermedios y todos los tramos son ortogonales', () => {
    const r = rutaOrtogonal({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 20, y: 10 }, { x: -1, y: 0 }, [[8, 4], [12, 9]], 1);
    expect(r.puntos).toContainEqual({ x: 8, y: 4 });
    expect(r.puntos).toContainEqual({ x: 12, y: 9 });
    for (let i = 1; i < r.puntos.length; i++) {
      const a = r.puntos[i - 1];
      const b = r.puntos[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    expect(r.insercion.length).toBe(r.puntos.length - 1);
    expect(Math.max(...r.insercion)).toBe(2);
  });
});

describe('reglas de conexión', () => {
  const puerto = (tipo: string, id: string) => catalogo.unidades.find((u) => u.id === tipo)!.puertos.find((p) => p.id === id)!;
  it('solo salida → entrada de fluido compatible, entre unidades distintas', () => {
    const out = { unidad: 'a', puerto: puerto('sedimentador_primario', 'out') };
    const lodos = { unidad: 'a', puerto: puerto('sedimentador_primario', 'lodos') };
    const reactor = { unidad: 'b', puerto: puerto('lodos_activados', 'in') };
    const espesador = { unidad: 'c', puerto: puerto('espesador', 'in') };
    expect(puedeConectar(out, reactor, [], cfg)).toBe(true);
    expect(puedeConectar(lodos, reactor, [], cfg)).toBe(false);
    expect(puedeConectar(lodos, espesador, [], cfg)).toBe(true);
    expect(puedeConectar(reactor, out, [], cfg)).toBe(false);
    expect(puedeConectar(out, { unidad: 'a', puerto: reactor.puerto }, [], cfg)).toBe(false);
  });
  it('el rechazo de ósmosis puede ir a un destino', () => {
    const rechazo = { unidad: 'a', puerto: puerto('osmosis_inversa', 'rechazo') };
    const destino = { unidad: 'b', puerto: puerto('descarga_alcantarillado', 'in') };
    expect(puedeConectar(rechazo, destino, [], cfg)).toBe(true);
  });
});

describe('trazos del diseño de ejemplo', () => {
  const d = ejemplo as unknown as Diseno;
  it('todas las tuberías tienen trazo ortogonal', () => {
    for (const t of d.tuberias) {
      const r = rutaTuberia(t, d.unidades, catalogo, 1.5, 1);
      expect(r, t.id).not.toBeNull();
      for (let i = 1; i < r!.puntos.length; i++) {
        const a = r!.puntos[i - 1];
        const b = r!.puntos[i];
        expect(Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9, `${t.id} tramo ${i}`).toBe(true);
      }
    }
  });
});
