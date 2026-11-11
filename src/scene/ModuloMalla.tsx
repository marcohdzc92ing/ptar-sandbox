import { DoubleSide } from 'three';
import type { Forma2D } from '../calc/geometria';
import type { UnidadCatalogo, UnidadInstancia } from '../types';

const CONCRETO = '#c8c8c2';
const CONCRETO_OSCURO = '#a9a9a3';
const METAL = '#4a5058';

interface Props {
  forma: Forma2D;
  u: UnidadInstancia;
  cat: UnidadCatalogo;
}

function Caja({ pos, tam, color, rot }: { pos: [number, number, number]; tam: [number, number, number]; color: string; rot?: [number, number, number] }) {
  return (
    <mesh position={pos} rotation={rot}>
      <boxGeometry args={tam} />
      <meshLambertMaterial color={color} />
    </mesh>
  );
}

function Burbujas({ puntos, y }: { puntos: [number, number][]; y: number }) {
  return (
    <>
      {puntos.map(([x, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.5, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
        </mesh>
      ))}
    </>
  );
}

function rejilla(w: number, d: number, nxMax: number, nzMax: number, xMin = -w / 2): [number, number][] {
  const ancho = w / 2 - xMin;
  const nx = Math.max(1, Math.min(nxMax, Math.round(ancho / 3)));
  const nz = Math.max(1, Math.min(nzMax, Math.round(d / 3)));
  const pts: [number, number][] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      pts.push([xMin + (ancho * (i + 0.5)) / nx, -d / 2 + (d * (j + 0.5)) / nz]);
    }
  }
  return pts;
}

