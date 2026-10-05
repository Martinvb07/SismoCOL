import { max } from 'd3-array';
import type { Axis } from 'd3-axis';
import { format } from 'd3-format';
import { scaleBand, scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { useCallback } from 'react';
import type { MannKendall, PuntoSerieMensual } from '@/api/tipos';
import { ETIQUETAS_TENDENCIA, valorSen } from '@/lib/analisis';
import { formatearEntero, formatearMes, formatearNumero, formatearPValor } from '@/lib/formato';
import {
  ContenedorGrafica,
  Eje,
  ElementoLeyenda,
  ESTILO_GRAFICA,
  FilaTooltip,
  Leyenda,
  MARGENES_POR_DEFECTO,
  Tooltip,
  useTooltip,
} from './comun';

interface Props {
  serie: PuntoSerieMensual[];
  mannKendall: MannKendall;
  alto?: number;
}

const ALTO_POR_DEFECTO = 280;
const ANCHO_MINIMO_ETIQUETA_MES = 56;
const COLOR_BARRAS = '#9fcfda';
const COLOR_MEDIA = ESTILO_GRAFICA.colorSecundario;
const COLOR_SEN = ESTILO_GRAFICA.colorAcento;
const formatoConteo = format('~s');

interface DatoTooltip {
  punto: PuntoSerieMensual;
  indice: number;
}

export function ResumenMannKendall({ mk }: { mk: MannKendall }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div className="rounded-md bg-fondo px-3 py-2">
        <dt className="text-xs text-tinta-tenue">τ de Kendall</dt>
        <dd className="font-semibold tabular-nums">{formatearNumero(mk.tau, 3)}</dd>
      </div>
      <div className="rounded-md bg-fondo px-3 py-2">
        <dt className="text-xs text-tinta-tenue">p-valor (α = {formatearNumero(mk.alfa, 2)})</dt>
        <dd className="font-semibold tabular-nums">{formatearPValor(mk.pValor)}</dd>
      </div>
      <div className="rounded-md bg-fondo px-3 py-2">
        <dt className="text-xs text-tinta-tenue">Pendiente de Sen</dt>
        <dd className="font-semibold tabular-nums">{formatearNumero(mk.pendienteSen, 2)} eventos/mes</dd>
      </div>
      <div className="rounded-md bg-fondo px-3 py-2">
        <dt className="text-xs text-tinta-tenue">Tendencia</dt>
        <dd className="font-semibold">
          {ETIQUETAS_TENDENCIA[mk.tendencia]}{' '}
          <span className="text-xs font-normal text-tinta-tenue">
            ({mk.significativa ? 'significativa' : 'no significativa'})
          </span>
        </dd>
      </div>
    </dl>
  );
}

export function SerieMensual({ serie, mannKendall, alto = ALTO_POR_DEFECTO }: Props) {
  const { tooltip, mostrar, ocultar } = useTooltip<DatoTooltip>();
  const m = MARGENES_POR_DEFECTO;
  const ultimo = serie.length - 1;

  const maxY = Math.max(
    max(serie, (p) => p.eventos) ?? 0,
    valorSen(mannKendall, 0),
    valorSen(mannKendall, Math.max(ultimo, 0)),
  );

  const configurarY = useCallback((eje: Axis<number>) => eje.ticks(5).tickFormat((d) => formatoConteo(d)), []);

  return (
    <div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={`Eventos por mes durante ${serie.length} meses, con media móvil de 12 meses y recta de Sen`}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold capitalize">{formatearMes(tooltip.dato.punto.mes)}</p>
              <FilaTooltip etiqueta="Eventos" valor={formatearEntero(tooltip.dato.punto.eventos)} />
              <FilaTooltip etiqueta="Media móvil 12 m" valor={formatearNumero(tooltip.dato.punto.mediaMovil12, 1)} />
              <FilaTooltip etiqueta="Recta de Sen" valor={formatearNumero(valorSen(mannKendall, tooltip.dato.indice), 1)} />
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const x = scaleBand<string>()
            .domain(serie.map((p) => p.mes))
            .range([m.izquierda, ancho - m.derecha])
            .paddingInner(0.15);
          const y = scaleLinear()
            .domain([0, maxY || 1])
            .nice()
            .range([alto - m.abajo, m.arriba]);
          const centro = (mes: string) => (x(mes) ?? 0) + x.bandwidth() / 2;
          const cadaN = Math.max(1, Math.ceil((ANCHO_MINIMO_ETIQUETA_MES * serie.length) / Math.max(ancho, 1)));
          const configurarX = (eje: Axis<string>) =>
            eje.tickValues(serie.filter((_, i) => i % cadaN === 0).map((p) => p.mes)).tickFormat((mes) => formatearMes(mes));

          const lineaMedia = line<PuntoSerieMensual>()
            .defined((p) => p.mediaMovil12 !== null)
            .x((p) => centro(p.mes))
            .y((p) => y(p.mediaMovil12 ?? 0));

          const primero = serie[0];
          const final = serie[ultimo];
          const anchoPlot = ancho - m.izquierda - m.derecha;

          return (
            <>
              <Eje escala={y} orientacion="izquierda" x={m.izquierda} configurar={configurarY} rejilla={anchoPlot} />
              <Eje escala={x} orientacion="abajo" y={alto - m.abajo} configurar={configurarX} />
              {serie.map((p, i) => {
                const yTope = y(p.eventos);
                const altoBarra = Math.max(0, alto - m.abajo - yTope);
                return (
                  <g key={p.mes}>
                    <rect
                      x={x(p.mes)}
                      y={yTope}
                      width={x.bandwidth()}
                      height={altoBarra}
                      rx={Math.min(ESTILO_GRAFICA.radioBarra, x.bandwidth() / 2)}
                      fill={COLOR_BARRAS}
                      opacity={tooltip && tooltip.dato.indice !== i ? 0.6 : 1}
                    />
                    <rect
                      x={x(p.mes)}
                      y={m.arriba}
                      width={x.bandwidth()}
                      height={alto - m.abajo - m.arriba}
                      fill="transparent"
                      onMouseMove={(e) => mostrar(e, { punto: p, indice: i })}
                      onMouseLeave={ocultar}
                    />
                  </g>
                );
              })}
              <path
                d={lineaMedia(serie) ?? undefined}
                fill="none"
                stroke={COLOR_MEDIA}
                strokeWidth={ESTILO_GRAFICA.grosorLinea}
                pointerEvents="none"
              />
              {primero && final && (
                <line
                  x1={centro(primero.mes)}
                  x2={centro(final.mes)}
                  y1={y(valorSen(mannKendall, 0))}
                  y2={y(valorSen(mannKendall, ultimo))}
                  stroke={COLOR_SEN}
                  strokeWidth={ESTILO_GRAFICA.grosorLinea}
                  strokeDasharray="6 4"
                  pointerEvents="none"
                />
              )}
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        <ElementoLeyenda color={COLOR_BARRAS}>Eventos por mes</ElementoLeyenda>
        <ElementoLeyenda color={COLOR_MEDIA} tipo="linea">
          Media móvil 12 meses
        </ElementoLeyenda>
        <ElementoLeyenda color={COLOR_SEN} tipo="discontinua">
          Recta de Sen (y = intercepto + pendiente·t)
        </ElementoLeyenda>
      </Leyenda>
    </div>
  );
}
