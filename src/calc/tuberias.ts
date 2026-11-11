import type { Catalogo, ConfigTuberias, PuertoCatalogo, Tuberia, UnidadInstancia } from '../types';
import { normalPuerto, puertoMundo } from './geometria';
import { clasificar, peor, type Semaforo } from './semaforo';

export interface P {
  x: number;
  y: number;
}

export interface Ruta {
  /** Vértices del trazo ortogonal, del puerto de salida al de entrada. */
  puntos: P[];
  /**
   * Por cada tramo (puntos[i] → puntos[i+1]): posición en `tuberia.puntos`
   * donde se insertaría un punto nuevo, o -1 si el tramo no es editable
   * (las acometidas pegadas a los puertos).
   */
  insercion: number[];
}

const EPS = 1e-9;

function igual(a: P, b: P): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

function direccion(a: P, b: P): P {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return d < EPS ? { x: 0, y: 0 } : { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

function medio(a: number, b: number): number {
  return Math.round(a + b) / 2;
}

/**
 * Esquinas intermedias para unir p con q con tramos ortogonales.
 * nP: dirección de salida obligada en p (no se puede regresar hacia la unidad).
 * nQ: normal exterior en q (no se puede llegar atravesando la unidad).
 */
export function conectar(p: P, q: P, nP: P | null, nQ: P | null): P[] {
  if (igual(p, q)) return [];
  const candidatos: P[][] = [];
  if (Math.abs(p.x - q.x) < EPS || Math.abs(p.y - q.y) < EPS) candidatos.push([]);
  candidatos.push([{ x: q.x, y: p.y }], [{ x: p.x, y: q.y }]);
  const mx = medio(p.x, q.x);
  const my = medio(p.y, q.y);
  candidatos.push([{ x: mx, y: p.y }, { x: mx, y: q.y }], [{ x: p.x, y: my }, { x: q.x, y: my }]);

  const valido = (c: P[]) => {
    const pts = [p, ...c, q].filter((v, i, arr) => i === 0 || !igual(v, arr[i - 1]));
    if (pts.length < 2) return true;
    const d1 = direccion(pts[0], pts[1]);
    const d2 = direccion(pts[pts.length - 2], pts[pts.length - 1]);
    if (nP && d1.x * nP.x + d1.y * nP.y < -0.5) return false;
    if (nQ && d2.x * nQ.x + d2.y * nQ.y > 0.5) return false;
    return true;
  };
  // Si ninguno cumple (el destino queda "a espaldas"), se usa el más simple
  // y el usuario corrige el trazo con puntos intermedios.
  return candidatos.find(valido) ?? candidatos[0];
}

/**
 * Trazo ortogonal entre dos puertos. Sale y llega perpendicular a cada
 * puerto con una acometida recta, y pasa por los puntos intermedios dados.
 */
export function rutaOrtogonal(a: P, nA: P, b: P, nB: P, intermedios: [number, number][], acometida: number): Ruta {
  const sa = { x: a.x + nA.x * acometida, y: a.y + nA.y * acometida };
  const sb = { x: b.x + nB.x * acometida, y: b.y + nB.y * acometida };
  const anclas: P[] = [sa, ...intermedios.map(([x, y]) => ({ x, y })), sb];

  const puntos: P[] = [a];
  const insercion: number[] = [];
  const agregar = (p: P, ins: number) => {
    if (igual(p, puntos[puntos.length - 1])) return;
    puntos.push(p);
    insercion.push(ins);
  };

  agregar(sa, -1);
  for (let i = 0; i < anclas.length - 1; i++) {
    const esquinas = conectar(anclas[i], anclas[i + 1], i === 0 ? nA : null, i === anclas.length - 2 ? nB : null);
    for (const e of esquinas) agregar(e, i);
    agregar(anclas[i + 1], i);
  }
  agregar(b, -1);
  return { puntos, insercion };
}

/** Trazo de una tubería del diseño, o null si alguno de sus extremos ya no existe. */
export function rutaTuberia(
  t: Tuberia,
  unidades: UnidadInstancia[],
  catalogo: Catalogo,
  sepCirc: number,
  acometida: number,
): Ruta | null {
  const extremo = (e: Tuberia['desde']) => {
    const u = unidades.find((v) => v.id === e.unidad);
    const p = u && catalogo.unidades.find((c) => c.id === u.tipo)?.puertos.find((q) => q.id === e.puerto);
    return u && p ? { pos: puertoMundo(u, p, sepCirc), normal: normalPuerto(u, p) } : null;
  };
  const a = extremo(t.desde);
  const b = extremo(t.hasta);
  if (!a || !b) return null;
  return rutaOrtogonal(a.pos, a.normal, b.pos, b.normal, t.puntos, acometida);
}

/** Longitud en planta del trazo, en metros. */
export function longitudRuta(puntos: P[]): number {
  let l = 0;
  for (let i = 1; i < puntos.length; i++) l += Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y);
  return l;
}

/** Área de la sección a tubo lleno, en m². */
export function areaTubo(dn_mm: number): number {
  const d = dn_mm / 1000;
  return (Math.PI * d * d) / 4;
}

/** Velocidad media v = Q / A, en m/s, con Q en m³/d. */
export function velocidad(q_m3d: number, dn_mm: number): number {
  return q_m3d / 86400 / areaTubo(dn_mm);
}

export interface EvaluacionTuberia {
  /** Caudal en m³/d a Qmed y a Qmáx; null si no se calcula (aire). */
  qMed: number | null;
  qMax: number | null;
  vMed: number | null;
  vMax: number | null;
  estado: Semaforo | 'sin_evaluar';
  mensajes: string[];
}

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

/**
 * Revisa la velocidad de una tubería.
 *  - A presión: v a Qmed ≥ vMin y v a Qmáx ≤ vMax.
 *  - Canal o gravedad: v a Qmed ≥ vMinRecomendada es verde; entre vMin y la
 *    recomendada, amarillo; por debajo de vMin, rojo.
 */
export function evaluarTuberia(
  t: Pick<Tuberia, 'dn_mm' | 'regimen' | 'fluido'>,
  qMed: number | null,
  qMax: number | null,
  cfg: ConfigTuberias,
  tolerancia: number,
): EvaluacionTuberia {
  const base = { qMed, qMax, vMed: null, vMax: null, estado: 'sin_evaluar' as const, mensajes: [] as string[] };
  if (qMed === null || qMax === null) return base;
  const vMed = velocidad(qMed, t.dn_mm);
  const vMax = velocidad(qMax, t.dn_mm);
  const fluido = cfg.fluidos[t.fluido];
  if (!fluido?.evaluarVelocidad) return { ...base, vMed, vMax };
  if (qMed <= 0 && qMax <= 0) {
    return { ...base, vMed, vMax, estado: 'rojo', mensajes: ['No llega caudal a esta tubería.'] };
  }

  let estado: Semaforo = 'verde';
  const mensajes: string[] = [];
  if (t.regimen === 'gravedad') {
    const r = cfg.regimenes.gravedad;
    if (vMed < r.vMin) {
      estado = 'rojo';
      mensajes.push(`Velocidad a Qmed de ${f2(vMed)} m/s, menor que el mínimo de ${r.vMin} m/s para canales o gravedad.`);
    } else if (vMed < r.vMinRecomendada) {
      estado = 'amarillo';
      mensajes.push(`Velocidad a Qmed de ${f2(vMed)} m/s: cumple el mínimo de ${r.vMin} m/s, pero no el recomendado de ${r.vMinRecomendada} m/s.`);
    }
    if (r.vMax !== null && vMax > r.vMax) {
      estado = peor(estado, clasificar(vMax, null, r.vMax, tolerancia));
      mensajes.push(`Velocidad a Qmáx de ${f2(vMax)} m/s, mayor que el máximo de ${r.vMax} m/s.`);
    }
  } else {
    const r = cfg.regimenes.presion;
    if (vMed < r.vMin) {
      estado = peor(estado, clasificar(vMed, r.vMin, null, tolerancia));
      mensajes.push(`Velocidad a Qmed de ${f2(vMed)} m/s, fuera del rango de ${r.vMin}–${r.vMax} m/s a presión.`);
    }
    if (vMax > r.vMax) {
      estado = peor(estado, clasificar(vMax, null, r.vMax, tolerancia));
      mensajes.push(`Velocidad a Qmáx de ${f2(vMax)} m/s, fuera del rango de ${r.vMin}–${r.vMax} m/s a presión.`);
    }
  }
  return { qMed, qMax, vMed, vMax, estado, mensajes };
}

/** ¿Se puede tender una tubería nueva entre estos dos puertos? */
export function puedeConectar(
  desde: { unidad: string; puerto: PuertoCatalogo },
  hasta: { unidad: string; puerto: PuertoCatalogo },
  tuberias: Tuberia[],
  cfg: ConfigTuberias,
): boolean {
  if (desde.unidad === hasta.unidad) return false;
  if (desde.puerto.tipo !== 'salida' || hasta.puerto.tipo !== 'entrada') return false;
  if (!cfg.compatibilidad[desde.puerto.fluido]?.includes(hasta.puerto.fluido)) return false;
  return !tuberias.some(
    (t) =>
      t.desde.unidad === desde.unidad &&
      t.desde.puerto === desde.puerto.id &&
      t.hasta.unidad === hasta.unidad &&
      t.hasta.puerto === hasta.puerto.id,
  );
}
