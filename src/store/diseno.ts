import { create } from 'zustand';
import type { DatosProyecto, Diseno, Extremo, Rotacion, Tuberia, UnidadCatalogo, UnidadInstancia } from '../types';
import proyectoDefecto from '../data/proyectoDefecto.json';
import ejemplo from '../data/ejemplo-50lps.json';

const MAX_HISTORIAL = 100;
const VENTANA_MS = 800;

let contador = 0;
function nuevoId(): string {
  contador += 1;
  return `u${Date.now().toString(36)}${contador}`;
}

interface OpcionesCambio {
  /** Cambios consecutivos con la misma clave se agrupan en un solo paso de deshacer. */
  clave?: string;
  /** Ventana de agrupación en ms (Infinity para arrastres). */
  ventana?: number;
}

interface EstadoDiseno {
  diseno: Diseno;
  seleccion: string | null;
  /** Tubería seleccionada (excluyente con la unidad seleccionada). */
  tuberiaSel: string | null;
  pasado: Diseno[];
  futuro: Diseno[];
  ultimaClave: string;
  ultimoTiempo: number;

  seleccionar: (id: string | null) => void;
  seleccionarTuberia: (id: string | null) => void;
  agregarTuberia: (t: Omit<Tuberia, "id">) => string;
  actualizarTuberia: (id: string, cambio: Partial<Tuberia>, opciones?: OpcionesCambio) => void;
  borrarTuberia: (id: string) => void;
  agregarUnidad: (cat: UnidadCatalogo, x: number, y: number) => string;
  moverUnidad: (id: string, x: number, y: number, opciones?: OpcionesCambio) => void;
  rotarUnidad: (id: string) => void;
  duplicarUnidad: (id: string, dx: number, dy: number) => void;
  borrarUnidad: (id: string) => void;
  actualizarUnidad: (id: string, cambio: Partial<UnidadInstancia>, opciones?: OpcionesCambio) => void;
  actualizarDatos: (cambio: Partial<DatosProyecto>, opciones?: OpcionesCambio) => void;
  actualizarProyecto: (cambio: Partial<Pick<Diseno, 'alumno' | 'proyecto'>>) => void;
  deshacer: () => void;
  rehacer: () => void;
  cargarDiseno: (d: Diseno) => void;
  cargarEjemplo: () => void;
  nuevoDiseno: () => void;
}

