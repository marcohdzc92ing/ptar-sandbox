import { memo, useMemo } from 'react';
import { Line } from '@react-three/drei';
import { Etiqueta } from './Etiqueta';
import type { ThreeEvent } from '@react-three/fiber';
import type { UnidadCatalogo, UnidadInstancia } from '../types';
import { ajustarACuadricula, dimsHuella, dimsLocales, formasLocales, puertoLocal } from '../calc/geometria';
import { useDiseno, useUI } from '../store/diseno';
import { nombreUnidad, textoDimensiones } from '../ui/formato';
import { Puerto, clicEnPuertoOculto } from './Puerto';
import { escenaApi } from './api';
import { ModuloMalla } from './ModuloMalla';

export type EstadoDisposicion = 'ok' | 'aviso' | 'error';

interface Props {
  u: UnidadInstancia;
  cat: UnidadCatalogo;
  sepCirc: number;
  estado: EstadoDisposicion;
  seleccionada: boolean;
  etiquetas: boolean;
  colores: Record<string, string>;
  /** Puerto de salida de esta unidad desde el que se está conectando. */
  origen: string;
  /** Puertos de entrada de esta unidad que aceptan la conexión en curso (ids separados por coma). */
  objetivos: string;
  /** Color del semáforo de criterios de diseño (vacío si no aplica). */
  semaforo: string;
  /** Si se indica, la etiqueta muestra solo este número y se ocultan los puertos (captura para PDF). */
  numero: string;
}

const COLOR_ESTADO = { ok: '', aviso: '#f5a623', error: '#e53935' };

export const UnidadMalla = memo(function UnidadMalla({ u, cat, sepCirc, estado, seleccionada, etiquetas, colores, origen, objetivos, semaforo, numero }: Props) {
  const formas = useMemo(() => formasLocales(u, sepCirc), [u, sepCirc]);
  const { w, h } = dimsLocales(u, sepCirc);
  const altura = u.dim.altura ?? (u.dim.profundidadUtil ?? 0) + (u.dim.bordoLibre ?? 0);

  const contorno = useMemo<[number, number, number][]>(() => {
    const a = w / 2 + 0.35;
    const b = h / 2 + 0.35;
    return [
      [-a, 0.05, -b],
      [a, 0.05, -b],
      [a, 0.05, b],
      [-a, 0.05, b],
      [-a, 0.05, -b],
    ];
  }, [w, h]);

  const alPresionar = (e: ThreeEvent<PointerEvent>) => {
    if (e.nativeEvent.button !== 0) return;
    e.stopPropagation();
    if (clicEnPuertoOculto(e)) return;
    const { seleccionar, moverUnidad } = useDiseno.getState();
    seleccionar(u.id);
    const x0 = e.nativeEvent.clientX;
    const y0 = e.nativeEvent.clientY;
    const p = escenaApi.pantallaAPlano(x0, y0);
    if (!p) return;
    const dx = u.x - p.x;
    const dy = u.y - p.y;
    const clave = `mover:${u.id}:${Date.now()}`;
    let arrastrando = false;
    escenaApi.bloquearControles(true);

    const mover = (ev: PointerEvent) => {
      if (!arrastrando && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      arrastrando = true;
      const q = escenaApi.pantallaAPlano(ev.clientX, ev.clientY);
      const actual = useDiseno.getState().diseno.unidades.find((v) => v.id === u.id);
      if (!q || !actual) return;
      const pos = ajustarACuadricula(q.x + dx, q.y + dy, dimsHuella(actual, sepCirc), useUI.getState().paso);
      moverUnidad(u.id, pos.x, pos.y, { clave, ventana: Infinity });
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
  };

  return (
    <group
      position={[u.x, 0, u.y]}
      rotation={[0, (-u.rot * Math.PI) / 180, 0]}
      onPointerDown={alPresionar}
      onPointerOver={(e) => {
        e.stopPropagation();
        if (!document.body.style.cursor) document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        if (document.body.style.cursor === 'grab') document.body.style.cursor = '';
      }}
    >
      {formas.map((f, i) => (
        <ModuloMalla key={i} forma={f} u={u} cat={cat} />
      ))}

      {estado !== 'ok' && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w + 0.7, h + 0.7]} />
          <meshBasicMaterial color={COLOR_ESTADO[estado]} transparent opacity={0.45} />
        </mesh>
      )}
      {seleccionada && <Line points={contorno} color="#1565c0" lineWidth={2.5} />}

      {!numero && cat.puertos.map((p) => {
        const l = puertoLocal(u, p, sepCirc);
        const esObjetivo = objetivos.split(',').includes(p.id);
        const esOrigen = origen === p.id;
        return (
          <Puerto
            key={p.id}
            unidad={u.id}
            puerto={p}
            posicion={[l.x, 0.4, l.y]}
            realce={esObjetivo ? 1.7 : esOrigen ? 1.4 : 1}
            color={esObjetivo ? '#00c853' : esOrigen ? '#ff9100' : (colores[p.fluido] ?? '#333')}
          />
        );
      })}

      {numero ? (
        <Etiqueta posicion={[0, altura + 0.8, 0]} titulo={numero} borde="#1f2933" />
      ) : etiquetas && (
        <Etiqueta
          posicion={[0, altura + 0.8, 0]}
          titulo={nombreUnidad(u, cat)}
          detalle={textoDimensiones(u)}
          punto={semaforo || undefined}
          borde={estado !== 'ok' ? COLOR_ESTADO[estado] : seleccionada ? '#1565c0' : '#c5ccd4'}
        />
      )}
    </group>
  );
});
