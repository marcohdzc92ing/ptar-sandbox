/** Conversión de unidades de caudal. 1 L/s = 86.4 m³/d. */
export const LPS_A_M3D = 86.4;

export function lpsAm3d(q_Ls: number): number {
  return q_Ls * LPS_A_M3D;
}

export function m3dALps(q_m3d: number): number {
  return q_m3d / LPS_A_M3D;
}

export function lpsAm3s(q_Ls: number): number {
  return q_Ls / 1000;
}

/** Redondeo para mostrar: n decimales, sin ceros de relleno. */
export function redondear(v: number, decimales = 2): number {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
}
