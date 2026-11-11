import { leerConfig, leerDiseno, serializarConfig } from '../calc/archivo';
import type { Diseno } from '../types';
import proyectoDefecto from '../data/proyectoDefecto.json';
import { CONFIG_FABRICA, configEditable, useConfig } from '../store/config';
import { useDiseno } from '../store/diseno';

const CLAVE_DISENO = 'ptar-diseno';
const CLAVE_CONFIG = 'ptar-config';
/** Archivo opcional publicado junto al sitio con la configuración del profesor. */
const ARCHIVO_CONFIG_SITIO = './config-profesor.json';

function leerLocal(clave: string): unknown {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function guardarLocal(clave: string, texto: string | null): void {
  try {
    if (texto === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, texto);
  } catch {
    // almacenamiento lleno o bloqueado: el diseño sigue en memoria
  }
}

/**
 * Recupera el diseño y la configuración guardados en este navegador y deja
 * activo el autoguardado. Debe llamarse una vez, antes de dibujar la aplicación.
 */
export function iniciarPersistencia(): void {
  // --- configuración: local > archivo del sitio > fábrica ---
  const configLocal = leerLocal(CLAVE_CONFIG);
  let hayLocal = false;
  if (configLocal) {
    try {
      useConfig.getState().aplicarConfig(leerConfig(configLocal, CONFIG_FABRICA), 'local');
      hayLocal = true;
    } catch {
      guardarLocal(CLAVE_CONFIG, null);
    }
  }
  if (!hayLocal) {
    fetch(ARCHIVO_CONFIG_SITIO, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json && useConfig.getState().origen === 'fabrica') {
          useConfig.getState().aplicarConfig(leerConfig(json, CONFIG_FABRICA), 'sitio');
        }
      })
      .catch(() => {
        // sin archivo de configuración: se usan los valores de fábrica
      });
  }
  useConfig.subscribe((s, previo) => {
    if (s.origen === 'local') guardarLocal(CLAVE_CONFIG, serializarConfig(configEditable(s)));
    else if (previo.origen === 'local') guardarLocal(CLAVE_CONFIG, null);
  });

  // --- diseño ---
  const disenoLocal = leerLocal(CLAVE_DISENO);
  if (disenoLocal) {
    try {
      const { diseno } = leerDiseno(disenoLocal, useConfig.getState().catalogo, proyectoDefecto as unknown as Diseno);
      useDiseno.setState({ diseno });
    } catch {
      guardarLocal(CLAVE_DISENO, null);
    }
  }
  let pendiente: ReturnType<typeof setTimeout> | undefined;
  useDiseno.subscribe((s, previo) => {
    if (s.diseno === previo.diseno) return;
    clearTimeout(pendiente);
    pendiente = setTimeout(() => guardarLocal(CLAVE_DISENO, JSON.stringify(s.diseno)), 400);
  });
}
