// ---------- Catálogo ----------
export type Etapa = 'pretratamiento' | 'primario' | 'secundario' | 'terciario' | 'lodos' | 'destino';
export type Forma = 'rectangular' | 'circular';
export type Fluido = 'agua' | 'lodos' | 'recirculacion' | 'aire' | 'rechazo';
export type Lado = 'N' | 'S' | 'E' | 'O';

export interface Dimensiones {
  largo?: number;
  ancho?: number;
  diametro?: number;
  profundidadUtil?: number;
  bordoLibre?: number;
  /** Solo para equipos cerrados (sin tirante de agua). */
  altura?: number;
  modulos?: number;
}

/**
 * Regla de caudal de un puerto (ver calc/grafo.ts):
 *  - fijo_m3d: salida con caudal fijo, tomado de un parámetro en m³/d (purga de lodos).
 *  - fraccion: salida igual a un % del caudal de entrada (o a su complemento).
 *  - demanda: recirculación. En una entrada, `param` es el % del caudal fresco
 *    que la unidad pide; en una salida, entrega lo que pidan sus destinos.
 * Un puerto de salida sin regla recibe el resto del balance.
 */
export type ReglaCaudal =
  | { modo: 'fijo_m3d'; param: string }
  | { modo: 'fraccion'; param: string; complemento?: boolean }
  | { modo: 'demanda'; param?: string };

export interface PuertoCatalogo {
  id: string;
  nombre: string;
  tipo: 'entrada' | 'salida';
  fluido: Fluido;
  lado: Lado;
  /** Posición a lo largo del lado, de 0 a 1 (por defecto 0.5). */
  pos?: number;
  obligatorio: boolean;
  caudal?: ReglaCaudal;
}

export interface ParametroCatalogo {
  id: string;
  nombre: string;
  unidad?: string;
  tipo: 'numero' | 'entero' | 'opcion';
  defecto: number | string;
  min?: number;
  max?: number;
  opciones?: { valor: string; nombre: string }[];
}

export interface UnidadCatalogo {
  id: string;
  nombre: string;
  etapa: Etapa;
  formas: Forma[];
  dimensionesDefecto: Dimensiones;
  puertos: PuertoCatalogo[];
  parametros: ParametroCatalogo[];
  generaLodos: boolean;
  /** El influente del proyecto: debe existir exactamente uno. */
  esFuente?: boolean;
  equipos: string[];
  /** Estilo de dibujo en la escena. */
  visual: string;
  color: string;
}

export interface Catalogo {
  version: number;
  etapas: { id: Etapa; nombre: string }[];
  unidades: UnidadCatalogo[];
}

export interface ConfigGeneral {
  toleranciaAmarillo: number;
  separacionMinima_m: number;
  separacionModulosCirculares_m: number;
}

// ---------- Diseño ----------
export type Rotacion = 0 | 90 | 180 | 270;

export interface CalidadInfluente {
  DBO5: number;
  DQO: number;
  SST: number;
  NT: number;
  PT: number;
  GyA: number;
  CF: number;
  HH: number;
  T: number;
}

export interface DatosProyecto {
  Qmed_Ls: number;
  Qmax_Ls: number;
  Qmin_Ls: number;
  poblacion: number;
  influente: CalidadInfluente;
  terreno: { largo: number; ancho: number };
  separacionMinima_m: number;
}

export interface UnidadInstancia {
  id: string;
  tipo: string;
  etiqueta?: string;
  /** Centro de la huella, en metros. */
  x: number;
  y: number;
  rot: Rotacion;
  forma: Forma;
  dim: Dimensiones;
  params: Record<string, number | string>;
}

export type Regimen = 'presion' | 'gravedad';

export interface Extremo {
  unidad: string;
  puerto: string;
}

export interface Tuberia {
  id: string;
  desde: Extremo;
  hasta: Extremo;
  fluido: Fluido;
  dn_mm: number;
  material: string;
  regimen: Regimen;
  /** Puntos intermedios definidos por el usuario, [x, y] en metros. */
  puntos: [number, number][];
}

export interface Diseno {
  version: number;
  alumno: string;
  proyecto: string;
  datos: DatosProyecto;
  unidades: UnidadInstancia[];
  tuberias: Tuberia[];
}

