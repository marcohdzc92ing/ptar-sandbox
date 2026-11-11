import type { ThreeEvent } from '@react-three/fiber';
import { escenaApi, type PuntoPlano } from './api';

/**
 * Inicia un arrastre sobre el plano del terreno a partir de un pointerdown
 * de la escena. `alMover` recibe el punto del terreno bajo el cursor.
 */
export function iniciarArrastre(e: ThreeEvent<PointerEvent>, alMover: (p: PuntoPlano) => void): void {
  const x0 = e.nativeEvent.clientX;
  const y0 = e.nativeEvent.clientY;
  let activo = false;
  escenaApi.bloquearControles(true);

  const mover = (ev: PointerEvent) => {
    if (!activo && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
    activo = true;
    const p = escenaApi.pantallaAPlano(ev.clientX, ev.clientY);
    if (p) alMover(p);
  };
  const soltar = () => {
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', soltar);
    document.body.style.cursor = '';
    setTimeout(() => escenaApi.bloquearControles(false), 0);
  };
  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
  document.body.style.cursor = 'grabbing';
}
