export type Semaforo = 'verde' | 'amarillo' | 'rojo';

/**
 * Clasifica un valor contra un rango [min, max] (cualquiera puede faltar).
 * Verde: dentro del rango. Amarillo: fuera hasta `tolerancia` (fracción del
 * límite violado). Rojo: fuera por más de la tolerancia.
 */
export function clasificar(valor: number, min: number | null, max: number | null, tolerancia: number): Semaforo {
  if (!Number.isFinite(valor)) return 'rojo';
  if (min !== null && valor < min) {
    return min !== 0 && (min - valor) / Math.abs(min) <= tolerancia ? 'amarillo' : 'rojo';
  }
  if (max !== null && valor > max) {
    return max !== 0 && (valor - max) / Math.abs(max) <= tolerancia ? 'amarillo' : 'rojo';
  }
  return 'verde';
}

const ORDEN: Record<Semaforo, number> = { verde: 0, amarillo: 1, rojo: 2 };

export function peor(a: Semaforo, b: Semaforo): Semaforo {
  return ORDEN[a] >= ORDEN[b] ? a : b;
}
