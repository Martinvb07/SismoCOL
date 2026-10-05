import { axisBottom, axisLeft, type Axis, type AxisDomain, type AxisScale } from 'd3-axis';
import { select } from 'd3-selection';
import { useEffect, useRef, type ReactNode } from 'react';
import { useDimensiones } from '@/hooks/useDimensiones';
import { ESTILO_GRAFICA } from './estilo';

/* ---------- Contenedor responsivo ---------- */

interface PropsContenedor {
  alto: number;
  etiqueta: string;
  children: (ancho: number) => ReactNode;
  /** Tooltip renderizado sobre la gráfica (posición absoluta). */
  superpuesto?: ReactNode | ((ancho: number) => ReactNode);
}

/** Mide el ancho disponible (ResizeObserver) y renderiza la gráfica a ese ancho. */
export function ContenedorGrafica({ alto, etiqueta, children, superpuesto }: PropsContenedor) {
  const [ref, { ancho }] = useDimensiones<HTMLDivElement>();
  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      {ancho > 0 && (
        <svg width={ancho} height={alto} role="img" aria-label={etiqueta} className="block overflow-visible">
          {children(ancho)}
        </svg>
      )}
      {ancho > 0 && (typeof superpuesto === 'function' ? superpuesto(ancho) : superpuesto)}
    </div>
  );
}

/* ---------- Ejes con d3-axis ---------- */

type Orientacion = 'abajo' | 'izquierda';

interface PropsEje<D extends AxisDomain> {
  escala: AxisScale<D>;
  orientacion: Orientacion;
  x?: number;
  y?: number;
  configurar?: (eje: Axis<D>) => Axis<D>;
  /** Longitud de las líneas de rejilla (0 = sin rejilla). */
  rejilla?: number;
  titulo?: string;
}

export function Eje<D extends AxisDomain>({ escala, orientacion, x = 0, y = 0, configurar, rejilla = 0, titulo }: PropsEje<D>) {
  const ref = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const base = orientacion === 'abajo' ? axisBottom<D>(escala) : axisLeft<D>(escala);
    const eje = configurar ? configurar(base) : base;
    const g = select(ref.current);
    g.call(eje);
    g.select('.domain').attr('stroke', ESTILO_GRAFICA.colorEje);
    g.selectAll('.tick text')
      .attr('fill', ESTILO_GRAFICA.colorEje)
      .attr('font-size', ESTILO_GRAFICA.tamanoTexto);
    g.selectAll('.tick line').attr('stroke', ESTILO_GRAFICA.colorEje);
    g.selectAll('.rejilla').remove();
    if (rejilla > 0) {
      g.selectAll<SVGGElement, unknown>('.tick')
        .append('line')
        .attr('class', 'rejilla')
        .attr('stroke', ESTILO_GRAFICA.colorRejilla)
        .attr(orientacion === 'abajo' ? 'y2' : 'x2', orientacion === 'abajo' ? -rejilla : rejilla)
        .lower();
    }
  }, [escala, orientacion, configurar, rejilla]);

  return (
    <g transform={`translate(${x},${y})`}>
      <g ref={ref} />
      {titulo && orientacion === 'abajo' && (
        <text x={0} y={0} dy={32} fill={ESTILO_GRAFICA.colorEje} fontSize={ESTILO_GRAFICA.tamanoTexto} className="titulo-eje">
          {titulo}
        </text>
      )}
    </g>
  );
}

/* ---------- Tooltip ---------- */

const DESPLAZAMIENTO_TOOLTIP = 12;

export function Tooltip({ x, y, anchoContenedor, children }: { x: number; y: number; anchoContenedor?: number; children: ReactNode }) {
  // Si el puntero está en la mitad derecha, el tooltip se abre hacia la izquierda.
  const haciaIzquierda = anchoContenedor !== undefined && x > anchoContenedor / 2;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 min-w-[10rem] max-w-[16rem] rounded-md border border-borde bg-white px-3 py-2 text-xs text-tinta shadow-lg"
      style={{
        left: haciaIzquierda ? undefined : x + DESPLAZAMIENTO_TOOLTIP,
        right: haciaIzquierda && anchoContenedor !== undefined ? anchoContenedor - x + DESPLAZAMIENTO_TOOLTIP : undefined,
        top: Math.max(0, y - DESPLAZAMIENTO_TOOLTIP),
      }}
    >
      {children}
    </div>
  );
}

export function FilaTooltip({ etiqueta, valor }: { etiqueta: string; valor: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-tinta-tenue">{etiqueta}</span>
      <span className="font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

/** Elemento de leyenda: muestra + texto. */
export function ElementoLeyenda({ color, tipo = 'cuadro', children }: { color: string; tipo?: 'cuadro' | 'linea' | 'punto' | 'discontinua'; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <svg width="18" height="10" aria-hidden="true">
        {tipo === 'cuadro' && <rect x="2" y="0" width="14" height="10" rx="2" fill={color} />}
        {tipo === 'linea' && <line x1="0" x2="18" y1="5" y2="5" stroke={color} strokeWidth="2" />}
        {tipo === 'discontinua' && <line x1="0" x2="18" y1="5" y2="5" stroke={color} strokeWidth="2" strokeDasharray="4 3" />}
        {tipo === 'punto' && <circle cx="9" cy="5" r="4" fill={color} stroke="#fff" />}
      </svg>
      {children}
    </li>
  );
}

export function Leyenda({ children }: { children: ReactNode }) {
  return <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-secundaria">{children}</ul>;
}