export const useDiseno = create<EstadoDiseno>()((set, get) => {
  /** Aplica un cambio al diseño y lo registra en el historial. */
  function cambiar(fn: (d: Diseno) => Diseno, opciones: OpcionesCambio = {}) {
    const s = get();
    const ahora = Date.now();
    const agrupar =
      opciones.clave !== undefined &&
      opciones.clave === s.ultimaClave &&
      ahora - s.ultimoTiempo < (opciones.ventana ?? VENTANA_MS);
    const siguiente = fn(s.diseno);
    if (siguiente === s.diseno) return;
    set({
      diseno: siguiente,
      pasado: agrupar ? s.pasado : [...s.pasado, s.diseno].slice(-MAX_HISTORIAL),
      futuro: [],
      ultimaClave: opciones.clave ?? '',
      ultimoTiempo: ahora,
    });
  }

  function mapUnidad(id: string, fn: (u: UnidadInstancia) => UnidadInstancia) {
    return (d: Diseno): Diseno => ({ ...d, unidades: d.unidades.map((u) => (u.id === id ? fn(u) : u)) });
  }

  return {
    diseno: ejemplo as unknown as Diseno,
    seleccion: null,
    tuberiaSel: null,
    pasado: [],
    futuro: [],
    ultimaClave: '',
    ultimoTiempo: 0,

    seleccionar: (id) => set({ seleccion: id, tuberiaSel: null }),
    seleccionarTuberia: (id) => set({ tuberiaSel: id, seleccion: null }),

    agregarTuberia: (t) => {
      const id = nuevoId().replace('u', 't');
      cambiar((d) => ({ ...d, tuberias: [...d.tuberias, { ...t, id }] }));
      set({ tuberiaSel: id, seleccion: null });
      return id;
    },

    actualizarTuberia: (id, cambio, opciones) =>
      cambiar((d) => ({ ...d, tuberias: d.tuberias.map((t) => (t.id === id ? { ...t, ...cambio } : t)) }), opciones),

    borrarTuberia: (id) => {
      cambiar((d) => ({ ...d, tuberias: d.tuberias.filter((t) => t.id !== id) }));
      if (get().tuberiaSel === id) set({ tuberiaSel: null });
    },

    agregarUnidad: (cat, x, y) => {
      const id = nuevoId();
      const params: Record<string, number | string> = {};
      for (const p of cat.parametros) params[p.id] = p.defecto;
      const unidad: UnidadInstancia = {
        id,
        tipo: cat.id,
        x,
        y,
        rot: 0,
        forma: cat.formas[0],
        dim: { ...cat.dimensionesDefecto },
        params,
      };
      cambiar((d) => ({ ...d, unidades: [...d.unidades, unidad] }));
      set({ seleccion: id, tuberiaSel: null });
      return id;
    },

    moverUnidad: (id, x, y, opciones) =>
      cambiar(
        (d) => {
          const u = d.unidades.find((v) => v.id === id);
          if (!u || (u.x === x && u.y === y)) return d;
          return mapUnidad(id, (v) => ({ ...v, x, y }))(d);
        },
        opciones,
      ),

    rotarUnidad: (id) =>
      cambiar(mapUnidad(id, (u) => ({ ...u, rot: ((u.rot + 90) % 360) as Rotacion }))),

    duplicarUnidad: (id, dx, dy) => {
      const original = get().diseno.unidades.find((u) => u.id === id);
      if (!original) return;
      const copia: UnidadInstancia = {
        ...original,
        id: nuevoId(),
        x: original.x + dx,
        y: original.y + dy,
        dim: { ...original.dim },
        params: { ...original.params },
      };
      cambiar((d) => ({ ...d, unidades: [...d.unidades, copia] }));
      set({ seleccion: copia.id, tuberiaSel: null });
    },

    borrarUnidad: (id) => {
      const toca = (e: Extremo) => e.unidad === id;
      cambiar((d) => ({
        ...d,
        unidades: d.unidades.filter((u) => u.id !== id),
        tuberias: d.tuberias.filter((t) => !toca(t.desde) && !toca(t.hasta)),
      }));
      if (get().seleccion === id) set({ seleccion: null });
    },

    actualizarUnidad: (id, cambio, opciones) => cambiar(mapUnidad(id, (u) => ({ ...u, ...cambio })), opciones),

    actualizarDatos: (cambio, opciones) => cambiar((d) => ({ ...d, datos: { ...d.datos, ...cambio } }), opciones),

    actualizarProyecto: (cambio) => cambiar((d) => ({ ...d, ...cambio }), { clave: 'proyecto' }),

    deshacer: () => {
      const s = get();
      const anterior = s.pasado[s.pasado.length - 1];
      if (!anterior) return;
      set({
        diseno: anterior,
        pasado: s.pasado.slice(0, -1),
        futuro: [s.diseno, ...s.futuro],
        ultimaClave: '',
        seleccion: anterior.unidades.some((u) => u.id === s.seleccion) ? s.seleccion : null,
        tuberiaSel: anterior.tuberias.some((t) => t.id === s.tuberiaSel) ? s.tuberiaSel : null,
      });
    },

    rehacer: () => {
      const s = get();
      const siguiente = s.futuro[0];
      if (!siguiente) return;
      set({
        diseno: siguiente,
        pasado: [...s.pasado, s.diseno],
        futuro: s.futuro.slice(1),
        ultimaClave: '',
        seleccion: siguiente.unidades.some((u) => u.id === s.seleccion) ? s.seleccion : null,
        tuberiaSel: siguiente.tuberias.some((t) => t.id === s.tuberiaSel) ? s.tuberiaSel : null,
      });
    },

    cargarDiseno: (d) => {
      cambiar(() => d);
      set({ seleccion: null, tuberiaSel: null });
    },
    cargarEjemplo: () => get().cargarDiseno(ejemplo as unknown as Diseno),
    nuevoDiseno: () => get().cargarDiseno(proyectoDefecto as unknown as Diseno),
  };
});

/** Preferencias de la interfaz que no forman parte del diseño. */
interface EstadoUI {
  /** Paso de ajuste a la cuadrícula, en metros. */
  paso: 1 | 0.5;
  unidadCaudal: 'Ls' | 'm3d';
  mostrarEtiquetas: boolean;
  /** Puerto de salida elegido mientras se tiende una tubería. */
  conexion: Extremo | null;
  setConexion: (c: Extremo | null) => void;
  /** Mientras se captura la vista para el PDF: etiquetas numeradas y sin puertos. */
  captura: boolean;
  setCaptura: (v: boolean) => void;
  setPaso: (p: 1 | 0.5) => void;
  setUnidadCaudal: (u: 'Ls' | 'm3d') => void;
  setMostrarEtiquetas: (v: boolean) => void;
}

export const useUI = create<EstadoUI>()((set) => ({
  paso: 1,
  unidadCaudal: 'Ls',
  mostrarEtiquetas: true,
  conexion: null,
  setConexion: (conexion) => set({ conexion }),
  captura: false,
  setCaptura: (captura) => set({ captura }),
  setPaso: (paso) => set({ paso }),
  setUnidadCaudal: (unidadCaudal) => set({ unidadCaudal }),
  setMostrarEtiquetas: (mostrarEtiquetas) => set({ mostrarEtiquetas }),
}));