/** Dibuja un módulo de una unidad (tanque, equipo o marcador) en coordenadas locales. */
export function ModuloMalla({ forma, u, cat }: Props) {
  const visual = cat.visual;
  const hw = u.dim.profundidadUtil ?? 0;
  const H = u.dim.altura ?? hw + (u.dim.bordoLibre ?? 0);
  const cx = forma.cx;
  const cz = forma.cy;

  // ----- Marcadores de influente y destino -----
  if (visual === 'fuente' || visual === 'destino') {
    const f = forma as Extract<Forma2D, { tipo: 'rect' }>;
    const r = Math.min(f.w, f.h) * 0.28;
    return (
      <group position={[cx, 0, cz]}>
        <Caja pos={[0, 0.1, 0]} tam={[f.w, 0.2, f.h]} color={cat.color} />
        {visual === 'fuente' ? (
          <mesh position={[0, 0.9, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[r, r * 2.2, 16]} />
            <meshLambertMaterial color="#ffffff" />
          </mesh>
        ) : (
          <mesh position={[0, 1.2, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[r, r * 2.2, 16]} />
            <meshLambertMaterial color="#ffffff" />
          </mesh>
        )}
      </group>
    );
  }

  // ----- Equipos cerrados -----
  if (visual === 'equipo') {
    const f = forma as Extract<Forma2D, { tipo: 'rect' }>;
    const w = f.w * 0.97;
    const d = f.h * 0.97;
    return (
      <group position={[cx, 0, cz]}>
        <Caja pos={[0, 0.1, 0]} tam={[f.w, 0.2, f.h]} color={CONCRETO} />
        <Caja pos={[0, 0.2 + H / 2, 0]} tam={[w * 0.92, H, d * 0.8]} color={cat.color} />
        <Caja pos={[-w * 0.3, 0.2 + H + 0.2, 0]} tam={[w * 0.2, 0.4, d * 0.4]} color={METAL} />
      </group>
    );
  }

  // ----- Tanques circulares -----
  if (forma.tipo === 'circ') {
    const r = forma.r;
    const t = Math.min(0.3, r * 0.15);
    const superficie = visual === 'medio' ? '#6e6a5e' : cat.color;
    const hSup = Math.max(hw, 0.05);
    return (
      <group position={[cx, 0, cz]}>
        <mesh position={[0, H / 2, 0]}>
          <cylinderGeometry args={[r, r, H, 40, 1, true]} />
          <meshLambertMaterial color={CONCRETO} side={DoubleSide} />
        </mesh>
        <mesh position={[0, H, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - t, r, 40]} />
          <meshLambertMaterial color={CONCRETO_OSCURO} />
        </mesh>
        {visual !== 'domo' && (
          <mesh position={[0, hSup / 2, 0]}>
            <cylinderGeometry args={[r - t, r - t, hSup, 40]} />
            <meshLambertMaterial color={superficie} />
          </mesh>
        )}
        {visual === 'sedimentador' && (
          <>
            <Caja pos={[0, H + 0.1, 0]} tam={[2 * r, 0.2, Math.min(0.9, r * 0.25)]} color={METAL} />
            <mesh position={[0, (H + 0.5) / 2, 0]}>
              <cylinderGeometry args={[Math.max(0.3, r * 0.1), Math.max(0.3, r * 0.1), H + 0.5, 16]} />
              <meshLambertMaterial color={CONCRETO_OSCURO} />
            </mesh>
          </>
        )}
        {visual === 'medio' && (
          <>
            <Caja pos={[0, hSup + 0.3, 0]} tam={[2 * (r - t) * 0.95, 0.12, 0.25]} color={METAL} />
            <Caja pos={[0, hSup + 0.3, 0]} tam={[0.25, 0.12, 2 * (r - t) * 0.95]} color={METAL} />
            <mesh position={[0, (hSup + 0.6) / 2, 0]}>
              <cylinderGeometry args={[0.3, 0.3, hSup + 0.6, 12]} />
              <meshLambertMaterial color={METAL} />
            </mesh>
          </>
        )}
        {visual === 'domo' && (
          <mesh position={[0, H, 0]} scale={[1, 0.35, 1]}>
            <sphereGeometry args={[r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshLambertMaterial color={cat.color} />
          </mesh>
        )}
        {visual === 'aireado' && <Burbujas y={hSup + 0.02} puntos={rejilla(r, r, 2, 2)} />}
        {visual === 'carcamo' && <Bombas n={Number(u.params.numBombas ?? 2)} ancho={r} y={H} />}
      </group>
    );
  }

  // ----- Tanques rectangulares -----
  const w = forma.w;
  const d = forma.h;
  const t = Math.min(0.25, Math.min(w, d) * 0.2);
  const hSup = Math.max(hw, 0.05);
  const fraccionAnoxica = Math.min(0.9, Math.max(0.05, Number(u.params.fraccionAnoxica_pct ?? 25) / 100));
  const xDivision = -w / 2 + fraccionAnoxica * w;
  const canales = Math.max(1, Math.round(Number(u.params.numCanales ?? 1)));
  const anchoCanal = (d - 2 * t) / canales;

  return (
    <group position={[cx, 0, cz]}>
      <Caja pos={[0, H / 2, -(d / 2 - t / 2)]} tam={[w, H, t]} color={CONCRETO} />
      <Caja pos={[0, H / 2, d / 2 - t / 2]} tam={[w, H, t]} color={CONCRETO} />
      <Caja pos={[-(w / 2 - t / 2), H / 2, 0]} tam={[t, H, d - 2 * t]} color={CONCRETO} />
      <Caja pos={[w / 2 - t / 2, H / 2, 0]} tam={[t, H, d - 2 * t]} color={CONCRETO} />
      <Caja pos={[0, hSup / 2, 0]} tam={[w - 2 * t, hSup, d - 2 * t]} color={cat.color} />

      {visual === 'rejilla' && (
        <Caja pos={[0, H * 0.55, 0]} tam={[0.12, H * 1.25, d - 2 * t]} color={METAL} rot={[0, 0, 0.4]} />
      )}
      {visual === 'aireado' && <Burbujas y={hSup + 0.02} puntos={rejilla(w - 2 * t, d - 2 * t, 6, 3)} />}
      {visual === 'anoxico' && (
        <>
          <Caja pos={[xDivision, H / 2, 0]} tam={[0.2, H, d - 2 * t]} color={CONCRETO} />
          <Burbujas y={hSup + 0.02} puntos={rejilla(w - 2 * t, d - 2 * t, 5, 3, xDivision + 0.3)} />
        </>
      )}
      {visual === 'sedimentador' && <Caja pos={[0, H + 0.1, 0]} tam={[0.9, 0.2, d]} color={METAL} />}
      {visual === 'serpentin' &&
        Array.from({ length: canales - 1 }, (_, i) => {
          const largo = Math.max(0.2, w - 2 * t - anchoCanal);
          const lado = i % 2 === 0 ? -1 : 1;
          return (
            <Caja
              key={i}
              pos={[(lado * anchoCanal) / 2, (hSup + 0.2) / 2, -d / 2 + t + anchoCanal * (i + 1)]}
              tam={[largo, hSup + 0.2, 0.12]}
              color={CONCRETO}
            />
          );
        })}
      {visual === 'cubierto' && (
        <>
          <Caja pos={[0, H + 0.08, 0]} tam={[w, 0.16, d]} color={CONCRETO_OSCURO} />
          <Caja pos={[-w * 0.3, H + 0.76, 0]} tam={[Math.min(2, w * 0.3), 1.2, Math.min(1.5, d * 0.6)]} color={cat.color} />
        </>
      )}
      {visual === 'carcamo' && <Bombas n={Number(u.params.numBombas ?? 2)} ancho={w / 2 - t} y={H} />}
    </group>
  );
}

function Bombas({ n, ancho, y }: { n: number; ancho: number; y: number }) {
  const cuenta = Math.max(1, Math.min(6, Math.round(n)));
  return (
    <>
      {Array.from({ length: cuenta }, (_, i) => (
        <mesh key={i} position={[-ancho + (2 * ancho * (i + 0.5)) / cuenta, y + 0.35, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.7, 12]} />
          <meshLambertMaterial color="#2f6fa8" />
        </mesh>
      ))}
    </>
  );
}
