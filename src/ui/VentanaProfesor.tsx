import { useEffect, useRef, useState } from 'react';
import { leerConfig, serializarConfig, type ConfigEditable } from '../calc/archivo';
import { abrirJson, descargarTexto } from '../io/archivos';
import { CONFIG_FABRICA, configEditable, useConfig } from '../store/config';
import type { Criterio, Remocion } from '../types';
import { PARAMETROS_CALIDAD } from './formato';

/** Celda numérica compacta. Con `vacio`, dejarla en blanco equivale a "sin valor". */
function Num({ valor, alCambiar, vacio }: { valor: number | null | undefined; alCambiar: (v: number | null) => void; vacio?: boolean }) {
  const aTexto = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(Math.round(v * 1e6) / 1e6));
  const [texto, setTexto] = useState(aTexto(valor));
  const enfocado = useRef(false);
  useEffect(() => {
    if (!enfocado.current) setTexto(aTexto(valor));
  }, [valor]);
  return (
    <input
      type="number"
      step="any"
      className="celda-num"
      value={texto}
      placeholder={vacio ? '—' : ''}
      onFocus={() => (enfocado.current = true)}
      onBlur={() => {
        enfocado.current = false;
        setTexto(aTexto(valor));
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        if (e.target.value.trim() === '') {
          if (vacio) alCambiar(null);
          return;
        }
        const n = Number(e.target.value);
        if (Number.isFinite(n)) alCambiar(n);
      }}
    />
  );
}

type Pestana = 'rangos' | 'eficiencias' | 'precios' | 'general';
type Ruta = (string | number)[];

function leer(obj: unknown, ruta: Ruta): number {
  let v = obj as Record<string | number, unknown>;
  for (const k of ruta) v = v?.[k] as Record<string | number, unknown>;
  return v as unknown as number;
}

