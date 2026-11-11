import { useConfig } from '../store/config';
import { escenaApi } from '../scene/api';
import { agregarDesdeCatalogo } from './acciones';

export function PanelCatalogo() {
  const catalogo = useConfig((s) => s.catalogo);

  return (
    <div className="panel-contenido">
      <p className="nota">Arrastra una unidad al terreno, o haz clic para colocarla al centro de la vista.</p>
      {catalogo.etapas.map((etapa) => (
        <section key={etapa.id}>
          <h3>{etapa.nombre}</h3>
          <ul className="catalogo">
            {catalogo.unidades
              .filter((u) => u.etapa === etapa.id)
              .map((u) => (
                <li
                  key={u.id}
                  draggable
                  title="Arrastra al terreno"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-ptar-unidad', u.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const c = escenaApi.centroVista();
                    agregarDesdeCatalogo(u, c.x, c.y);
                  }}
                >
                  <span
                    className={`muestra ${u.formas[0] === 'circular' ? 'muestra-circular' : ''}`}
                    style={{ background: u.color }}
                  />
                  <span>{u.nombre}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
