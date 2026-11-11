import { useMemo, useState } from 'react';
import { capturarVista, exportarPdf } from '../io/pdf';
import type { Analisis } from '../store/analisis';
import { useConfig } from '../store/config';
import { useDiseno } from '../store/diseno';
import { construirResumen } from './resumen';

export function VentanaResumen({ analisis, alCerrar }: { analisis: Analisis; alCerrar: () => void }) {
  const diseno = useDiseno((s) => s.diseno);
  const actualizarProyecto = useDiseno((s) => s.actualizarProyecto);
  const catalogo = useConfig((s) => s.catalogo);
  const normas = useConfig((s) => s.normas);
  const precios = useConfig((s) => s.precios);
  const tuberias = useConfig((s) => s.tuberias);
  const [estado, setEstado] = useState<'listo' | 'generando' | 'error'>('listo');

  const resumen = useMemo(
    () => construirResumen(diseno, analisis, { catalogo, normas, precios, tuberias }),
    [diseno, analisis, catalogo, normas, precios, tuberias],
  );

  const exportar = async () => {
    setEstado('generando');
    try {
      const imagen = await capturarVista();
      await exportarPdf(resumen, imagen);
      setEstado('listo');
    } catch (e) {
      console.error(e);
      setEstado('error');
    }
  };

  return (
    <div className="modal-fondo" onClick={alCerrar}>
      <div className="modal" role="dialog" aria-label="Resumen del diseño" onClick={(e) => e.stopPropagation()}>
        <header className="modal-cabecera">
          <h2>Resumen del diseño</h2>
          <div className="barra-grupo">
            <button className="primario" onClick={exportar} disabled={estado === 'generando'}>
              {estado === 'generando' ? 'Generando…' : 'Exportar PDF'}
            </button>
            <button onClick={alCerrar}>Cerrar</button>
          </div>
        </header>
        <div className="modal-cuerpo">
          {estado === 'error' && <p className="nota nota-error">No se pudo generar el PDF. Intenta de nuevo.</p>}
          <div className="resumen-datos">
            <label className="campo">
              <span className="campo-etiqueta">Nombre del proyecto</span>
              <input type="text" value={diseno.proyecto} onChange={(e) => actualizarProyecto({ proyecto: e.target.value })} />
            </label>
            <label className="campo">
              <span className="campo-etiqueta">Alumno(a)</span>
              <input type="text" value={diseno.alumno} placeholder="Nombre para el reporte" onChange={(e) => actualizarProyecto({ alumno: e.target.value })} />
            </label>
          </div>
          {resumen.tablas.map((t) => (
            <section key={t.titulo} className="resumen-tabla">
              <h3>{t.titulo}</h3>
              <table className="tabla-resumen">
                <thead>
                  <tr>
                    {t.columnas.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.filas.map((f, i) => (
                    <tr key={i}>
                      {f.map((celda, j) => (
                        <td key={j}>{celda}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {t.nota && <p className="nota">{t.nota}</p>}
            </section>
          ))}
          <p className="nota">El PDF incluye además la vista isométrica del arreglo.</p>
        </div>
      </div>
    </div>
  );
}
