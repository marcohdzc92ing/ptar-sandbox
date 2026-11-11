import { lpsAm3d, m3dALps, redondear } from '../calc/unidades';
import { areaTerreno } from '../calc/geometria';
import { useDiseno, useUI } from '../store/diseno';
import type { CalidadInfluente, DatosProyecto } from '../types';
import { CampoNumero } from './CampoNumero';
import { num, PARAMETROS_CALIDAD } from './formato';

const CAUDALES: { clave: 'Qmed_Ls' | 'Qmax_Ls' | 'Qmin_Ls'; nombre: string }[] = [
  { clave: 'Qmed_Ls', nombre: 'Caudal medio' },
  { clave: 'Qmax_Ls', nombre: 'Caudal máximo' },
  { clave: 'Qmin_Ls', nombre: 'Caudal mínimo' },
];

const CALIDAD = PARAMETROS_CALIDAD as { clave: keyof CalidadInfluente; nombre: string; unidad: string }[];

export function PanelProyecto() {
  const diseno = useDiseno((s) => s.diseno);
  const actualizarDatos = useDiseno((s) => s.actualizarDatos);
  const actualizarProyecto = useDiseno((s) => s.actualizarProyecto);
  const unidadCaudal = useUI((s) => s.unidadCaudal);
  const setUnidadCaudal = useUI((s) => s.setUnidadCaudal);
  const d = diseno.datos;
  const enM3d = unidadCaudal === 'm3d';

  const cambiar = (cambio: Partial<DatosProyecto>, clave: string) => actualizarDatos(cambio, { clave: `datos:${clave}` });

  return (
    <div className="panel-contenido">
      <section>
        <h3>Proyecto</h3>
        <label className="campo">
          <span className="campo-etiqueta">Nombre del proyecto</span>
          <input type="text" value={diseno.proyecto} onChange={(e) => actualizarProyecto({ proyecto: e.target.value })} />
        </label>
        <label className="campo">
          <span className="campo-etiqueta">Alumno(a)</span>
          <input type="text" value={diseno.alumno} onChange={(e) => actualizarProyecto({ alumno: e.target.value })} />
        </label>
      </section>

      <section>
        <h3>
          Caudales
          <span className="conmutador">
            <button className={!enM3d ? 'activo' : ''} onClick={() => setUnidadCaudal('Ls')}>L/s</button>
            <button className={enM3d ? 'activo' : ''} onClick={() => setUnidadCaudal('m3d')}>m³/d</button>
          </span>
        </h3>
        {CAUDALES.map((c) => (
          <div key={c.clave}>
            <CampoNumero
              etiqueta={c.nombre}
              unidad={enM3d ? 'm³/d' : 'L/s'}
              valor={enM3d ? redondear(lpsAm3d(d[c.clave]), 1) : redondear(d[c.clave], 3)}
              min={0}
              alCambiar={(v) => cambiar({ [c.clave]: enM3d ? m3dALps(v) : v }, c.clave)}
            />
            <div className="equivalente">
              = {enM3d ? `${num(d[c.clave])} L/s` : `${num(lpsAm3d(d[c.clave]), 0)} m³/d`}
            </div>
          </div>
        ))}
        {(d.Qmin_Ls > d.Qmed_Ls || d.Qmed_Ls > d.Qmax_Ls) && (
          <p className="nota nota-error">Revisa los caudales: debe cumplirse Qmín ≤ Qmed ≤ Qmáx.</p>
        )}
        <CampoNumero
          etiqueta="Población equivalente"
          unidad="hab"
          valor={d.poblacion}
          min={0}
          entero
          alCambiar={(v) => cambiar({ poblacion: v }, 'poblacion')}
        />
      </section>

      <section>
        <h3>Calidad del influente</h3>
        {CALIDAD.map((c) => (
          <CampoNumero
            key={c.clave}
            etiqueta={c.nombre}
            unidad={c.unidad}
            valor={d.influente[c.clave]}
            min={0}
            alCambiar={(v) => cambiar({ influente: { ...d.influente, [c.clave]: v } }, c.clave)}
          />
        ))}
      </section>

      <section>
        <h3>Terreno disponible</h3>
        <CampoNumero etiqueta="Largo" unidad="m" valor={d.terreno.largo} min={1} max={1000}
          alCambiar={(v) => cambiar({ terreno: { ...d.terreno, largo: v } }, 'largo')} />
        <CampoNumero etiqueta="Ancho" unidad="m" valor={d.terreno.ancho} min={1} max={1000}
          alCambiar={(v) => cambiar({ terreno: { ...d.terreno, ancho: v } }, 'ancho')} />
        <div className="equivalente">Área: {num(areaTerreno(d.terreno), 0)} m²</div>
        <CampoNumero etiqueta="Separación mínima entre unidades" unidad="m" valor={d.separacionMinima_m} min={0} max={50}
          alCambiar={(v) => cambiar({ separacionMinima_m: v }, 'separacion')} />
      </section>
    </div>
  );
}
