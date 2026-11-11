import { areaModulo, areaUnidad, dimsHuella, numModulos, volumenModulo } from '../calc/geometria';
import { m3dALps } from '../calc/unidades';
import type { Analisis } from '../store/analisis';
import { buscarEnCatalogo, useConfig } from '../store/config';
import { PanelTuberia } from './PanelTuberia';
import { useDiseno } from '../store/diseno';
import type { Dimensiones, Forma } from '../types';
import { duplicarSeleccion } from './acciones';
import { CampoNumero } from './CampoNumero';
import { textoRango } from '../calc/validacion';
import { dinero, num, numCalidad, PARAMETROS_CALIDAD } from './formato';

const CAMPOS_DIM: { clave: keyof Dimensiones; nombre: string; formas?: Forma; min: number; entero?: boolean }[] = [
  { clave: 'largo', nombre: 'Largo', formas: 'rectangular', min: 0.1 },
  { clave: 'ancho', nombre: 'Ancho', formas: 'rectangular', min: 0.1 },
  { clave: 'diametro', nombre: 'Diámetro', formas: 'circular', min: 0.1 },
  { clave: 'profundidadUtil', nombre: 'Profundidad útil', min: 0.01 },
  { clave: 'bordoLibre', nombre: 'Bordo libre', min: 0 },
  { clave: 'altura', nombre: 'Altura del equipo', min: 0.1 },
  { clave: 'modulos', nombre: 'Módulos en paralelo', min: 1, entero: true },
];

const NOMBRE_FORMA: Record<Forma, string> = { rectangular: 'Rectangular', circular: 'Circular' };

