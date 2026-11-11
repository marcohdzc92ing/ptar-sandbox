import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { iniciarPersistencia } from './io/persistencia';
import './styles.css';

iniciarPersistencia();

// Solo en desarrollo: acceso desde la consola para depurar (window.__ptar).
if (import.meta.env.DEV) {
  void Promise.all([import('./store/diseno'), import('./scene/api')]).then(([store, api]) => {
    Object.assign(window, { __ptar: { ...store, ...api } });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
