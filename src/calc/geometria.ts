import type { Lado, PuertoCatalogo, Rotacion, UnidadInstancia } from '../types';

/**
 * Geometría en planta. Convenciones:
 *  - Coordenadas en metros; x hacia el este, y hacia el sur.
 *  - (x, y) de una unidad es el centro de su huella.
 *  - Módulos rectangulares: adosados (muro común) a lo ancho.
 *  - Módulos circulares: en fila, separados `sepCirc` metros.
 *  - Rotación en pasos de 90°: (x, y) -> (-y, x).
 */

export type Forma2D =
  | { tipo: 'rect'; cx: number; cy: number; w: number; h: number }
  | { tipo: 'circ'; cx: number; cy: number; r: number };

export interface Terreno {
  largo: number;
  ancho: number;
}

export type TipoProblema = 'traslape' | 'separacion' | 'fuera';

export interface ProblemaDisposicion {
  tipo: TipoProblema;
  unidades: string[];
  /** Distancia libre entre unidades (solo en 'separacion'). */
  distancia?: number;
}

const EPS = 1e-6;

export function numModulos(u: UnidadInstancia): number {
  return Math.max(1, Math.round(u.dim.modulos ?? 1));
}

/** Dimensiones de la huella sin rotar (w a lo largo de x local, h a lo largo de y local). */
export function dimsLocales(u: UnidadInstancia, sepCirc: number): { w: number; h: number } {
  const n = numModulos(u);
  if (u.forma === 'circular') {
    const d = u.dim.diametro ?? 0;
    return { w: n * d + (n - 1) * sepCirc, h: d };
  }
  return { w: u.dim.largo ?? 0, h: (u.dim.ancho ?? 0) * n };
}

/** Dimensiones de la huella ya rotada (caja envolvente alineada a los ejes). */
export function dimsHuella(u: UnidadInstancia, sepCirc: number): { w: number; h: number } {
  const { w, h } = dimsLocales(u, sepCirc);
  return u.rot === 90 || u.rot === 270 ? { w: h, h: w } : { w, h };
}