export function PanelPropiedades({ analisis }: { analisis: Analisis }) {
  const tuberias = useDiseno((s) => s.diseno.tuberias);
  const tuberiaSel = useDiseno((s) => s.tuberiaSel);
  const unidades = useDiseno((s) => s.diseno.unidades);
  const seleccion = useDiseno((s) => s.seleccion);
  const actualizarUnidad = useDiseno((s) => s.actualizarUnidad);
  const rotarUnidad = useDiseno((s) => s.rotarUnidad);
  const borrarUnidad = useDiseno((s) => s.borrarUnidad);
  const catalogo = useConfig((s) => s.catalogo);
  const sepCirc = useConfig((s) => s.general.separacionModulosCirculares_m);

  const u = unidades.find((v) => v.id === seleccion);
  const tubo = tuberias.find((t) => t.id === tuberiaSel);
  const qMed = u ? analisis.caudalMed.unidades[u.id] : undefined;
  const qMax = u ? analisis.caudalMax.unidades[u.id] : undefined;
  const resultado = u ? analisis.validacion.get(u.id) : undefined;
  const calidad = u ? analisis.calidad[u.id] : undefined;
  const costo = u ? analisis.costos.unidades.find((c) => c.id === u.id) : undefined;
  const caudalTexto = (q?: number) => (q === undefined ? '—' : `${num(m3dALps(q))} L/s (${num(q, 0)} m³/d)`);
  const cat = u ? buscarEnCatalogo(catalogo, u.tipo) : undefined;

  return (
    <div className="panel-contenido">
      {tubo ? (
        <PanelTuberia t={tubo} analisis={analisis.tuberias.get(tubo.id)} />
      ) : !u || !cat ? (
        <section>
          <h3>Propiedades</h3>
          <p className="nota">Selecciona una unidad o una tubería para editar sus datos. Para conectar, haz clic en un puerto de salida (cubo) y después en uno de entrada (esfera).</p>
        </section>
      ) : (
        <>
          <section>
            <h3>{cat.nombre}</h3>
            <div className="botones">
              <button onClick={() => rotarUnidad(u.id)} title="Rotar 90° (R)">⟳ Rotar</button>
              <button onClick={duplicarSeleccion} title="Duplicar (Ctrl+D)">⧉ Duplicar</button>
              <button className="peligro" onClick={() => borrarUnidad(u.id)} title="Borrar (Supr)">✕ Borrar</button>
            </div>
            <label className="campo">
              <span className="campo-etiqueta">Etiqueta</span>
              <input
                type="text"
                value={u.etiqueta ?? ''}
                placeholder={cat.nombre}
                onChange={(e) => actualizarUnidad(u.id, { etiqueta: e.target.value }, { clave: `etq:${u.id}` })}
              />
            </label>
            {cat.formas.length > 1 && (
              <label className="campo">
                <span className="campo-etiqueta">Geometría</span>
                <select value={u.forma} onChange={(e) => actualizarUnidad(u.id, { forma: e.target.value as Forma })}>
                  {cat.formas.map((f) => (
                    <option key={f} value={f}>{NOMBRE_FORMA[f]}</option>
                  ))}
                </select>
              </label>
            )}
          </section>

          {resultado && resultado.criterios.length > 0 && (
            <section>
              <h3>
                Criterios de diseño
                <span className={`semaforo-punto semaforo-${resultado.estado}`} title={resultado.estado.replace('_', ' ')} />
              </h3>
              <ul className="criterios">
                {resultado.criterios.map((c) => (
                  <li key={c.indicador} className={`criterio criterio-${c.estado}`}>
                    <span className={`semaforo-punto semaforo-${c.estado}`} />
                    <div>
                      <div className="criterio-nombre">{c.nombre}</div>
                      <div className="criterio-valor">
                        {c.valor === null ? (
                          <em>{c.mensaje.slice(c.nombre.length + 2)}</em>
                        ) : (
                          <>
                            <strong>
                              {num(c.valor, Math.abs(c.valor) >= 100 ? 0 : Math.abs(c.valor) >= 1 ? 2 : 3)}
                              {c.unidad.startsWith(':') ? c.unidad : ` ${c.unidad}`}
                            </strong>
                            <span> · rango {textoRango(c.min, c.max, c.unidad)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3>Dimensiones</h3>
            {CAMPOS_DIM.filter((c) => u.dim[c.clave] !== undefined && (!c.formas || c.formas === u.forma)).map((c) => (
              <CampoNumero
                key={c.clave}
                etiqueta={c.nombre}
                unidad={c.entero ? undefined : 'm'}
                valor={u.dim[c.clave] as number}
                min={c.min}
                max={c.entero ? 20 : 500}
                entero={c.entero}
                alCambiar={(v) => actualizarUnidad(u.id, { dim: { ...u.dim, [c.clave]: v } }, { clave: `dim:${u.id}:${c.clave}` })}
              />
            ))}
            <dl className="calculados">
              {u.dim.profundidadUtil !== undefined && (
                <>
                  <dt>Área superficial por módulo</dt>
                  <dd>{num(areaModulo(u))} m²</dd>
                  <dt>Volumen útil por módulo</dt>
                  <dd>{num(volumenModulo(u))} m³</dd>
                  {numModulos(u) > 1 && (
                    <>
                      <dt>Volumen útil total</dt>
                      <dd>{num(volumenModulo(u) * numModulos(u))} m³</dd>
                    </>
                  )}
                </>
              )}
              <dt>Huella en planta</dt>
              <dd>
                {num(dimsHuella(u, sepCirc).w)} × {num(dimsHuella(u, sepCirc).h)} m ({num(areaUnidad(u))} m²)
              </dd>
            </dl>
          </section>

          {!cat.esFuente && (
            <section>
              <h3>Caudal que llega</h3>
              <dl className="calculados">
                <dt>A Qmed</dt>
                <dd>{caudalTexto(qMed?.entrada)}</dd>
                <dt>A Qmáx</dt>
                <dd>{caudalTexto(qMax?.entrada)}</dd>
                {numModulos(u) > 1 && qMed && (
                  <>
                    <dt>Por módulo a Qmed</dt>
                    <dd>{caudalTexto(qMed.entrada / numModulos(u))}</dd>
                  </>
                )}
                {qMed && qMed.entrada - qMed.fresco > 1e-6 && (
                  <>
                    <dt>De ello, recirculación</dt>
                    <dd>{caudalTexto(qMed.entrada - qMed.fresco)}</dd>
                  </>
                )}
              </dl>
              {qMed && qMed.entrada <= 0 && (
                <p className="nota nota-error">No llega caudal: revisa las conexiones aguas arriba.</p>
              )}
            </section>
          )}

          {calidad?.entrada && calidad.salida && !cat.esFuente && (
            <section>
              <h3>Calidad estimada del agua</h3>
              <table className="tabla-norma">
                <thead>
                  <tr>
                    <th>Parámetro</th>
                    <th>Entra</th>
                    <th>Sale</th>
                  </tr>
                </thead>
                <tbody>
                  {PARAMETROS_CALIDAD.filter((p) => p.clave in calidad.entrada!).map((p) => (
                    <tr key={p.clave}>
                      <td>
                        {p.nombre}
                        <small>{p.unidad}</small>
                      </td>
                      <td>{numCalidad(calidad.entrada![p.clave])}</td>
                      <td>{cat.etapa === 'destino' ? '—' : numCalidad(calidad.salida![p.clave])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="nota">Con eficiencias típicas de remoción; no depende de las dimensiones.</p>
            </section>
          )}

          {cat.parametros.length > 0 && (
            <section>
              <h3>Parámetros</h3>
              {cat.parametros.map((p) =>
                p.tipo === 'opcion' ? (
                  <label className="campo" key={p.id}>
                    <span className="campo-etiqueta">{p.nombre}</span>
                    <select
                      value={String(u.params[p.id] ?? p.defecto)}
                      onChange={(e) => actualizarUnidad(u.id, { params: { ...u.params, [p.id]: e.target.value } })}
                    >
                      {p.opciones?.map((o) => (
                        <option key={o.valor} value={o.valor}>{o.nombre}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <CampoNumero
                    key={p.id}
                    etiqueta={p.nombre}
                    unidad={p.unidad}
                    valor={Number(u.params[p.id] ?? p.defecto)}
                    min={p.min}
                    max={p.max}
                    entero={p.tipo === 'entero'}
                    alCambiar={(v) => actualizarUnidad(u.id, { params: { ...u.params, [p.id]: v } }, { clave: `par:${u.id}:${p.id}` })}
                  />
                ),
              )}
            </section>
          )}
          {costo && costo.total > 0 && (
            <section>
              <h3>Costo estimado de la unidad</h3>
              <dl className="calculados">
                <dt>Excavación</dt>
                <dd>{num(costo.cantidades.excavacion_m3, 0)} m³</dd>
                <dt>Concreto (losa y muros)</dt>
                <dd>{num(costo.cantidades.concreto_m3, 1)} m³</dd>
                <dt>Acero de refuerzo</dt>
                <dd>{num(costo.cantidades.acero_kg / 1000, 1)} t</dd>
                <dt>Obra civil</dt>
                <dd>{dinero(costo.civil)}</dd>
                {costo.equipos.map((e) => (
                  <span key={e.id} style={{ display: 'contents' }}>
                    <dt>
                      {e.nombre} ({num(e.capacidad, 1)} {e.unidadCapacidad})
                    </dt>
                    <dd>{dinero(e.costo)}</dd>
                  </span>
                ))}
                <dt>
                  <strong>Costo directo</strong>
                </dt>
                <dd>
                  <strong>{dinero(costo.total)}</strong>
                </dd>
                {costo.energia_kWh > 0 && (
                  <>
                    <dt>Energía anual</dt>
                    <dd>{num(costo.energia_kWh, 0)} kWh</dd>
                  </>
                )}
              </dl>
              <p className="nota">Orden de magnitud, sin indirectos ni IVA.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
