import type { Axis } from 'd3-axis';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useCallback } from 'react';
import { NIVELES_IMPACTO, type NivelImpacto } from '@/api/tipos';
import { estiloNivelImpacto } from '@/lib/escalasColor';
import { formatearPorcentaje } from '@/lib/formato';
import { ContenedorGrafica, Eje, FilaTooltip, Tooltip } from './comun';
import { ESTILO_GRAFICA, useTooltip } from './estilo';

interface Props {
  probabilidades: Record<NivelImpacto, number>;
  /** Clase estimada (se resalta). */
  seleccionada?: NivelImpacto;
}

const ALTO_FILA = 40;
const MARGENES = { arriba: 4, derecha: 56, abajo: 28, izquierda: 112 };

export function BarrasProbabilidad({ probabilidades, seleccionada }: Props) {
  const { tooltip, mostrar, ocultar } = useTooltip<NivelImpacto>();
  const alto = NIVELES_IMPACTO.length * ALTO_FILA + MARGENES.arriba + MARGENES.abajo;
  const configurarX = useCallback((eje: Axis<number>) => eje.ticks(5).tickFormat((d) => formatearPorcentaje(d, 0)), []);

  return (
    <ContenedorGrafica
      alto={alto}
      etiqueta={`Probabilidad por clase de impacto: ${NIVELES_IMPACTO.map(
        (n) => `${estiloNivelImpacto(n).etiqueta} ${formatearPorcentaje(probabilidades[n])}`,
      ).join(', ')}`}
      superpuesto={(ancho) =>
        tooltip && (
          <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
            <FilaTooltip etiqueta={estiloNivelImpacto(tooltip.dato).etiqueta} valor={formatearPorcentaje(probabilidades[tooltip.dato])} />
          </Tooltip>
        )
      }
    >
      {(ancho) => {
        const x = scaleLinear().domain([0, 1]).range([MARGENES.izquierda, ancho - MARGENES.derecha]);
        const y = scaleBand<NivelImpacto>()
          .domain([...NIVELES_IMPACTO])
          .range([MARGENES.arriba, alto - MARGENES.abajo])
          .padding(0.3);
        return (
          <>
            <Eje
              escala={x}
              orientacion="abajo"
              y={alto - MARGENES.abajo}
              configurar={configurarX}
              rejilla={alto - MARGENES.abajo - MARGENES.arriba}
            />
            {NIVELES_IMPACTO.map((nivel) => {
              const estilo = estiloNivelImpacto(nivel);
              const valor = probabilidades[nivel];
              const yBanda = y(nivel) ?? 0;
              const esSeleccionada = nivel === seleccionada;
              return (
                <g key={nivel} onMouseMove={(e) => mostrar(e, nivel)} onMouseLeave={ocultar}>
                  <text
                    x={MARGENES.izquierda - 8}
                    y={yBanda + y.bandwidth() / 2}
                    dy="0.35em"
                    textAnchor="end"
                    fontSize={12}
                    fontWeight={esSeleccionada ? 700 : 400}
                    fill="#1b2a30"
                  >
                    {estilo.etiqueta}
                  </text>
                  <rect
                    x={MARGENES.izquierda}
                    y={yBanda}
                    width={x(1) - MARGENES.izquierda}
                    height={y.bandwidth()}
                    fill="#f3f5f7"
                    rx={ESTILO_GRAFICA.radioBarra}
                  />
                  <rect
                    x={MARGENES.izquierda}
                    y={yBanda}
                    width={Math.max(0, x(valor) - MARGENES.izquierda)}
                    height={y.bandwidth()}
                    fill={estilo.relleno}
                    rx={ESTILO_GRAFICA.radioBarra}
                    stroke={esSeleccionada ? '#1b2a30' : 'none'}
                    strokeWidth={esSeleccionada ? 1.5 : 0}
                  />
                  <text
                    x={x(valor) + 6}
                    y={yBanda + y.bandwidth() / 2}
                    dy="0.35em"
                    fontSize={12}
                    fontWeight={600}
                    fill="#1b2a30"
                    className="tabular-nums"
                  >
                    {formatearPorcentaje(valor)}
                  </text>
                </g>
              );
            })}
          </>
        );
      }}
    </ContenedorGrafica>
  );
}
