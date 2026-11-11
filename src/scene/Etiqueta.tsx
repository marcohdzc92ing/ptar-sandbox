import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, SRGBColorSpace, type OrthographicCamera, type Sprite } from 'three';

interface Props {
  titulo: string;
  detalle?: string;
  posicion: [number, number, number];
  /** Color del borde de la caja; sin caja si se omite. */
  borde?: string;
  color?: string;
  /** Color de un punto de semáforo a la izquierda del título. */
  punto?: string;
}

const ESCALA = 2;
const FUENTE = "'Segoe UI', system-ui, sans-serif";

/**
 * Etiqueta de texto dibujada dentro del lienzo (sprite con textura).
 * Mantiene tamaño constante en pantalla sin importar el zoom.
 */
export function Etiqueta({ titulo, detalle, posicion, borde, color = '#1f2933', punto }: Props) {
  const sprite = useRef<Sprite>(null);

  const { textura, ancho, alto } = useMemo(() => {
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d')!;
    const fTitulo = `600 12px ${FUENTE}`;
    const fDetalle = `11px ${FUENTE}`;
    ctx.font = fTitulo;
    let w = ctx.measureText(titulo).width;
    if (detalle) {
      ctx.font = fDetalle;
      w = Math.max(w, ctx.measureText(detalle).width);
    }
    const extra = punto ? 14 : 0;
    const ancho = Math.ceil(w) + 16 + extra;
    const alto = detalle ? 36 : 22;
    lienzo.width = ancho * ESCALA;
    lienzo.height = alto * ESCALA;
    ctx.scale(ESCALA, ESCALA);
    if (borde) {
      ctx.beginPath();
      ctx.roundRect(1, 1, ancho - 2, alto - 2, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = borde;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fTitulo;
    ctx.fillStyle = color;
    ctx.fillText(titulo, ancho / 2 + extra / 2, detalle ? 12 : alto / 2 + 1);
    if (punto) {
      ctx.font = fTitulo;
      const wt = ctx.measureText(titulo).width;
      ctx.beginPath();
      ctx.arc(ancho / 2 + extra / 2 - wt / 2 - 9, detalle ? 12 : alto / 2, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = punto;
      ctx.fill();
    }
    if (detalle) {
      ctx.font = fDetalle;
      ctx.fillStyle = '#5b6672';
      ctx.fillText(detalle, ancho / 2, 26);
    }
    const textura = new CanvasTexture(lienzo);
    textura.colorSpace = SRGBColorSpace;
    textura.minFilter = LinearFilter;
    textura.generateMipmaps = false;
    return { textura, ancho, alto };
  }, [titulo, detalle, borde, color, punto]);

  useEffect(() => () => textura.dispose(), [textura]);

  useFrame(({ camera }) => {
    const zoom = (camera as OrthographicCamera).zoom;
    sprite.current?.scale.set(ancho / zoom, alto / zoom, 1);
  });

  return (
    <sprite ref={sprite} position={posicion} center={[0.5, 0]} renderOrder={10} raycast={() => null}>
      <spriteMaterial map={textura} depthTest={false} depthWrite={false} transparent toneMapped={false} />
    </sprite>
  );
}
