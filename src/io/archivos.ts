/** Utilidades de navegador para descargar y abrir archivos locales. */

export function nombreArchivo(texto: string, respaldo: string): string {
  const limpio = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();
  return limpio || respaldo;
}

export function descargarTexto(nombre: string, contenido: string, tipo = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Abre el selector de archivos y devuelve el JSON elegido (o null si se cancela). */
export function abrirJson(): Promise<unknown | null> {
  return new Promise((resolver, rechazar) => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = '.json,application/json';
    entrada.onchange = () => {
      const archivo = entrada.files?.[0];
      if (!archivo) return resolver(null);
      archivo
        .text()
        .then((t) => resolver(JSON.parse(t)))
        .catch(() => rechazar(new Error('El archivo no es un JSON válido.')));
    };
    entrada.addEventListener('cancel', () => resolver(null));
    entrada.click();
  });
}
