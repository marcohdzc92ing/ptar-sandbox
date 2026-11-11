import type { ProblemaDisposicion } from '../calc/geometria';
import type { Analisis } from '../store/analisis';
import { buscarEnCatalogo, useConfig } from '../store/config';
import { useDiseno } from '../store/diseno';
import { nombreUnidad, num } from './formato';

function textoProblema(p: ProblemaDisposicion, nombre: (id: string) => string): string {
  const [a, b] = p.unidades;
  if (p.tipo === 'fuera') return `${nombre(a)} está fuera del terreno.`;
  if (p.tipo === 'traslape') return `${nombre(a)} se traslapa con ${nombre(b)}.`;
  return `${nombre(a)} y ${nombre(b)} están a ${num(p.distancia ?? 0)} m (menos que la separación mínima).`;
}

function Titulo({ texto, n }: { texto: string; n: number }) {
  return (
    <h3>
      {texto}
      <span className={`contador ${n ? 'contador-mal' : 'contador-bien'}`}>{n}</span>
    </h3>
  );
}

/** Cuenta total de alertas activas (para la pestaña y la barra de estado). */
export function contarAlertas(a: Analisis) {
  let diseno = 0;
  for (const r of a.validacion.values()) diseno += r.criterios.filter((c) => c.estado !== 'verde').length;
  let tuberias = a.caudalMed.avisos.length;
  for (const t of a.tuberias.values()) if (t.estado === 'amarillo' || t.estado === 'rojo') tuberias += 1;
  const tren = a.alertasTren.length;
  const disposicion = a.problemas.length;
  return { diseno, tuberias, tren, disposicion, total: diseno + tuberias + tren + disposicion };
}

export function PanelAlertas({ analisis, alSeleccionar }: { analisis: Analisis; alSeleccionar: () => void }) {
  const unidades = useDiseno((s) => s.diseno.unidades);
  const tuberias = useDiseno((s) => s.diseno.tuberias);
  const catalogo = useConfig((s) => s.catalogo);
  const { seleccionar, seleccionarTuberia } = useDiseno.getState();
  const cuenta = contarAlertas(analisis);

  const nombre = (id: string) => {
    const v = unidades.find((x) => x.id === id);
    return v ? nombreUnidad(v, buscarEnCatalogo(catalogo, v.tipo)) : id;
  };
  const irUnidad = (id?: string) => {
    if (!id) return;
    seleccionar(id);
    alSeleccionar();
  };
  const irTuberia = (id: string) => {
    seleccionarTuberia(id);
    alSeleccionar();
  };

  const fallasDiseno = unidades.flatMap((u) =>
    (analisis.validacion.get(u.id)?.criterios ?? []).filter((c) => c.estado !== 'verde').map((c) => ({ u, c })),
  );
  const alertasTuberia = tuberias
    .map((t) => ({ t, a: analisis.tuberias.get(t.id) }))
    .filter((x) => x.a && (x.a.estado === 'amarillo' || x.a.estado === 'rojo'));

  return (
    <div className="panel-contenido">
      <section>
        <Titulo texto="Tren de tratamiento" n={cuenta.tren} />
        {cuenta.tren === 0 ? (
          <p className="nota nota-bien">Orden lógico, conexiones y línea de lodos sin observaciones.</p>
        ) : (
          <ul className="alertas">
            {analisis.alertasTren.map((a, i) => (
              <li key={i} className={a.severidad === 'rojo' ? 'error' : 'aviso'} onClick={() => irUnidad(a.unidades[0])}>
                {a.mensaje}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Titulo texto="Criterios de diseño" n={cuenta.diseno} />
        {cuenta.diseno === 0 ? (
          <p className="nota nota-bien">Todas las unidades cumplen sus criterios de diseño.</p>
        ) : (
          <ul className="alertas">
            {fallasDiseno.map(({ u, c }) => (
              <li
                key={`${u.id}:${c.indicador}`}
                className={c.estado === 'rojo' ? 'error' : c.estado === 'amarillo' ? 'aviso' : 'neutro'}
                onClick={() => irUnidad(u.id)}
              >
                <strong>{nombre(u.id)}.</strong> {c.mensaje}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Titulo texto="Tuberías y caudal" n={cuenta.tuberias} />
        {!analisis.caudalMed.convergio && (
          <p className="nota nota-error">El balance de caudal no converge: hay un ciclo de retorno sin salida.</p>
        )}
        {cuenta.tuberias === 0 ? (
          <p className="nota nota-bien">
            {tuberias.length ? 'Todas las tuberías evaluadas están en rango de velocidad.' : 'Aún no hay tuberías.'}
          </p>
        ) : (
          <ul className="alertas">
            {analisis.caudalMed.avisos.map((a, i) => (
              <li key={`c${i}`} className="error" onClick={() => irUnidad(a.unidad)}>
                {nombre(a.unidad)}: {a.mensaje}
              </li>
            ))}
            {alertasTuberia.map(({ t, a }) => (
              <li key={t.id} className={a!.estado === 'rojo' ? 'error' : 'aviso'} onClick={() => irTuberia(t.id)}>
                {nombre(t.desde.unidad)} → {nombre(t.hasta.unidad)}: {a!.mensajes.join(' ')}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Titulo texto="Disposición en el terreno" n={cuenta.disposicion} />
        {cuenta.disposicion === 0 ? (
          <p className="nota nota-bien">Sin traslapes; todas las unidades están dentro del terreno y respetan la separación mínima.</p>
        ) : (
          <ul className="alertas">
            {analisis.problemas.map((p, i) => (
              <li key={i} className={p.tipo === 'separacion' ? 'aviso' : 'error'} onClick={() => irUnidad(p.unidades[0])}>
                {textoProblema(p, nombre)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
