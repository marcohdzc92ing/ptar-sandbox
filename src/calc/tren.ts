import type { Catalogo, FiltroUnidades, ReglasTren, Tuberia, UnidadCatalogo, UnidadInstancia } from '../types';

/**
 * Validación del tren completo: orden lógico, conexiones y línea de lodos.
 * Los mensajes dicen qué falta, no cómo resolverlo.
 */

export interface AlertaTren {
  severidad: 'rojo' | 'amarillo';
  mensaje: string;
  /** Unidades involucradas (la primera se selecciona al hacer clic). */
  unidades: string[];
  regla: string;
}

type Nodo = { u: UnidadInstancia; cat: UnidadCatalogo };

function cumple(n: Nodo, f: FiltroUnidades): boolean {
  return !!f.unidad?.includes(n.u.tipo) || !!f.etapa?.includes(n.cat.etapa);
}

export function validarTren(
  unidades: UnidadInstancia[],
  tuberias: Tuberia[],
  catalogo: Catalogo,
  reglas: ReglasTren,
  nombre: (u: UnidadInstancia, cat: UnidadCatalogo) => string = (u, cat) => u.etiqueta?.trim() || cat.nombre,
): AlertaTren[] {
  const alertas: AlertaTren[] = [];
  const cats = new Map(catalogo.unidades.map((c) => [c.id, c]));
  const nodos: Nodo[] = unidades.flatMap((u) => {
    const cat = cats.get(u.tipo);
    return cat ? [{ u, cat }] : [];
  });
  const porId = new Map(nodos.map((n) => [n.u.id, n]));
  const N = (n: Nodo) => nombre(n.u, n.cat);
  if (nodos.length === 0) return alertas;

  const validas = tuberias.filter((t) => porId.has(t.desde.unidad) && porId.has(t.hasta.unidad));
  /** Aristas de proceso: todo menos recirculación y aire. */
  const proceso = validas.filter((t) => t.fluido !== 'recirculacion' && t.fluido !== 'aire');

  const alcanzables = (inicio: string, haciaAbajo: boolean): Set<string> => {
    const vistos = new Set<string>();
    const cola = [inicio];
    while (cola.length) {
      const actual = cola.pop()!;
      for (const t of proceso) {
        const [a, b] = haciaAbajo ? [t.desde.unidad, t.hasta.unidad] : [t.hasta.unidad, t.desde.unidad];
        if (a === actual && !vistos.has(b) && b !== inicio) {
          vistos.add(b);
          cola.push(b);
        }
      }
    }
    return vistos;
  };

  // ---- Influente y destino ----
  const fuentes = nodos.filter((n) => n.cat.esFuente);
  const destinos = nodos.filter((n) => n.cat.etapa === 'destino');
  if (fuentes.length === 0) {
    alertas.push({ severidad: 'rojo', regla: 'influente', unidades: [], mensaje: 'El tren no tiene influente: debe haber exactamente uno.' });
  } else if (fuentes.length > 1) {
    alertas.push({
      severidad: 'rojo',
      regla: 'influente',
      unidades: fuentes.map((n) => n.u.id),
      mensaje: `Hay ${fuentes.length} influentes: debe haber exactamente uno.`,
    });
  }
  if (destinos.length === 0) {
    alertas.push({ severidad: 'rojo', regla: 'destino', unidades: [], mensaje: 'El tren no tiene destino final: debe haber al menos uno.' });
  }

  // ---- Conexiones ----
  const desdeFuente = new Set<string>();
  for (const f of fuentes) {
    desdeFuente.add(f.u.id);
    for (const id of alcanzables(f.u.id, true)) desdeFuente.add(id);
  }
  for (const n of nodos) {
    const propias = validas.filter((t) => t.desde.unidad === n.u.id || t.hasta.unidad === n.u.id);
    if (propias.length === 0) {
      alertas.push({ severidad: 'rojo', regla: 'conexion', unidades: [n.u.id], mensaje: `${N(n)} no está conectada a nada.` });
      continue;
    }
    for (const p of n.cat.puertos) {
      if (!p.obligatorio) continue;
      const conectado = propias.some((t) =>
        p.tipo === 'salida'
          ? t.desde.unidad === n.u.id && t.desde.puerto === p.id
          : t.hasta.unidad === n.u.id && t.hasta.puerto === p.id,
      );
      if (conectado) continue;
      const mensaje =
        p.fluido === 'lodos' && p.tipo === 'salida' && n.cat.generaLodos
          ? `${N(n)} genera lodos y no está conectada a la línea de lodos.`
          : `${N(n)}: el puerto obligatorio "${p.nombre}" está libre.`;
      alertas.push({ severidad: 'rojo', regla: p.fluido === 'lodos' ? 'lodos' : 'puerto', unidades: [n.u.id], mensaje });
    }
    const soloAire = n.cat.puertos.every((p) => p.fluido === 'aire');
    if (fuentes.length > 0 && !soloAire && !desdeFuente.has(n.u.id)) {
      alertas.push({ severidad: 'rojo', regla: 'sin_caudal', unidades: [n.u.id], mensaje: `${N(n)} no recibe caudal del influente.` });
    }
  }

  // ---- Orden de etapas en la línea de agua ----
  for (const t of proceso) {
    const a = porId.get(t.desde.unidad)!;
    const b = porId.get(t.hasta.unidad)!;
    const puerto = a.cat.puertos.find((p) => p.id === t.desde.puerto);
    // solo la salida principal de agua; los retornos (sobrenadante, rechazo) pueden ir hacia atrás
    if (!puerto || puerto.fluido !== 'agua' || puerto.caudal) continue;
    const ia = reglas.ordenEtapas.indexOf(a.cat.etapa);
    const ib = reglas.ordenEtapas.indexOf(b.cat.etapa);
    if (ia >= 0 && ib >= 0 && ib < ia) {
      alertas.push({
        severidad: 'rojo',
        regla: 'orden',
        unidades: [a.u.id, b.u.id],
        mensaje: `Orden ilógico: ${N(a)} (${a.cat.etapa}) descarga hacia ${N(b)} (${b.cat.etapa}).`,
      });
    }
  }

  // ---- Reglas del JSON ----
  for (const regla of reglas.reglas) {
    for (const n of nodos) {
      if (!cumple(n, regla.si)) continue;
      const vecinos = alcanzables(n.u.id, regla.tipo === 'requiereAguasAbajo');
      const hay = [...vecinos].some((id) => cumple(porId.get(id)!, regla.requiere));
      if (!hay) {
        alertas.push({ severidad: regla.severidad ?? 'rojo', regla: regla.id, unidades: [n.u.id], mensaje: `${N(n)} ${regla.mensaje}` });
      }
    }
  }
  return alertas;
}
