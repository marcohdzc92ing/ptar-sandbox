import { aguasArriba, compararConNorma, type EstadoFila } from '../calc/normas';
import type { Analisis } from '../store/analisis';
import { buscarEnCatalogo, useConfig } from '../store/config';
import { useDiseno } from '../store/diseno';
import { nombreUnidad, numCalidad } from './formato';

const ESTADO: Record<EstadoFila, { texto: string; clase: string }> = {
  cumple: { texto: 'Cumple', clase: 'bien' },
  no_cumple: { texto: 'No cumple', clase: 'error' },
  no_aplica: { texto: 'No aplica', clase: 'neutro' },
  sin_limite: { texto: 'Sin límite', clase: 'neutro' },
  no_concluyente: { texto: 'No concluyente', clase: 'aviso' },
  sin_dato: { texto: 'Sin dato', clase: 'neutro' },
};

export function PanelNorma({ analisis }: { analisis: Analisis }) {
  const unidades = useDiseno((s) => s.diseno.unidades);
  const tuberias = useDiseno((s) => s.diseno.tuberias);
  const seleccionar = useDiseno((s) => s.seleccionar);
  const catalogo = useConfig((s) => s.catalogo);
  const normas = useConfig((s) => s.normas);

  const destinos = unidades.flatMap((u) => {
    const cat = buscarEnCatalogo(catalogo, u.tipo);
    if (!cat || cat.etapa !== 'destino') return [];
    const defecto = (id: string) => {
      const p = cat.parametros.find((x) => x.id === id);
      return p ? String(p.defecto) : undefined;
    };
    const r = compararConNorma(u, analisis.calidad[u.id]?.entrada ?? null, normas, defecto);
    return r ? [{ u, cat, r }] : [];
  });

  if (destinos.length === 0) {
    return (
      <div className="panel-contenido">
        <section>
          <h3>Cumplimiento de norma</h3>
          <p className="nota">Agrega un destino final (catálogo → Destino final) y conéctalo para comparar el efluente contra su norma.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="panel-contenido">
      {destinos.map(({ u, cat, r }) => {
        const arriba = aguasArriba(u.id, tuberias);
        const enRojo = unidades.filter((v) => arriba.has(v.id) && analisis.validacion.get(v.id)?.estado === 'rojo');
        const notas = r.filas.filter((f) => f.nota && f.estado !== 'no_aplica');
        return (
          <section key={u.id}>
            <h3>
              <span className="enlace" onClick={() => seleccionar(u.id)}>{nombreUnidad(u, cat)}</span>
              <span className={`contador ${r.cumple === true ? 'contador-bien' : r.cumple === false ? 'contador-mal' : 'contador-neutro'}`}>
                {r.cumple === true ? 'Cumple' : r.cumple === false ? 'No cumple' : 'Sin concluir'}
              </span>
            </h3>
            <p className="nota">
              <strong>{r.normaId}</strong> · {r.nombreCategoria}
              <br />
              {r.norma.tabla}. DOF {r.norma.publicacionDOF.split('-').reverse().join('/')}.
            </p>

            {enRojo.length > 0 && (
              <p className="semaforo semaforo-aviso">
                Estimación no confiable: {enRojo.map((v) => nombreUnidad(v, buscarEnCatalogo(catalogo, v.tipo))).join(', ')}{' '}
                {enRojo.length === 1 ? 'no cumple' : 'no cumplen'} sus criterios de diseño, así que no se puede esperar la remoción típica.
              </p>
            )}

            <table className="tabla-norma">
              <thead>
                <tr>
                  <th>Parámetro</th>
                  <th>Estimado</th>
                  <th>Límite</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.filas.map((f) => (
                  <tr key={f.parametro} className={`fila-${ESTADO[f.estado].clase}`}>
                    <td>
                      {f.nombre}
                      <small>{f.unidad}</small>
                    </td>
                    <td>{f.estimado === null ? '—' : numCalidad(f.estimado)}</td>
                    <td>
                      {f.limite === null ? '—' : numCalidad(f.limite)}
                      {f.tipoLimite && <small>{f.tipoLimite}</small>}
                    </td>
                    <td>
                      <span className={`etiqueta-estado estado-${ESTADO[f.estado].clase}`}>{ESTADO[f.estado].texto}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {notas.length > 0 && (
              <ul className="notas-norma">
                {notas.map((f) => (
                  <li key={f.parametro}>
                    <strong>{f.nombre}:</strong> {f.nota}
                  </li>
                ))}
              </ul>
            )}
            <p className="nota">
              No se evalúan: {r.norma.noEvaluados.join('; ')}.
            </p>
            <p className="nota">
              Valores estimados a caudal medio con eficiencias típicas; se comparan contra el promedio mensual (P.M.) cuando existe.
              Los límites están transcritos del DOF y pendientes de verificación por el profesor.
            </p>
          </section>
        );
      })}
    </div>
  );
}
