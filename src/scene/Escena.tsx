import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Line, MapControls } from '@react-three/drei';
import { Etiqueta } from './Etiqueta';
import { BufferGeometry, Float32BufferAttribute, OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { puedeConectar } from '../calc/tuberias';
import type { Analisis } from '../store/analisis';
import { TuberiaMalla } from './TuberiaMalla';
import { agregarDesdeCatalogo } from '../ui/acciones';
import { buscarEnCatalogo, useConfig } from '../store/config';
import { useDiseno, useUI } from '../store/diseno';
import { num } from '../ui/formato';
import { escenaApi } from './api';
import { UnidadMalla, type EstadoDisposicion } from './UnidadMalla';

/** Elevación de la proyección isométrica: atan(1/√2). */
const ELEVACION = Math.atan(1 / Math.SQRT2);
const DISTANCIA = 400;
const MARGEN = 20;

function direccion(indice: number): Vector3 {
  const az = Math.PI / 4 + (indice * Math.PI) / 2;
  return new Vector3(Math.sin(az) * Math.cos(ELEVACION), Math.sin(ELEVACION), Math.cos(az) * Math.cos(ELEVACION));
}

function ControlCamara() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const advance = useThree((s) => s.advance);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controles = useRef<any>(null);
  const indice = useRef(0);
  const tamano = useRef(size);
  tamano.current = size;

  useEffect(() => {
    const rayo = new Raycaster();
    const suelo = new Plane(new Vector3(0, 1, 0), 0);
    const ndc = new Vector2();
    const v = new Vector3();

    const colocar = (objetivo: Vector3) => {
      camera.position.copy(objetivo).addScaledVector(direccion(indice.current), DISTANCIA);
      camera.lookAt(objetivo);
      controles.current?.target.copy(objetivo);
      controles.current?.update();
      invalidate();
    };

    escenaApi.pantallaAPlano = (cx, cy) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      rayo.setFromCamera(ndc, camera);
      return rayo.ray.intersectPlane(suelo, v) ? { x: v.x, y: v.z } : null;
    };
    escenaApi.rotarVista = (dir) => {
      indice.current = (indice.current + dir + 4) % 4;
      colocar(controles.current ? controles.current.target.clone() : new Vector3());
    };
    escenaApi.centrarVista = () => {
      const { largo, ancho } = useDiseno.getState().diseno.datos.terreno;
      // El terreno en pantalla mide aprox. (largo + ancho)·cos45° de ancho.
      const anchoVisible = (largo + ancho) * Math.SQRT1_2 + 10;
      const altoVisible = (largo + ancho) * Math.SQRT1_2 * Math.sin(ELEVACION) + 20;
      camera.zoom = Math.max(1.5, Math.min(tamano.current.width / anchoVisible, tamano.current.height / altoVisible));
      camera.updateProjectionMatrix();
      colocar(new Vector3(largo / 2, 0, ancho / 2));
    };
    escenaApi.centroVista = () => {
      const t = controles.current?.target;
      return t ? { x: t.x, y: t.z } : { x: 0, y: 0 };
    };
    escenaApi.capturar = () => {
      try {
        advance(performance.now());
        // recorta la imagen al terreno (con holgura para tanques y etiquetas)
        const lienzo = gl.domElement;
        const { largo, ancho } = useDiseno.getState().diseno.datos.terreno;
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const altura of [0, 14]) {
          for (const [x, z] of [[0, 0], [largo, 0], [largo, ancho], [0, ancho]]) {
            v.set(x, altura, z).project(camera);
            const px = ((v.x + 1) / 2) * lienzo.width;
            const py = ((1 - v.y) / 2) * lienzo.height;
            x0 = Math.min(x0, px);
            x1 = Math.max(x1, px);
            y0 = Math.min(y0, py);
            y1 = Math.max(y1, py);
          }
        }
        const holgura = 0.03 * lienzo.width;
        x0 = Math.max(0, Math.floor(x0 - holgura));
        y0 = Math.max(0, Math.floor(y0 - holgura));
        x1 = Math.min(lienzo.width, Math.ceil(x1 + holgura));
        y1 = Math.min(lienzo.height, Math.ceil(y1 + holgura));
        const recorte = document.createElement('canvas');
        recorte.width = Math.max(1, x1 - x0);
        recorte.height = Math.max(1, y1 - y0);
        recorte.getContext('2d')!.drawImage(lienzo, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height);
        return recorte.toDataURL('image/jpeg', 0.92);
      } catch {
        return null;
      }
    };
    escenaApi.bloquearControles = (b) => {
      if (controles.current) controles.current.enabled = !b;
    };
    escenaApi.centrarVista();
  }, [camera, gl, invalidate, advance]);

  return (
    <MapControls
      ref={controles}
      enableRotate={false}
      enableDamping={false}
      zoomToCursor
      minZoom={1.5}
      maxZoom={90}
      zoomSpeed={1.2}
    />
  );
}

