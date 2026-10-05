import { max } from 'd3-array';
import type { Axis } from 'd3-axis';
import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';
import { useCallback, useMemo } from 'react';
import type { BinHistograma } from '@/api/tipos';
import { colorMagnitud, LEYENDA_MAGNITUD } from '@/lib/escalasColor';
import { formatearEntero, formatearNumero } from '@/lib/formato';
import { ContenedorGrafica, Eje, ElementoLeyenda, FilaTooltip, Leyenda, Tooltip } from './comun';
import { ESTILO_GRAFICA, MARGENES_POR_DEFECTO, useTooltip } from './estilo';

interface Props {
  bins: BinHistograma[];
  alto?: number;
}

const ALTO_POR_DEFECTO = 240;
const formatoMagnitud = format('.1f');
const formatoConteo = format('~s');

export function HistogramaMagnitud({ bins, alto = ALTO_POR_DEFECTO }: Props) {
  const { tooltip, mostrar, ocultar } = useTooltip<BinHistograma>();
  const m = MARGENES_POR_DEFECTO;

  const dominioX = useMemo<[number, number]>(() => {
    const desde = bins.reduce((acc, b) => Math.min(acc, b.desde), Number.POSITIVE_INFINITY);
    const hasta = bins.reduce((acc, b) => Math.max(acc, b.hasta), Number.NEGATIVE_INFINITY);
    return Number.isFinite(desde) ? [desde, hasta] : [0, 1];
  }, [bins]);
  const maxY = max(bins, (b) => b.total) ?? 0;

  const configurarX = useCallback((eje: Axis<number>) => eje.ticks(8).tickFormat((d) => formatoMagnitud(d).replace('.', ',')), []);
  const configurarY = useCallback((eje: Axis<number>) => eje.ticks(5).tickFormat((d) => formatoConteo(d)), []);

  return (
    <div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={`Histograma de magnitudes en ${bins.length} intervalos de 0,5`}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold">
                M {formatearNumero(tooltip.dato.desde, 1)} – {formatearNumero(tooltip.dato.hasta, 1)}
              </p>
              <FilaTooltip etiqueta="Sismos" valor={formatearEntero(tooltip.dato.total)} />
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const x = scaleLinear().domain(dominioX).range([m.izquierda, ancho - m.derecha]);
          const y = scaleLinear()
            .domain([0, maxY || 1])
            .nice()
            .range([alto - m.abajo, m.arriba]);
          const anchoPlot = ancho - m.izquierda - m.derecha;
          return (
            <>
              <Eje escala={y} orientacion="izquierda" x={m.izquierda} configurar={configurarY} rejilla={anchoPlot} />
              <Eje escala={x} orientacion="abajo" y={alto - m.abajo} configurar={configurarX} />
              <text x={ancho - m.derecha} y={alto - 4} textAnchor="end" fontSize={ESTILO_GRAFICA.tamanoTexto} fill={ESTILO_GRAFICA.colorEje}>
                Magnitud
              </text>
              {bins.map((bin) => {
                const x0 = x(bin.desde) + ESTILO_GRAFICA.separacionBarras / 2;
                const anchoBarra = Math.max(0, x(bin.hasta) - x(bin.desde) - ESTILO_GRAFICA.separacionBarras);
                const yTope = y(bin.total);
                const altoBarra = Math.max(0, alto - m.abajo - yTope);
                return (
                  <g key={bin.desde}>
                    <rect
                      x={x0}
                      y={yTope}
                      width={anchoBarra}
                      height={altoBarra}
                      rx={altoBarra > ESTILO_GRAFICA.radioBarra ? ESTILO_GRAFICA.radioBarra : 0}
                      fill={colorMagnitud(bin.desde)}
                      opacity={tooltip && tooltip.dato !== bin ? 0.6 : 1}
                    />
                    {/* Área de interacción más grande que la marca */}
                    <rect
                      x={x0}
                      y={m.arriba}
                      width={anchoBarra}
                      height={alto - m.abajo - m.arriba}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={`Magnitud ${formatearNumero(bin.desde, 1)} a ${formatearNumero(bin.hasta, 1)}: ${formatearEntero(bin.total)} sismos`}
                      onMouseMove={(e) => mostrar(e, bin)}
                      onMouseLeave={ocultar}
                      onFocus={(e) => mostrar(e, bin)}
                      onBlur={ocultar}
                      className="focus:outline-none focus-visible:stroke-primario focus-visible:stroke-2"
                    />
                  </g>
                );
              })}
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        {LEYENDA_MAGNITUD.map((e) => (
          <ElementoLeyenda key={e.etiqueta} color={e.relleno}>
            {e.etiqueta}
          </ElementoLeyenda>
        ))}
      </Leyenda>
    </div>
  );
}
