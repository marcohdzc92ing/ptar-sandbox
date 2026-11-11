import { escenaApi } from '../scene/api';
import { useDiseno, useUI } from '../store/diseno';
import type { Resumen } from '../ui/resumen';
import { nombreArchivo } from './archivos';

/** Las fuentes estándar de PDF no tienen estos caracteres; se sustituyen por equivalentes. */
const REEMPLAZOS: [RegExp, string][] = [
  [/₅/g, '5'],
  [/₃/g, '3'],
  [/⁻¹/g, '-1'],
  [/→/g, '->'],
  [/≥/g, '>='],
  [/≤/g, '<='],
  [/[–—]/g, '-'],
  [/[“”]/g, '"'],
];
export function textoPdf(s: string): string {
  return REEMPLAZOS.reduce((t, [de, a]) => t.replace(de, a), s);
}

/** Captura la vista isométrica completa del terreno como imagen JPEG. */
export async function capturarVista(): Promise<string | null> {
  useDiseno.getState().seleccionar(null);
  useUI.getState().setCaptura(true);
  escenaApi.centrarVista();
  try {
    // deja que React cambie las etiquetas a números antes de dibujar el cuadro
    await new Promise((r) => setTimeout(r, 250));
    return escenaApi.capturar();
  } finally {
    useUI.getState().setCaptura(false);
  }
}

export async function exportarPdf(resumen: Resumen, imagen: string | null): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 15;
  let y = margen;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Reporte de diseño de PTAR', margen, y + 4);
  y += 11;
  doc.setFontSize(11);
  doc.text(textoPdf(resumen.proyecto || 'Proyecto sin nombre'), margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(textoPdf(`Alumno(a): ${resumen.alumno || '________________________'}`), margen, y);
  doc.text(textoPdf(resumen.fecha), ancho - margen, y, { align: 'right' });
  y += 5;
  doc.setDrawColor(21, 101, 192);
  doc.line(margen, y, ancho - margen, y);
  y += 4;

  if (imagen) {
    const props = doc.getImageProperties(imagen);
    const w = ancho - 2 * margen;
    const h = Math.min((props.height / props.width) * w, 110);
    const wReal = (props.width / props.height) * h;
    doc.addImage(imagen, 'JPEG', margen + (w - wReal) / 2, y, wReal, h);
    y += h + 3;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text('Vista isométrica del arreglo. Los números corresponden a la tabla "Unidades y dimensiones". 1 celda = 1 m.', margen, y);
    doc.setTextColor(0);
    y += 5;
  }

  for (const t of resumen.tablas) {
    if (y > alto - 40) {
      doc.addPage();
      y = margen;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(textoPdf(t.titulo), margen, y + 4);
    autoTable(doc, {
      startY: y + 6,
      head: [t.columnas.map(textoPdf)],
      body: t.filas.map((f) => f.map(textoPdf)),
      margin: { left: margen, right: margen, bottom: 16 },
      styles: { fontSize: 8, cellPadding: 1.3, overflow: 'linebreak' },
      headStyles: { fillColor: [21, 101, 192], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 250] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2;
    if (t.nota) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      const lineas = doc.splitTextToSize(textoPdf(t.nota), ancho - 2 * margen) as string[];
      doc.text(lineas, margen, y + 3);
      y += lineas.length * 3.5 + 1;
    }
    y += 5;
  }

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(textoPdf(`Sandbox PTAR · costos: ${resumen.leyendaCostos}`), margen, alto - 8);
    doc.text(`${i} / ${paginas}`, ancho - margen, alto - 8, { align: 'right' });
    doc.setTextColor(0);
  }

  doc.save(`${nombreArchivo(resumen.proyecto, 'reporte-ptar')}.pdf`);
}