// ---------- Configuración de tuberías ----------
export interface ConfigTuberias {
  fluidos: Record<Fluido, { nombre: string; color: string; evaluarVelocidad: boolean; nota?: string }>;
  compatibilidad: Record<Fluido, Fluido[]>;
  materiales: { id: string; nombre: string }[];
  diametros_mm: number[];
  dnDefecto_mm: number;
  materialDefecto: string;
  regimenDefecto: Regimen;
  regimenes: {
    presion: { nombre: string; vMin: number; vMax: number };
    gravedad: { nombre: string; vMin: number; vMinRecomendada: number; vMax: number | null };
  };
  longitudAcometida_m: number;
}

// ---------- Rangos de diseño y reglas del tren ----------
export interface Criterio {
  indicador: string;
  nombre: string;
  unidad: string;
  min?: number | null;
  max?: number | null;
  /** El máximo se toma de un parámetro de la unidad (dato del fabricante). */
  maxParam?: string;
  /** Fuera de rango es rojo aunque sea por poco (requisitos enteros). */
  estricto?: boolean;
}

export type RangosUnidad =
  | { criterios: Criterio[] }
  | { variantePor: string; variantes: Record<string, Criterio[]> };

export interface FiltroUnidades {
  unidad?: string[];
  etapa?: Etapa[];
}

export interface ReglaTren {
  id: string;
  tipo: 'requiereAguasArriba' | 'requiereAguasAbajo';
  si: FiltroUnidades;
  requiere: FiltroUnidades;
  mensaje: string;
  severidad?: 'rojo' | 'amarillo';
}

export interface ReglasTren {
  ordenEtapas: Etapa[];
  reglas: ReglaTren[];
}

// ---------- Eficiencias ----------
export type Remocion = { remocion?: number; log?: number };
/** Además de las remociones, cada unidad lleva 'verificado' y, opcionalmente, 'fuente'. */
export interface Eficiencias {
  parametros: string[];
  unidades: Record<string, Record<string, Remocion | boolean | string>>;
}

// ---------- Normas ----------
export interface LimiteNorma {
  parametro: string;
  nombreNorma: string;
  unidad: string;
  /** false = la norma marca "No aplica" para esta categoría. */
  aplica: boolean;
  pm: number | null;
  pd: number | null;
  vi: number | null;
  verificado: boolean;
  /** cota_superior: el valor estimado es una cota superior del parámetro normado. */
  comparacion?: 'cota_superior';
  nota?: string;
}

export interface Norma {
  titulo: string;
  publicacionDOF: string;
  tabla: string;
  fuente: string;
  metodoTranscripcion: string;
  noEvaluados: string[];
  categorias: Record<string, { nombre: string; limites: LimiteNorma[] }>;
}

export interface ConfigNormas {
  nota: string;
  normas: Record<string, Norma>;
  /** Por tipo de unidad de destino: norma y categoría (fija o según un parámetro de la unidad). */
  destinos: Record<string, { norma: string; categoria?: string; categoriaParam?: string }>;
}

// ---------- Precios ----------
export interface PrecioUnitario {
  precio: number;
  unidad: string;
  fuente: string;
  verificado: boolean;
}

export interface PrecioEquipo {
  nombre: string;
  /** Variable de capacidad (ver calc/costos.ts). */
  variable: string;
  unidadVariable: string;
  /** MXN por cada equipo o módulo. */
  fijo: number;
  /** MXN por unidad de capacidad. */
  unitario: number;
}

export interface ConfigPrecios {
  moneda: string;
  anioBase: number;
  factorActualizacion: number;
  leyenda: string;
  nota: string;
  obraCivil: {
    excavacion_m3: PrecioUnitario;
    concreto_m3: PrecioUnitario;
    acero_kg: PrecioUnitario;
    espesorLosa_m: number;
    espesorMuro_m: number;
    cuantiaAcero_kg_m3: number;
    sobreexcavacion_m: number;
    fraccionEnterrada: number;
    fraccionEnterradaPorUnidad: Record<string, number>;
  };
  equipos: Record<string, PrecioEquipo>;
  fuenteEquipos: string;
  tuberias: Record<string, { precioDN100_m: number; exponente: number }>;
  fuenteTuberias: string;
  porcentajes: { indirectos: number; ingenieria: number; iva: number };
  operacion: {
    tarifa_kWh: PrecioUnitario;
    cloro_kg: PrecioUnitario;
    factorUsoEnergia: number;
    diasOperacion: number;
    vidaUtil_anios: number;
  };
  rango: { bajo: number; alto: number };
}
