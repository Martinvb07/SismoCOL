import { useCallback, useState } from 'react';

/** Tokens visuales compartidos por las gráficas (ejes recesivos, marcas finas). */
export const ESTILO_GRAFICA = {
  colorEje: '#5f6f75',
  colorRejilla: '#e6ebee',
  colorPrimario: '#1f8fa6',
  colorSecundario: '#14323b',
  colorAcento: '#8a5cc2',
  tamanoTexto: 11,
  grosorLinea: 2,
  radioBarra: 3,
  separacionBarras: 2,
} as const;

export interface Margenes {
  arriba: number;
  derecha: number;
  abajo: number;
  izquierda: number;
}

export const MARGENES_POR_DEFECTO: Margenes = { arriba: 12, derecha: 16, abajo: 36, izquierda: 48 };

export interface EstadoTooltip<T> {
  x: number;
  y: number;
  dato: T;
}

type EventoMarca = React.MouseEvent<SVGElement> | React.FocusEvent<SVGElement>;

/** Estado del tooltip con coordenadas relativas al SVG de la gráfica. */
export function useTooltip<T>() {
  const [tooltip, setTooltip] = useState<EstadoTooltip<T> | null>(null);
  const mostrar = useCallback((evento: EventoMarca, dato: T) => {
    const elemento = evento.currentTarget;
    const svg = elemento.ownerSVGElement ?? elemento;
    const caja = svg.getBoundingClientRect();
    let x: number;
    let y: number;
    if ('clientX' in evento) {
      x = evento.clientX - caja.left;
      y = evento.clientY - caja.top;
    } else {
      const r = elemento.getBoundingClientRect();
      x = r.left + r.width / 2 - caja.left;
      y = r.top - caja.top;
    }
    setTooltip({ x, y, dato });
  }, []);
  const ocultar = useCallback(() => setTooltip(null), []);
  return { tooltip, mostrar, ocultar };
}
