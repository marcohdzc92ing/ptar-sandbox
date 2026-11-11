import { useEffect, useState } from 'react';
import { areaTerreno } from './calc/geometria';
import { useAnalisis } from './store/analisis';
import { Escena } from './scene/Escena';
import { escenaApi } from './scene/api';
import { leerDiseno } from './calc/archivo';
import proyectoDefecto from './data/proyectoDefecto.json';
import { abrirJson, descargarTexto, nombreArchivo } from './io/archivos';
import { esModoProfesor, useConfig } from './store/config';
import { useDiseno, useUI } from './store/diseno';
import type { Diseno } from './types';
import { VentanaProfesor } from './ui/VentanaProfesor';
import { VentanaResumen } from './ui/VentanaResumen';
import { duplicarSeleccion } from './ui/acciones';
import { num } from './ui/formato';
import { PanelCatalogo } from './ui/PanelCatalogo';
import { contarAlertas, PanelAlertas } from './ui/PanelAlertas';
import { PanelCostos } from './ui/PanelCostos';
import { PanelNorma } from './ui/PanelNorma';
import { PanelPropiedades } from './ui/PanelPropiedades';
import { PanelProyecto } from './ui/PanelProyecto';

export function App() {
  const diseno = useDiseno((s) => s.diseno);
  const hayPasado = useDiseno((s) => s.pasado.length > 0);
  const hayFuturo = useDiseno((s) => s.futuro.length > 0);
  const { deshacer, rehacer, cargarEjemplo, nuevoDiseno } = useDiseno.getState();
  const conexion = useUI((s) => s.conexion);
  const analisis = useAnalisis();
  const paso = useUI((s) => s.paso);
  const setPaso = useUI((s) => s.setPaso);
  const etiquetas = useUI((s) => s.mostrarEtiquetas);
  const setEtiquetas = useUI((s) => s.setMostrarEtiquetas);
  const [pestana, setPestana] = useState<'proyecto' | 'catalogo'>('catalogo');
  const [pestanaDer, setPestanaDer] = useState<'propiedades' | 'alertas' | 'norma' | 'costos'>('propiedades');
  const cuenta = contarAlertas(analisis);
  const [ventana, setVentana] = useState<'resumen' | 'profesor' | null>(null);
  const origenConfig = useConfig((s) => s.origen);
  const profesor = esModoProfesor();

  const guardarArchivo = () =>
    descargarTexto(`${nombreArchivo(diseno.proyecto, 'diseno-ptar')}.json`, JSON.stringify(diseno, null, 2));
  const abrirArchivo = async () => {
    try {
      const json = await abrirJson();
      if (!json) return;
      const { diseno: leido, avisos } = leerDiseno(json, useConfig.getState().catalogo, proyectoDefecto as unknown as Diseno);
      useDiseno.getState().cargarDiseno(leido);
      setTimeout(() => escenaApi.centrarVista(), 0);
      if (avisos.length) window.alert(`El diseño se cargó con observaciones:\n\n${avisos.join('\n')}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo abrir el archivo.');
    }
  };

  const { unidades, datos } = diseno;
  const ocupada = analisis.areaOcupada;
  const disponible = areaTerreno(datos.terreno);
  const porcentaje = disponible > 0 ? (ocupada / disponible) * 100 : 0;

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
      if (document.querySelector('.modal-fondo')) return;
      const s = useDiseno.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const tecla = e.key.toLowerCase();
      if (ctrl && tecla === 'z' && !e.shiftKey) s.deshacer();
      else if (ctrl && (tecla === 'y' || (tecla === 'z' && e.shiftKey))) s.rehacer();
      else if (ctrl && tecla === 'd' && s.seleccion) duplicarSeleccion();
      else if ((tecla === 'delete' || tecla === 'backspace') && s.seleccion) s.borrarUnidad(s.seleccion);
      else if ((tecla === 'delete' || tecla === 'backspace') && s.tuberiaSel) s.borrarTuberia(s.tuberiaSel);
      else if (tecla === 'r' && !ctrl && s.seleccion) s.rotarUnidad(s.seleccion);
      else if (tecla === 'escape') {
        s.seleccionar(null);
        useUI.getState().setConexion(null);
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const confirmar = (mensaje: string, accion: () => void) => {
    if (unidades.length === 0 || window.confirm(mensaje)) {
      accion();
      setTimeout(() => escenaApi.centrarVista(), 0);
    }
  };

  return (
    <div className="app">
      <header className="barra">
        <h1>Sandbox PTAR</h1>
        <span className="barra-proyecto">{diseno.proyecto}</span>
        <div className="barra-grupo">
          <button onClick={deshacer} disabled={!hayPasado} title="Deshacer (Ctrl+Z)">↶ Deshacer</button>
          <button onClick={rehacer} disabled={!hayFuturo} title="Rehacer (Ctrl+Y)">↷ Rehacer</button>
        </div>
        <div className="barra-grupo">
          <label className="barra-opcion" title="Paso de ajuste al mover unidades">
            Ajuste
            <select value={paso} onChange={(e) => setPaso(Number(e.target.value) as 1 | 0.5)}>
              <option value={1}>1 m</option>
              <option value={0.5}>0.5 m</option>
            </select>
          </label>
          <label className="barra-opcion">
            <input type="checkbox" checked={etiquetas} onChange={(e) => setEtiquetas(e.target.checked)} />
            Etiquetas
          </label>
        </div>
        <div className="barra-grupo barra-derecha">
          <button onClick={abrirArchivo} title="Cargar un diseño guardado (.json)">Abrir</button>
          <button onClick={guardarArchivo} title="Descargar el diseño como archivo .json">Guardar</button>
          <button className="primario" onClick={() => setVentana('resumen')} title="Resumen del diseño y reporte en PDF">
            Resumen y PDF
          </button>
          {profesor && <button onClick={() => setVentana('profesor')}>Modo profesor</button>}
        </div>
        <div className="barra-grupo">
          <button onClick={() => confirmar('¿Reemplazar el diseño actual por el ejemplo de 50 L/s?', cargarEjemplo)}>
            Cargar ejemplo
          </button>
          <button onClick={() => confirmar('¿Empezar un diseño vacío? Puedes deshacer con Ctrl+Z.', nuevoDiseno)}>
            Nuevo
          </button>
        </div>
      </header>

      <div className="cuerpo">
        <aside className="panel">
          <nav className="pestanas">
            <button className={pestana === 'proyecto' ? 'activo' : ''} onClick={() => setPestana('proyecto')}>
              Datos del proyecto
            </button>
            <button className={pestana === 'catalogo' ? 'activo' : ''} onClick={() => setPestana('catalogo')}>
              Catálogo
            </button>
          </nav>
          {pestana === 'proyecto' ? <PanelProyecto /> : <PanelCatalogo />}
        </aside>

        <main className="centro">
          <Escena analisis={analisis} />
          {conexion && (
            <div className="aviso-conexion">
              Elige un puerto de entrada resaltado en verde para tender la tubería · Esc cancela
            </div>
          )}
          <div className="vista-controles">
            <button onClick={() => escenaApi.rotarVista(-1)} title="Girar la vista 90° a la izquierda">⟲</button>
            <button onClick={() => escenaApi.rotarVista(1)} title="Girar la vista 90° a la derecha">⟳</button>
            <button onClick={() => escenaApi.centrarVista()} title="Encuadrar el terreno">⤢</button>
          </div>
          <div className="ayuda">
            Arrastra el fondo para desplazar · rueda para acercar · arrastra una unidad para moverla · R rota · Supr borra · para conectar: clic en una salida (cubo) y luego en una entrada (esfera)
          </div>
        </main>

        <aside className="panel panel-derecho">
          <nav className="pestanas">
            <button className={pestanaDer === 'propiedades' ? 'activo' : ''} onClick={() => setPestanaDer('propiedades')}>
              Propiedades
            </button>
            <button className={pestanaDer === 'alertas' ? 'activo' : ''} onClick={() => setPestanaDer('alertas')}>
              Alertas
              <span className={`contador ${cuenta.total ? 'contador-mal' : 'contador-bien'}`}>{cuenta.total}</span>
            </button>
            <button className={pestanaDer === 'norma' ? 'activo' : ''} onClick={() => setPestanaDer('norma')}>
              Norma
            </button>
            <button className={pestanaDer === 'costos' ? 'activo' : ''} onClick={() => setPestanaDer('costos')}>
              Costos
            </button>
          </nav>
          {pestanaDer === 'propiedades' ? (
            <PanelPropiedades analisis={analisis} />
          ) : pestanaDer === 'norma' ? (
            <PanelNorma analisis={analisis} />
          ) : pestanaDer === 'costos' ? (
            <PanelCostos analisis={analisis} />
          ) : (
            <PanelAlertas analisis={analisis} alSeleccionar={() => setPestanaDer('propiedades')} />
          )}
        </aside>
      </div>

      <footer className="estado">
        <span>
          Área ocupada: <strong>{num(ocupada, 0)} m²</strong> de {num(disponible, 0)} m² disponibles ({num(porcentaje, 1)} %)
        </span>
        <span className="medidor" role="img" aria-label={`${num(porcentaje, 0)} % del terreno ocupado`}>
          <span
            className={porcentaje > 100 ? 'medidor-mal' : ''}
            style={{ width: `${Math.min(100, porcentaje)}%` }}
          />
        </span>
        <span>{unidades.length} unidades</span>
        <span>
          {diseno.tuberias.length} tuberías · {num(analisis.longitudTotal, 0)} m
        </span>
        <span className={cuenta.total ? 'estado-mal' : 'estado-bien'}>
          {cuenta.total === 0
            ? 'Sin alertas'
            : `Alertas: ${cuenta.tren} de tren · ${cuenta.diseno} de diseño · ${cuenta.tuberias} de tuberías · ${cuenta.disposicion} de disposición`}
        </span>
        {origenConfig !== 'fabrica' && (
          <span className="estado-config" title="Rangos, eficiencias o precios distintos a los de fábrica">
            Configuración del profesor
          </span>
        )}
        <span className="estado-derecha">1 celda = 1 m</span>
      </footer>
      {ventana === 'resumen' && <VentanaResumen analisis={analisis} alCerrar={() => setVentana(null)} />}
      {ventana === 'profesor' && <VentanaProfesor alCerrar={() => setVentana(null)} />}
    </div>
  );
}
