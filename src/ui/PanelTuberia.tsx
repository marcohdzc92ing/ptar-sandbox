import { m3dALps } from '../calc/unidades';
import type { AnalisisTuberia } from '../store/analisis';
import { buscarEnCatalogo, useConfig } from '../store/config';
import { useDiseno } from '../store/diseno';
import type { Extremo, Regimen, Tuberia } from '../types';
import { nombreUnidad, num } from './formato';

const ESTADO: Record<string, { clase: string; texto: string }> = {
  verde: { clase: 'bien', texto: 'Velocidad en rango' },
  amarillo: { clase: 'aviso', texto: 'Velocidad cerca del límite' },
  rojo: { clase: 'error', texto: 'Velocidad fuera de rango' },
  sin_evaluar: { clase: 'neutro', texto: 'Velocidad no evaluada' },
};

function caudal(q: number | null): string {
  return q === null ? 'no se calcula' : `${num(m3dALps(q))} L/s (${num(q, 0)} m³/d)`;
}

export function PanelTuberia({ t, analisis }: { t: Tuberia; analisis?: AnalisisTuberia }) {
  const unidades = useDiseno((s) => s.diseno.unidades);
  const actualizarTuberia = useDiseno((s) => s.actualizarTuberia);
  const borrarTuberia = useDiseno((s) => s.borrarTuberia);
  const catalogo = useConfig((s) => s.catalogo);
  const cfg = useConfig((s) => s.tuberias);

  const extremo = (e: Extremo) => {
    const u = unidades.find((v) => v.id === e.unidad);
    const cat = u && buscarEnCatalogo(catalogo, u.tipo);
    const p = cat?.puertos.find((q) => q.id === e.puerto);
    return u ? `${nombreUnidad(u, cat)} · ${p?.nombre ?? e.puerto}` : '—';
  };
  const fluido = cfg.fluidos[t.fluido];
  const estado = ESTADO[analisis?.estado ?? 'sin_evaluar'];
  const regimen = cfg.regimenes[t.regimen];

  return (
    <>
      <section>
        <h3>
          Tubería
          <span className="chip" style={{ background: fluido.color }}>{fluido.nombre}</span>
        </h3>
        <div className="botones">
          <button onClick={() => actualizarTuberia(t.id, { puntos: [] })} disabled={t.puntos.length === 0} title="Quitar los puntos intermedios">
            ↺ Restablecer trazo
          </button>
          <button className="peligro" onClick={() => borrarTuberia(t.id)} title="Borrar (Supr)">✕ Borrar</button>
        </div>
        <dl className="calculados calculados-izq">
          <dt>Desde</dt>
          <dd>{extremo(t.desde)}</dd>
          <dt>Hasta</dt>
          <dd>{extremo(t.hasta)}</dd>
        </dl>
      </section>

      <section>
        <h3>Características</h3>
        <label className="campo">
          <span className="campo-etiqueta">Diámetro nominal</span>
          <select value={t.dn_mm} onChange={(e) => actualizarTuberia(t.id, { dn_mm: Number(e.target.value) })}>
            {cfg.diametros_mm.map((d) => (
              <option key={d} value={d}>{d} mm</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span className="campo-etiqueta">Material</span>
          <select value={t.material} onChange={(e) => actualizarTuberia(t.id, { material: e.target.value })}>
            {cfg.materiales.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span className="campo-etiqueta">Régimen</span>
          <select value={t.regimen} onChange={(e) => actualizarTuberia(t.id, { regimen: e.target.value as Regimen })}>
            {(Object.keys(cfg.regimenes) as Regimen[]).map((r) => (
              <option key={r} value={r}>{cfg.regimenes[r].nombre}</option>
            ))}
          </select>
        </label>
        <p className="nota">
          Puntos intermedios: {t.puntos.length}. Arrastra una esfera blanca del trazo para crear un quiebre; doble clic
          en un punto azul lo elimina.
        </p>
      </section>

      {analisis && (
        <section>
          <h3>Hidráulica</h3>
          <dl className="calculados">
            <dt>Longitud en planta</dt>
            <dd>{num(analisis.longitud)} m</dd>
            <dt>Caudal a Qmed</dt>
            <dd>{caudal(analisis.qMed)}</dd>
            <dt>Caudal a Qmáx</dt>
            <dd>{caudal(analisis.qMax)}</dd>
            {analisis.vMed !== null && analisis.vMax !== null && (
              <>
                <dt>Velocidad a Qmed</dt>
                <dd>{num(analisis.vMed)} m/s</dd>
                <dt>Velocidad a Qmáx</dt>
                <dd>{num(analisis.vMax)} m/s</dd>
              </>
            )}
          </dl>
          <p className={`semaforo semaforo-${estado.clase}`}>{estado.texto}</p>
          {analisis.mensajes.map((m, i) => (
            <p key={i} className="nota nota-error">{m}</p>
          ))}
          {analisis.estado === 'sin_evaluar' && fluido.nota && <p className="nota">{fluido.nota}</p>}
          {analisis.estado !== 'sin_evaluar' && (
            <p className="nota">
              Criterio ({regimen.nombre.toLowerCase()}):{' '}
              {t.regimen === 'presion'
                ? `${cfg.regimenes.presion.vMin}–${cfg.regimenes.presion.vMax} m/s; el mínimo se revisa a Qmed y el máximo a Qmáx.`
                : `mínimo ${cfg.regimenes.gravedad.vMin} m/s a Qmed, recomendado ${cfg.regimenes.gravedad.vMinRecomendada} m/s.`}
            </p>
          )}
        </section>
      )}
    </>
  );
}
