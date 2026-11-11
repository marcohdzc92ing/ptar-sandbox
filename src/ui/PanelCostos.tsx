import type { Analisis } from '../store/analisis';
import { useConfig } from '../store/config';
import { dinero, num } from './formato';

export function PanelCostos({ analisis }: { analisis: Analisis }) {
  const precios = useConfig((s) => s.precios);
  const catalogo = useConfig((s) => s.catalogo);
  const c = analisis.costos;
  const pct = (v: number) => `${num(v * 100, 0)} %`;
  const nombreEtapa = (id: string) => catalogo.etapas.find((e) => e.id === id)?.nombre ?? id;

  return (
    <div className="panel-contenido">
      <section>
        <h3>Inversión estimada</h3>
        <div className="costo-total">
          <span>{dinero(c.rango.bajo, true)}</span>
          <span className="costo-a">a</span>
          <span>{dinero(c.rango.alto, true)}</span>
        </div>
        <p className="costo-leyenda">{precios.leyenda}</p>
        <p className="nota">
          Valor central {dinero(c.total)} con IVA; rango de {pct(precios.rango.bajo)} a +{pct(precios.rango.alto)}. Precios base{' '}
          {precios.anioBase}
          {precios.factorActualizacion !== 1 && `, actualizados por ${num(precios.factorActualizacion)}`}.
        </p>
      </section>

      <section>
        <h3>Desglose por etapa</h3>
        <table className="tabla-norma">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Obra civil</th>
              <th>Equipo</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {c.porEtapa.map((e) => (
              <tr key={e.etapa}>
                <td>{nombreEtapa(e.etapa)}</td>
                <td>{dinero(e.civil, true)}</td>
                <td>{dinero(e.equipo, true)}</td>
                <td>{dinero(e.total, true)}</td>
              </tr>
            ))}
            <tr>
              <td>
                Tuberías
                <small>{num(c.tuberias.longitud_m, 0)} m</small>
              </td>
              <td />
              <td />
              <td>{dinero(c.tuberias.costo, true)}</td>
            </tr>
          </tbody>
        </table>
        <dl className="calculados">
          <dt>Costo directo</dt>
          <dd>{dinero(c.directo)}</dd>
          <dt>Indirectos ({pct(precios.porcentajes.indirectos)})</dt>
          <dd>{dinero(c.indirectos)}</dd>
          <dt>Ingeniería ({pct(precios.porcentajes.ingenieria)})</dt>
          <dd>{dinero(c.ingenieria)}</dd>
          <dt>Subtotal</dt>
          <dd>{dinero(c.subtotal)}</dd>
          <dt>IVA ({pct(precios.porcentajes.iva)})</dt>
          <dd>{dinero(c.iva)}</dd>
          <dt>
            <strong>Total (valor central)</strong>
          </dt>
          <dd>
            <strong>{dinero(c.total)}</strong>
          </dd>
        </dl>
      </section>

      <section>
        <h3>Operación anual</h3>
        <dl className="calculados">
          <dt>Energía ({num(c.operacion.energia_kWh, 0)} kWh)</dt>
          <dd>{dinero(c.operacion.energia)}</dd>
          <dt>Químicos ({num(c.operacion.cloro_kg, 0)} kg de cloro)</dt>
          <dd>{dinero(c.operacion.quimicos)}</dd>
          <dt>
            <strong>Total anual</strong>
          </dt>
          <dd>
            <strong>{dinero(c.operacion.total)}</strong>
          </dd>
        </dl>
        <p className="nota">
          Energía: potencia en operación × {pct(precios.operacion.factorUsoEnergia)} de uso × tarifa de{' '}
          {num(precios.operacion.tarifa_kWh.precio)} MXN/kWh. No incluye personal, mantenimiento ni disposición de lodos.
        </p>
      </section>

      <section>
        <h3>Costo por m³ tratado</h3>
        <dl className="calculados">
          <dt>Solo operación</dt>
          <dd>{c.porM3.operacion === null ? '—' : `${dinero(c.porM3.operacion, false, 2)}/m³`}</dd>
          <dt>Operación + inversión</dt>
          <dd>{c.porM3.total === null ? '—' : `${dinero(c.porM3.total, false, 2)}/m³`}</dd>
        </dl>
        <p className="nota">
          Sobre {num(c.volumenAnual_m3, 0)} m³ al año (Qmed). La inversión se reparte en {precios.operacion.vidaUtil_anios} años, sin
          intereses.
        </p>
      </section>

      <section>
        <p className="nota">
          Todos los precios están sin verificar. Solo concreto y acero tienen una referencia pública; el resto son estimaciones
          iniciales. Selecciona una unidad para ver sus cantidades de obra y su equipo.
        </p>
      </section>
    </div>
  );
}