function Terreno({ largo, ancho }: { largo: number; ancho: number }) {
  const [menor, mayor] = useMemo(() => {
    const a: number[] = [];
    const b: number[] = [];
    const x0 = -MARGEN;
    const x1 = Math.ceil(largo) + MARGEN;
    const z0 = -MARGEN;
    const z1 = Math.ceil(ancho) + MARGEN;
    for (let x = x0; x <= x1; x++) (x % 10 === 0 ? b : a).push(x, 0, z0, x, 0, z1);
    for (let z = z0; z <= z1; z++) (z % 10 === 0 ? b : a).push(x0, 0, z, x1, 0, z);
    const g1 = new BufferGeometry();
    g1.setAttribute('position', new Float32BufferAttribute(a, 3));
    const g2 = new BufferGeometry();
    g2.setAttribute('position', new Float32BufferAttribute(b, 3));
    return [g1, g2];
  }, [largo, ancho]);

  useEffect(() => () => {
    menor.dispose();
    mayor.dispose();
  }, [menor, mayor]);

  const borde: [number, number, number][] = [
    [0, 0.03, 0],
    [largo, 0.03, 0],
    [largo, 0.03, ancho],
    [0, 0.03, ancho],
    [0, 0.03, 0],
  ];

  return (
    <group>
      <mesh position={[largo / 2, -0.03, ancho / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[largo, ancho]} />
        <meshBasicMaterial color="#e3ecd6" />
      </mesh>
      <lineSegments geometry={menor}>
        <lineBasicMaterial color="#c9d1d9" />
      </lineSegments>
      <lineSegments geometry={mayor}>
        <lineBasicMaterial color="#8d99a6" />
      </lineSegments>
      <Line points={borde} color="#3b7a2a" lineWidth={3} />
      <Etiqueta posicion={[largo / 2, 0, ancho + 3]} titulo={`${num(largo)} m`} color="#3b7a2a" />
      <Etiqueta posicion={[largo + 3, 0, ancho / 2]} titulo={`${num(ancho)} m`} color="#3b7a2a" />
    </group>
  );
}

interface Props {
  analisis: Analisis;
}

const f2 = (v: number) => num(v, 2);
const COLOR_SEMAFORO: Record<string, string> = { verde: '#2e9e44', amarillo: '#f5a623', rojo: '#e53935', sin_dato: '#9aa5b1' };

export function Escena({ analisis }: Props) {
  const unidades = useDiseno((s) => s.diseno.unidades);
  const tuberias = useDiseno((s) => s.diseno.tuberias);
  const terreno = useDiseno((s) => s.diseno.datos.terreno);
  const seleccion = useDiseno((s) => s.seleccion);
  const tuberiaSel = useDiseno((s) => s.tuberiaSel);
  const catalogo = useConfig((s) => s.catalogo);
  const cfgTuberias = useConfig((s) => s.tuberias);
  const sepCirc = useConfig((s) => s.general.separacionModulosCirculares_m);
  const etiquetas = useUI((s) => s.mostrarEtiquetas);
  const conexion = useUI((s) => s.conexion);
  const captura = useUI((s) => s.captura);

  const colores = useMemo(() => {
    const c: Record<string, string> = {};
    for (const [id, f] of Object.entries(cfgTuberias.fluidos)) c[id] = f.color;
    return c;
  }, [cfgTuberias]);

  const estados = useMemo(() => {
    const m = new Map<string, EstadoDisposicion>();
    for (const p of analisis.problemas) {
      for (const id of p.unidades) {
        if (p.tipo === 'separacion') {
          if (!m.has(id)) m.set(id, 'aviso');
        } else m.set(id, 'error');
      }
    }
    return m;
  }, [analisis.problemas]);

  /** Por unidad: puertos de entrada que aceptan la conexión en curso. */
  const objetivos = useMemo(() => {
    const m = new Map<string, string>();
    if (!conexion) return m;
    const origenU = unidades.find((u) => u.id === conexion.unidad);
    const origenP = origenU && buscarEnCatalogo(catalogo, origenU.tipo)?.puertos.find((p) => p.id === conexion.puerto);
    if (!origenP) return m;
    for (const u of unidades) {
      const ids = (buscarEnCatalogo(catalogo, u.tipo)?.puertos ?? [])
        .filter((p) => puedeConectar({ unidad: conexion.unidad, puerto: origenP }, { unidad: u.id, puerto: p }, tuberias, cfgTuberias))
        .map((p) => p.id);
      if (ids.length) m.set(u.id, ids.join(','));
    }
    return m;
  }, [conexion, unidades, tuberias, catalogo, cfgTuberias]);

  const alSoltar = (e: React.DragEvent) => {
    const tipo = e.dataTransfer.getData('application/x-ptar-unidad');
    const cat = tipo ? buscarEnCatalogo(catalogo, tipo) : undefined;
    const p = escenaApi.pantallaAPlano(e.clientX, e.clientY);
    if (!cat || !p) return;
    e.preventDefault();
    agregarDesdeCatalogo(cat, p.x, p.y);
  };

  return (
    <div
      className="lienzo"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-ptar-unidad')) e.preventDefault();
      }}
      onDrop={alSoltar}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        orthographic
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ zoom: 6, near: 1, far: 4000, position: [300, 300, 300] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerMissed={() => {
          useDiseno.getState().seleccionar(null);
          useUI.getState().setConexion(null);
        }}
      >
        <color attach="background" args={['#f3f5f7']} />
        <ambientLight intensity={1.9} />
        <directionalLight position={[-80, 160, 60]} intensity={1.6} />
        <ControlCamara />
        <Terreno largo={terreno.largo} ancho={terreno.ancho} />
        {tuberias.map((t) => {
          const a = analisis.tuberias.get(t.id);
          if (!a) return null;
          const velocidad = a.vMed !== null ? ` · ${f2(a.vMed)} m/s` : '';
          return (
            <TuberiaMalla
              key={t.id}
              t={t}
              analisis={a}
              color={colores[t.fluido] ?? '#555'}
              seleccionada={tuberiaSel === t.id}
              etiqueta={`DN ${t.dn_mm} ${t.material} · ${f2(a.longitud)} m${velocidad}`}
            />
          );
        })}
        {unidades.map((u, i) => {
          const cat = buscarEnCatalogo(catalogo, u.tipo);
          if (!cat) return null;
          return (
            <UnidadMalla
              key={u.id}
              u={u}
              cat={cat}
              sepCirc={sepCirc}
              estado={estados.get(u.id) ?? 'ok'}
              seleccionada={seleccion === u.id}
              etiquetas={etiquetas}
              colores={colores}
              origen={conexion?.unidad === u.id ? conexion.puerto : ''}
              objetivos={objetivos.get(u.id) ?? ''}
              numero={captura ? String(i + 1) : ''}
              semaforo={COLOR_SEMAFORO[analisis.validacion.get(u.id)?.estado ?? 'sin_criterios'] ?? ''}
            />
          );
        })}
      </Canvas>
    </div>
  );
}
