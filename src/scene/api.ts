/**
 * Puente entre la interfaz HTML y la escena 3D. El componente <ControlCamara>
 * (dentro del Canvas) rellena estas funciones al montarse.
 */
export interface PuntoPlano {
  x: number;
  y: number;
}

export const escenaApi = {
  /** Convierte coordenadas de pantalla al punto del terreno (m) bajo el cursor. */
  pantallaAPlano: (_clientX: number, _clientY: number): PuntoPlano | null => null,
  /** Gira la vista 90° (1 = horario, -1 = antihorario). */
  rotarVista: (_dir: 1 | -1): void => {},
  /** Centra y encuadra el terreno. */
  centrarVista: (): void => {},
  /** Punto del terreno al centro de la vista. */
  centroVista: (): PuntoPlano => ({ x: 0, y: 0 }),
  /** Dibuja un cuadro y lo devuelve como imagen JPEG (data URL). */
  capturar: (): string | null => null,
  /** Desactiva el paneo mientras se arrastra una unidad. */
  bloquearControles: (_bloquear: boolean): void => {},
};

