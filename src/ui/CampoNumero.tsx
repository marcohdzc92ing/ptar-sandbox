import { useEffect, useRef, useState } from 'react';

interface Props {
  etiqueta: string;
  unidad?: string;
  valor: number;
  alCambiar: (v: number) => void;
  min?: number;
  max?: number;
  paso?: number;
  entero?: boolean;
}

/**
 * Campo numérico que deja escribir libremente ("0.", "") y solo
 * confirma valores válidos; al salir del campo vuelve al último válido.
 */
export function CampoNumero({ etiqueta, unidad, valor, alCambiar, min, max, paso, entero }: Props) {
  const [texto, setTexto] = useState(String(valor));
  const enfocado = useRef(false);

  useEffect(() => {
    if (!enfocado.current) setTexto(String(valor));
  }, [valor]);

  const valido = (v: number) =>
    Number.isFinite(v) && (min === undefined || v >= min) && (max === undefined || v <= max) && (!entero || Number.isInteger(v));

  const v = Number(texto.replace(',', '.'));
  const error = texto.trim() === '' || !valido(v);

  return (
    <label className="campo">
      <span className="campo-etiqueta">{etiqueta}</span>
      <span className="campo-entrada">
        <input
          type="number"
          inputMode="decimal"
          className={error ? 'invalido' : ''}
          value={texto}
          min={min}
          max={max}
          step={paso ?? (entero ? 1 : 'any')}
          onFocus={() => (enfocado.current = true)}
          onBlur={() => {
            enfocado.current = false;
            setTexto(String(valor));
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            const n = Number(e.target.value.replace(',', '.'));
            if (e.target.value.trim() !== '' && valido(n) && n !== valor) alCambiar(n);
          }}
        />
        {unidad && <span className="campo-unidad">{unidad}</span>}
      </span>
    </label>
  );
}
