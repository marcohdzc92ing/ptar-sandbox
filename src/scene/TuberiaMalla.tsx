import { memo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Mesh, OrthographicCamera } from 'three';
import type { Tuberia } from '../types';
import type { AnalisisTuberia } from '../store/analisis';
import { useDiseno } from '../store/diseno';
import { Etiqueta } from './Etiqueta';
import { iniciarArrastre } from './arrastre';
import { clicEnPuertoOculto } from './Puerto';

interface Props {
  t: Tuberia;
  analisis: AnalisisTuberia;
  color: string;
  seleccionada: boolean;
  etiqueta: string;
}

const Y = 0.25;
const COLOR_ESTADO: Record<string, string> = { amarillo: '#f5a623', rojo: '#e53935' };
const redondear = (v: number) => Math.round(v * 2) / 2;

/** Asa de edición del trazo, con tamaño constante en pantalla. */
function Asa({
  posicion,
  radioPx,
  color,
  opacidad = 1,
  alPresionar,
  alDobleClic,
}: {
  posicion: [number, number, number];
  radioPx: number;
  color: string;
  opacidad?: number;
  alPresionar: (e: ThreeEvent<PointerEvent>) => void;
  alDobleClic?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const malla = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    malla.current?.scale.setScalar(radioPx / (camera as OrthographicCamera).zoom);
  });
  return (
    <mesh ref={malla} position={posicion} renderOrder={6} onPointerDown={alPresionar} onDoubleClick={alDobleClic}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshBasicMaterial color={color} transparent opacity={opacidad} depthTest={false} />
    </mesh>
  );
}

export const TuberiaMalla = memo(function TuberiaMalla({ t, analisis, color, seleccionada, etiqueta }: Props) {
  const { puntos, insercion } = analisis.ruta;
  const grosor = seleccionada ? 0.46 : 0.32;
  const alerta = COLOR_ESTADO[analisis.estado];

  const tramos = puntos.slice(1).map((b, i) => {
    const a = puntos[i];
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    return { a, b, largo, horizontal: Math.abs(b.y - a.y) < 1e-9, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ins: insercion[i] };
  });
  const mayor = tramos.reduce((m, s) => (s.largo > m.largo ? s : m), tramos[0]);

  const seleccionar = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    if (clicEnPuertoOculto(e)) return;
    useDiseno.getState().seleccionarTuberia(t.id);
  };

  /** Arrastra un punto intermedio; si `nuevo`, primero lo inserta en `indice`. */
  const arrastrarPunto = (e: ThreeEvent<PointerEvent>, indice: number, nuevo: boolean) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    const original = t.puntos;
    const clave = `punto:${t.id}:${Date.now()}`;
    iniciarArrastre(e, (p) => {
      const q: [number, number] = [redondear(p.x), redondear(p.y)];
      const puntosNuevos: [number, number][] = nuevo
        ? [...original.slice(0, indice), q, ...original.slice(indice)]
        : original.map((v, i) => (i === indice ? q : v));
      useDiseno.getState().actualizarTuberia(t.id, { puntos: puntosNuevos }, { clave, ventana: Infinity });
    });
  };

  const quitarPunto = (e: ThreeEvent<MouseEvent>, indice: number) => {
    e.stopPropagation();
    useDiseno.getState().actualizarTuberia(t.id, { puntos: t.puntos.filter((_, i) => i !== indice) });
  };

  return (
    <group
      onPointerDown={seleccionar}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (!document.body.style.cursor) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (document.body.style.cursor === 'pointer') document.body.style.cursor = '';
      }}
    >
      {tramos.map((s, i) => (
        <group key={i} position={[s.mx, 0, s.my]}>
          <mesh position={[0, Y, 0]}>
            <boxGeometry args={s.horizontal ? [s.largo + grosor, grosor, grosor] : [grosor, grosor, s.largo + grosor]} />
            <meshLambertMaterial color={color} />
          </mesh>
          {alerta && (
            <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={s.horizontal ? [s.largo + 1.1, 1.1] : [1.1, s.largo + 1.1]} />
              <meshBasicMaterial color={alerta} transparent opacity={0.55} />
            </mesh>
          )}
        </group>
      ))}

      {mayor && mayor.largo > 1.5 && (
        <mesh
          position={[mayor.mx, Y + 0.05, mayor.my]}
          rotation={[0, -Math.atan2(mayor.b.y - mayor.a.y, mayor.b.x - mayor.a.x), -Math.PI / 2]}
        >
          <coneGeometry args={[0.45, 1.1, 10]} />
          <meshLambertMaterial color={color} />
        </mesh>
      )}

      {seleccionada && (
        <>
          {tramos.map(
            (s, i) =>
              s.ins >= 0 &&
              s.largo > 1.2 && (
                <Asa
                  key={`m${i}`}
                  posicion={[s.mx, Y + 0.4, s.my]}
                  radioPx={6}
                  color="#ffffff"
                  opacidad={0.85}
                  alPresionar={(e) => arrastrarPunto(e, s.ins, true)}
                />
              ),
          )}
          {t.puntos.map(([x, y], i) => (
            <Asa
              key={`p${i}`}
              posicion={[x, Y + 0.45, y]}
              radioPx={8}
              color="#1565c0"
              alPresionar={(e) => arrastrarPunto(e, i, false)}
              alDobleClic={(e) => quitarPunto(e, i)}
            />
          ))}
          {mayor && <Etiqueta posicion={[mayor.mx, Y + 1.2, mayor.my]} titulo={etiqueta} borde={alerta ?? '#1565c0'} />}
        </>
      )}
    </group>
  );
});