export function rotarPunto(x: number, y: number, rot: Rotacion): { x: number; y: number } {
  switch (rot) {
    case 90:
      return { x: -y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

/** Formas de cada módulo en coordenadas locales (centradas en el origen, sin rotar). */
export function formasLocales(u: UnidadInstancia, sepCirc: number): Forma2D[] {
  const n = numModulos(u);
  const { w, h } = dimsLocales(u, sepCirc);
  const formas: Forma2D[] = [];
  if (u.forma === 'circular') {
    const d = u.dim.diametro ?? 0;
    for (let i = 0; i < n; i++) {
      formas.push({ tipo: 'circ', cx: -w / 2 + d / 2 + i * (d + sepCirc), cy: 0, r: d / 2 });
    }
  } else {
    const a = u.dim.ancho ?? 0;
    for (let i = 0; i < n; i++) {
      formas.push({ tipo: 'rect', cx: 0, cy: -h / 2 + a * (i + 0.5), w, h: a });
    }
  }
  return formas;
}

/**
 * Formas en coordenadas del terreno, para revisar la disposición. Los módulos
 * rectangulares adosados se devuelven como un solo rectángulo.
 */
export function formasMundo(u: UnidadInstancia, sepCirc: number): Forma2D[] {
  if (u.forma !== 'circular') {
    const { w, h } = dimsHuella(u, sepCirc);
    return [{ tipo: 'rect', cx: u.x, cy: u.y, w, h }];
  }
  return formasLocales(u, sepCirc).map((f) => {
    const p = rotarPunto(f.cx, f.cy, u.rot);
    return { ...f, cx: u.x + p.x, cy: u.y + p.y };
  });
}

/**
 * Distancia libre entre dos formas. Negativa si se traslapan,
 * cero si apenas se tocan.
 */
export function distanciaFormas(a: Forma2D, b: Forma2D): number {
  if (a.tipo === 'circ' && b.tipo === 'circ') {
    return Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.r - b.r;
  }
  if (a.tipo === 'rect' && b.tipo === 'rect') {
    const gx = Math.abs(a.cx - b.cx) - (a.w + b.w) / 2;
    const gy = Math.abs(a.cy - b.cy) - (a.h + b.h) / 2;
    if (gx < 0 && gy < 0) return Math.max(gx, gy);
    return Math.hypot(Math.max(gx, 0), Math.max(gy, 0));
  }
  const rect = (a.tipo === 'rect' ? a : b) as Extract<Forma2D, { tipo: 'rect' }>;
  const circ = (a.tipo === 'circ' ? a : b) as Extract<Forma2D, { tipo: 'circ' }>;
  const gx = Math.abs(circ.cx - rect.cx) - rect.w / 2;
  const gy = Math.abs(circ.cy - rect.cy) - rect.h / 2;
  if (gx < 0 && gy < 0) return Math.max(gx, gy) - circ.r;
  return Math.hypot(Math.max(gx, 0), Math.max(gy, 0)) - circ.r;
}

/** Distancia libre mínima entre dos unidades (considera todos sus módulos). */
export function distanciaUnidades(a: UnidadInstancia, b: UnidadInstancia, sepCirc: number): number {
  let min = Infinity;
  for (const fa of formasMundo(a, sepCirc)) {
    for (const fb of formasMundo(b, sepCirc)) {
      min = Math.min(min, distanciaFormas(fa, fb));
    }
  }
  return min;
}

export function dentroDeTerreno(u: UnidadInstancia, terreno: Terreno, sepCirc: number): boolean {
  return formasMundo(u, sepCirc).every((f) => {
    const mx = f.tipo === 'rect' ? f.w / 2 : f.r;
    const my = f.tipo === 'rect' ? f.h / 2 : f.r;
    return (
      f.cx - mx >= -EPS &&
      f.cy - my >= -EPS &&
      f.cx + mx <= terreno.largo + EPS &&
      f.cy + my <= terreno.ancho + EPS
    );
  });
}

/** Área en planta de una unidad (suma de sus módulos), en m². */
export function areaUnidad(u: UnidadInstancia): number {
  const n = numModulos(u);
  if (u.forma === 'circular') {
    const d = u.dim.diametro ?? 0;
    return (n * Math.PI * d * d) / 4;
  }
  return n * (u.dim.largo ?? 0) * (u.dim.ancho ?? 0);
}

export function areaOcupada(unidades: UnidadInstancia[]): number {
  return unidades.reduce((s, u) => s + areaUnidad(u), 0);
}

export function areaTerreno(t: Terreno): number {
  return t.largo * t.ancho;
}

/** Área superficial de un módulo, en m². */
export function areaModulo(u: UnidadInstancia): number {
  return areaUnidad(u) / numModulos(u);
}

/** Volumen útil de un módulo (área × profundidad útil), en m³. */
export function volumenModulo(u: UnidadInstancia): number {
  return areaModulo(u) * (u.dim.profundidadUtil ?? 0);
}

/** Revisa traslapes, unidades fuera del terreno y separación menor a la mínima. */
export function revisarDisposicion(
  unidades: UnidadInstancia[],
  terreno: Terreno,
  separacionMinima: number,
  sepCirc: number,
): ProblemaDisposicion[] {
  const problemas: ProblemaDisposicion[] = [];
  for (const u of unidades) {
    if (!dentroDeTerreno(u, terreno, sepCirc)) problemas.push({ tipo: 'fuera', unidades: [u.id] });
  }
  for (let i = 0; i < unidades.length; i++) {
    for (let j = i + 1; j < unidades.length; j++) {
      const d = distanciaUnidades(unidades[i], unidades[j], sepCirc);
      const ids = [unidades[i].id, unidades[j].id];
      if (d < -EPS) problemas.push({ tipo: 'traslape', unidades: ids });
      else if (d < separacionMinima - EPS) {
        problemas.push({ tipo: 'separacion', unidades: ids, distancia: Math.max(0, d) });
      }
    }
  }
  return problemas;
}

/**
 * Ajusta el centro de una unidad para que la esquina de su huella
 * caiga sobre la cuadrícula de paso `paso` (1 m o 0.5 m).
 */
export function ajustarACuadricula(
  x: number,
  y: number,
  huella: { w: number; h: number },
  paso: number,
): { x: number; y: number } {
  if (paso <= 0) return { x, y };
  const ex = Math.round((x - huella.w / 2) / paso) * paso;
  const ey = Math.round((y - huella.h / 2) / paso) * paso;
  return { x: ex + huella.w / 2, y: ey + huella.h / 2 };
}

const NORMAL_LADO: Record<Lado, { x: number; y: number }> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  O: { x: -1, y: 0 },
};

/** Posición local (sin rotar) de un puerto sobre el borde de la huella. */
export function puertoLocal(u: UnidadInstancia, p: PuertoCatalogo, sepCirc: number): { x: number; y: number } {
  const { w, h } = dimsLocales(u, sepCirc);
  const t = (p.pos ?? 0.5) - 0.5;
  const n = NORMAL_LADO[p.lado];
  return n.x !== 0 ? { x: (n.x * w) / 2, y: t * h } : { x: t * w, y: (n.y * h) / 2 };
}

/** Dirección (unitaria, ya rotada) hacia afuera de la unidad en un puerto. */
export function normalPuerto(u: UnidadInstancia, p: PuertoCatalogo): { x: number; y: number } {
  const n = NORMAL_LADO[p.lado];
  const r = rotarPunto(n.x, n.y, u.rot);
  // evita el -0 de las rotaciones
  return { x: r.x + 0, y: r.y + 0 };
}

/** Posición de un puerto en coordenadas del terreno. */
export function puertoMundo(u: UnidadInstancia, p: PuertoCatalogo, sepCirc: number): { x: number; y: number } {
  const l = puertoLocal(u, p, sepCirc);
  const r = rotarPunto(l.x, l.y, u.rot);
  return { x: u.x + r.x, y: u.y + r.y };
}
