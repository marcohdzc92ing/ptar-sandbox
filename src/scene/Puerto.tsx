import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Mesh, OrthographicCamera } from 'three';
import type { PuertoCatalogo } from '../types';
import { clicEnPuerto, puertoDe } from '../ui/acciones';

const RADIO = 0.32;
/** Radio mínimo en pantalla (px) para que el puerto siempre se pueda pulsar. */
const RADIO_PX = 6.5;

interface Props {
  unidad: string;
  puerto: PuertoCatalogo;
  posicion: [number, number, number];
  color: string;
  /** Factor de realce (origen u objetivo de una conexión en curso). */
  realce: number;
}

/**
 * Marcador de un puerto: cubo = salida, esfera = entrada. Se dibuja encima
 * de todo (sin prueba de profundidad) para que no lo tapen los tanques.
 */
export function Puerto({ unidad, puerto, posicion, color, realce }: Props) {
  const malla = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    const zoom = (camera as OrthographicCamera).zoom;
    malla.current?.scale.setScalar(realce * Math.max(1, RADIO_PX / (zoom * RADIO)));
  });

  return (
    <mesh
      ref={malla}
      position={posicion}
      renderOrder={5}
      userData={{ puerto: puerto.id, unidad }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.nativeEvent.button === 0) clicEnPuerto(unidad, puerto);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (document.body.style.cursor === 'pointer') document.body.style.cursor = '';
      }}
    >
      {puerto.tipo === 'salida' ? <boxGeometry args={[0.55, 0.55, 0.55]} /> : <sphereGeometry args={[RADIO, 14, 10]} />}
      <meshBasicMaterial color={color} depthTest={false} transparent />
    </mesh>
  );
}

/**
 * Si bajo el cursor hay un puerto (aunque lo tape un tanque o una tubería),
 * procesa el clic como clic en ese puerto y devuelve true.
 */
export function clicEnPuertoOculto(e: ThreeEvent<PointerEvent>): boolean {
  const hit = e.intersections.find((i) => i.object.userData?.puerto);
  if (!hit) return false;
  const { unidad, puerto } = hit.object.userData as { unidad: string; puerto: string };
  const p = puertoDe(unidad, puerto);
  if (!p) return false;
  clicEnPuerto(unidad, p);
  return true;
}