export function VentanaProfesor({ alCerrar }: { alCerrar: () => void }) {
  const cfg = useConfig();
  const { editar, restaurar, aplicarConfig } = cfg;
  const [pestana, setPestana] = useState<Pestana>('rangos');
  const [mensaje, setMensaje] = useState('');
  const unidadesConRango = cfg.catalogo.unidades.filter((u) => cfg.rangos[u.id]);
  const unidadesProceso = cfg.catalogo.unidades.filter((u) => u.etapa !== 'destino' && !u.esFuente && u.id !== 'sopladores');
  const [tipoRango, setTipoRango] = useState(unidadesConRango[0]?.id ?? '');
  const [tipoEfic, setTipoEfic] = useState('sedimentador_primario');

  const exportar = () => descargarTexto('config-profesor.json', serializarConfig(configEditable(cfg)));
  const importar = async () => {
    try {
      const json = await abrirJson();
      if (!json) return;
      aplicarConfig(leerConfig(json, CONFIG_FABRICA), 'local');
      setMensaje('Configuración importada.');
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo importar el archivo.');
    }
  };

  /** Renglón "etiqueta + número" que edita una ruta de una sección; `factor` convierte a porcentaje. */
  const fila = (seccion: keyof ConfigEditable, etiqueta: string, ruta: Ruta, unidad = '', factor = 1) => (
    <tr key={`${seccion}:${ruta.join('.')}`}>
      <td>{etiqueta}</td>
      <td>
        <Num valor={leer(cfg[seccion], ruta) * factor} alCambiar={(v) => v !== null && editar(seccion, ruta, v / factor)} />
      </td>
      <td className="tenue">{unidad}</td>
    </tr>
  );

  const rango = cfg.rangos[tipoRango];
  const grupos: { titulo: string | null; ruta: Ruta; lista: Criterio[] }[] = !rango
    ? []
    : 'criterios' in rango
      ? [{ titulo: null, ruta: [tipoRango, 'criterios'], lista: rango.criterios }]
      : Object.entries(rango.variantes).map(([k, lista]) => ({ titulo: k.replace('_', ' '), ruta: [tipoRango, 'variantes', k], lista }));

  const efic = (cfg.eficiencias.unidades[tipoEfic] ?? {}) as Record<string, Remocion | boolean | string>;

  return (
    <div className="modal-fondo" onClick={alCerrar}>
      <div className="modal" role="dialog" aria-label="Modo profesor" onClick={(e) => e.stopPropagation()}>
        <header className="modal-cabecera">
          <h2>Modo profesor</h2>
          <div className="barra-grupo">
            <button onClick={exportar} title="Descarga config-profesor.json">Exportar</button>
            <button onClick={importar}>Importar</button>
            <button
              className="peligro"
              disabled={cfg.origen === 'fabrica'}
              onClick={() => window.confirm('¿Descartar todos los cambios y volver a los valores de fábrica?') && restaurar()}
            >
              Restaurar
            </button>
            <button onClick={alCerrar}>Cerrar</button>
          </div>
        </header>
        <nav className="pestanas">
          {(['rangos', 'eficiencias', 'precios', 'general'] as Pestana[]).map((p) => (
            <button key={p} className={pestana === p ? 'activo' : ''} onClick={() => setPestana(p)}>
              {{ rangos: 'Rangos de diseño', eficiencias: 'Eficiencias', precios: 'Precios', general: 'General' }[p]}
            </button>
          ))}
        </nav>
        <div className="modal-cuerpo">
          <p className="nota">
            {cfg.origen === 'fabrica' && 'Se están usando los valores de fábrica.'}
            {cfg.origen === 'sitio' && 'Se está usando el archivo config-profesor.json publicado con el sitio.'}
            {cfg.origen === 'local' && 'Hay cambios guardados solo en este navegador. Para que lleguen a los alumnos, exporta el archivo y publícalo con el sitio (ver README).'}{' '}
            {mensaje}
          </p>

          {pestana === 'rangos' && (
            <>
              <label className="campo">
                <span className="campo-etiqueta">Unidad</span>
                <select value={tipoRango} onChange={(e) => setTipoRango(e.target.value)}>
                  {unidadesConRango.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </label>
              {grupos.map((g) => (
                <table className="tabla-resumen" key={g.ruta.join('.')}>
                  <thead>
                    <tr>
                      <th>{g.titulo ? `Criterio (${g.titulo})` : 'Criterio'}</th>
                      <th>Mínimo</th>
                      <th>Máximo</th>
                      <th>Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lista.map((c, i) => (
                      <tr key={c.indicador}>
                        <td>{c.nombre}</td>
                        <td>
                          <Num vacio valor={c.min} alCambiar={(v) => editar('rangos', [...g.ruta, i, 'min'], v)} />
                        </td>
                        <td>
                          {c.maxParam ? (
                            <span className="tenue">dato del fabricante</span>
                          ) : (
                            <Num vacio valor={c.max} alCambiar={(v) => editar('rangos', [...g.ruta, i, 'max'], v)} />
                          )}
                        </td>
                        <td className="tenue">{c.unidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
              <p className="nota">Deja un límite en blanco para que no se evalúe.</p>
            </>
          )}

          {pestana === 'eficiencias' && (
            <>
              <label className="campo">
                <span className="campo-etiqueta">Unidad</span>
                <select value={tipoEfic} onChange={(e) => setTipoEfic(e.target.value)}>
                  {unidadesProceso.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </label>
              <table className="tabla-resumen">
                <thead>
                  <tr>
                    <th>Parámetro</th>
                    <th>Remoción</th>
                    <th>Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {PARAMETROS_CALIDAD.filter((p) => cfg.eficiencias.parametros.includes(p.clave)).map((p) => {
                    const e = efic[p.clave];
                    const actual = typeof e === 'object' ? e : undefined;
                    const esLog = actual ? actual.log !== undefined : p.clave === 'CF' || p.clave === 'HH';
                    const valor = !actual ? null : esLog ? (actual.log ?? null) : (actual.remocion ?? 0) * 100;
                    return (
                      <tr key={p.clave}>
                        <td>{p.nombre}</td>
                        <td>
                          <Num
                            vacio
                            valor={valor}
                            alCambiar={(v) =>
                              editar('eficiencias', ['unidades', tipoEfic, p.clave], v === null ? undefined : esLog ? { log: v } : { remocion: v / 100 })
                            }
                          />
                        </td>
                        <td className="tenue">{esLog ? 'log' : '%'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="nota">En blanco = la unidad no remueve ese parámetro. {typeof efic.fuente === 'string' ? efic.fuente : ''}</p>
            </>
          )}

          {pestana === 'precios' && (
            <>
              <table className="tabla-resumen">
                <thead><tr><th>General</th><th /><th /></tr></thead>
                <tbody>
                  {fila('precios', 'Año base de los precios', ['anioBase'])}
                  {fila('precios', 'Factor de actualización', ['factorActualizacion'], '× todos los precios')}
                </tbody>
                <thead><tr><th>Obra civil</th><th /><th /></tr></thead>
                <tbody>
                  {fila('precios', 'Excavación', ['obraCivil', 'excavacion_m3', 'precio'], 'MXN/m³')}
                  {fila('precios', 'Concreto colocado', ['obraCivil', 'concreto_m3', 'precio'], 'MXN/m³')}
                  {fila('precios', 'Acero habilitado y colocado', ['obraCivil', 'acero_kg', 'precio'], 'MXN/kg')}
                  {fila('precios', 'Espesor de losa', ['obraCivil', 'espesorLosa_m'], 'm')}
                  {fila('precios', 'Espesor de muros', ['obraCivil', 'espesorMuro_m'], 'm')}
                  {fila('precios', 'Cuantía de acero', ['obraCivil', 'cuantiaAcero_kg_m3'], 'kg/m³ de concreto')}
                  {fila('precios', 'Sobreexcavación por lado', ['obraCivil', 'sobreexcavacion_m'], 'm')}
                  {fila('precios', 'Fracción enterrada de los tanques', ['obraCivil', 'fraccionEnterrada'], '%', 100)}
                </tbody>
                <thead><tr><th>Porcentajes</th><th /><th /></tr></thead>
                <tbody>
                  {fila('precios', 'Indirectos', ['porcentajes', 'indirectos'], '% del directo', 100)}
                  {fila('precios', 'Ingeniería', ['porcentajes', 'ingenieria'], '% del directo', 100)}
                  {fila('precios', 'IVA', ['porcentajes', 'iva'], '%', 100)}
                  {fila('precios', 'Rango: límite inferior', ['rango', 'bajo'], '%', 100)}
                  {fila('precios', 'Rango: límite superior', ['rango', 'alto'], '%', 100)}
                </tbody>
                <thead><tr><th>Operación</th><th /><th /></tr></thead>
                <tbody>
                  {fila('precios', 'Tarifa eléctrica', ['operacion', 'tarifa_kWh', 'precio'], 'MXN/kWh')}
                  {fila('precios', 'Cloro activo', ['operacion', 'cloro_kg', 'precio'], 'MXN/kg')}
                  {fila('precios', 'Factor de uso de la potencia', ['operacion', 'factorUsoEnergia'], '%', 100)}
                  {fila('precios', 'Vida útil para el costo por m³', ['operacion', 'vidaUtil_anios'], 'años')}
                </tbody>
              </table>

              <table className="tabla-resumen">
                <thead>
                  <tr>
                    <th>Equipo</th>
                    <th>Fijo (MXN)</th>
                    <th>Unitario (MXN)</th>
                    <th>por</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(cfg.precios.equipos).map(([id, e]) => (
                    <tr key={id}>
                      <td>{e.nombre}</td>
                      <td><Num valor={e.fijo} alCambiar={(v) => v !== null && editar('precios', ['equipos', id, 'fijo'], v)} /></td>
                      <td><Num valor={e.unitario} alCambiar={(v) => v !== null && editar('precios', ['equipos', id, 'unitario'], v)} /></td>
                      <td className="tenue">{e.unidadVariable}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="tabla-resumen">
                <thead>
                  <tr>
                    <th>Tubería instalada</th>
                    <th>MXN/m en DN 100</th>
                    <th>Exponente del diámetro</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(cfg.precios.tuberias).map(([id, t]) => (
                    <tr key={id}>
                      <td>{id}</td>
                      <td><Num valor={t.precioDN100_m} alCambiar={(v) => v !== null && editar('precios', ['tuberias', id, 'precioDN100_m'], v)} /></td>
                      <td><Num valor={t.exponente} alCambiar={(v) => v !== null && editar('precios', ['tuberias', id, 'exponente'], v)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {pestana === 'general' && (
            <table className="tabla-resumen">
              <thead><tr><th>Parámetro</th><th /><th /></tr></thead>
              <tbody>
                {fila('general', 'Tolerancia del semáforo amarillo', ['toleranciaAmarillo'], '% fuera del límite', 100)}
                {fila('general', 'Separación entre módulos circulares', ['separacionModulosCirculares_m'], 'm')}
                {fila('general', 'Separación mínima sugerida', ['separacionMinima_m'], 'm (cada proyecto fija la suya)')}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
