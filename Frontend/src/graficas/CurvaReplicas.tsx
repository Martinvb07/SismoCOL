import { max } from 'd3-array';
import type { Axis } from 'd3-axis';
import { format } from 'd3-format';
import { scaleLinear, scaleLog } from 'd3-scale';
import { area, curveStepAfter, line } from 'd3-shape';
import { useCallback } from 'react';
import type { PuntoCurvaReplicas } from '@/api/tipos';
import { formatearEntero, formatearNumero } from '@/lib/formato';
import { ContenedorGrafica, Eje, ElementoLeyenda, FilaTooltip, Leyenda, Tooltip } from './comun';
import { ESTILO_GRAFICA, MARGENES_POR_DEFECTO, useTooltip } from './estilo';

interface Props {
  curva: PuntoCurvaReplicas[];
  /** Días desde el principal hasta el último dato usado en el ajuste. */
  diasAjuste: number;
  mc: number;
  alto?: number;
}

const ALTO_POR_DEFECTO = 300;
const COLOR_OBSERVADO = ESTILO_GRAFICA.colorPrimario;
const COLOR_ESPERADO = ESTILO_GRAFICA.colorAcento;
const COLOR_BANDA = 'var(--grafica-barras)';
const COLOR_AJUSTE = ESTILO_GRAFICA.colorEje;
const formatoConteo = format('~s');

function etiquetaDias(d: number): string {
  if (d < 1) return `${formatearNumero(d * 24, d * 24 < 1 ? 1 : 0)} h`;
  return `${formatearNumero(d, d < 10 ? 1 : 0)} d`;
}

/** Acumulado de réplicas ≥ Mc: observado (escalones) contra esperado por Reasenberg-Jones con banda del 95 %. */
export function CurvaReplicas({ curva, diasAjuste, mc, alto = ALTO_POR_DEFECTO }: Props) {
  const { tooltip, mostrar, ocultar } = useTooltip<PuntoCurvaReplicas>();
  const m = { ...MARGENES_POR_DEFECTO, izquierda: 60, abajo: 48 };
  const maxY = Math.max(max(curva, (p) => p.superior) ?? 0, max(curva, (p) => p.observado ?? 0) ?? 0, 1);
  const dias = curva.map((p) => p.dias);
  const minX = Math.max(Math.min(...dias), 0.005);
  const maxX = Math.max(...dias, minX * 10);

  const configurarY = useCallback((eje: Axis<number>) => eje.ticks(5).tickFormat((d) => formatoConteo(d)), []);
  const configurarX = useCallback(
    (eje: Axis<number>) =>
      eje.tickValues([0.01, 0.1, 1, 7, 30, 100, 365, 1000].filter((v) => v >= minX && v <= maxX)).tickFormat((d) => etiquetaDias(d)),
    [minX, maxX],
  );

  return (
    <div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={`Réplicas acumuladas de magnitud mayor o igual a ${formatearNumero(mc, 1)}: observado contra esperado por el modelo de Reasenberg y Jones`}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold">{etiquetaDias(tooltip.dato.dias)} después del principal</p>
              <FilaTooltip etiqueta="Observadas" valor={tooltip.dato.observado === null ? 'sin datos' : formatearEntero(tooltip.dato.observado)} />
              <FilaTooltip etiqueta="Esperadas" valor={formatearNumero(tooltip.dato.esperado, 1)} />
              <FilaTooltip etiqueta="IC 95 %" valor={`${formatearEntero(tooltip.dato.inferior)} – ${formatearEntero(tooltip.dato.superior)}`} />
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const x = scaleLog()
            .domain([minX, maxX])
            .range([m.izquierda, ancho - m.derecha])
            .clamp(true);
          const y = scaleLinear()
            .domain([0, maxY])
            .nice()
            .range([alto - m.abajo, m.arriba]);
          const banda = area<PuntoCurvaReplicas>()
            .x((p) => x(p.dias))
            .y0((p) => y(p.inferior))
            .y1((p) => y(p.superior));
          const esperado = line<PuntoCurvaReplicas>()
            .x((p) => x(p.dias))
            .y((p) => y(p.esperado));
          const observado = line<PuntoCurvaReplicas>()
            .defined((p) => p.observado !== null)
            .curve(curveStepAfter)
            .x((p) => x(p.dias))
            .y((p) => y(p.observado ?? 0));
          const anchoPlot = ancho - m.izquierda - m.derecha;
          const xAjuste = x(Math.max(diasAjuste, minX));

          return (
            <>
              <Eje
                escala={y}
                orientacion="izquierda"
                x={m.izquierda}
                configurar={configurarY}
                rejilla={anchoPlot}
                titulo="Réplicas acumuladas"
                tituloEn={(m.arriba + alto - m.abajo) / 2}
              />
              <Eje escala={x} orientacion="abajo" y={alto - m.abajo} configurar={configurarX} />
              <text x={(m.izquierda + ancho - m.derecha) / 2} y={alto - 6} textAnchor="middle" fontSize={ESTILO_GRAFICA.tamanoTexto} fill={ESTILO_GRAFICA.colorEje}>
                Tiempo desde el sismo (h = horas, d = días)
              </text>
              <path d={banda(curva) ?? undefined} fill={COLOR_BANDA} opacity={0.45} pointerEvents="none" className="banda-aparece" />
              <path d={esperado(curva) ?? undefined} fill="none" stroke={COLOR_ESPERADO} strokeWidth={ESTILO_GRAFICA.grosorLinea} strokeDasharray="6 4" pointerEvents="none" className="trazo-aparece" />
              <path d={observado(curva) ?? undefined} fill="none" stroke={COLOR_OBSERVADO} strokeWidth={ESTILO_GRAFICA.grosorLinea + 0.5} strokeLinejoin="round" pointerEvents="none" pathLength={1} className="trazo-dibujado" />
              <line x1={xAjuste} x2={xAjuste} y1={m.arriba} y2={alto - m.abajo} stroke={COLOR_AJUSTE} strokeDasharray="2 3" pointerEvents="none" />
              <text x={xAjuste + 4} y={m.arriba + 10} fontSize={ESTILO_GRAFICA.tamanoTexto} fill={COLOR_AJUSTE}>
                datos hasta aquí
              </text>
              {curva.map((p, i) => {
                const siguiente = curva[i + 1];
                const anterior = curva[i - 1];
                const x0 = anterior ? (x(anterior.dias) + x(p.dias)) / 2 : m.izquierda;
                const x1 = siguiente ? (x(p.dias) + x(siguiente.dias)) / 2 : ancho - m.derecha;
                return (
                  <rect
                    key={p.dias}
                    x={x0}
                    y={m.arriba}
                    width={Math.max(0, x1 - x0)}
                    height={alto - m.abajo - m.arriba}
                    fill="transparent"
                    onMouseMove={(e) => mostrar(e, p)}
                    onMouseLeave={ocultar}
                  />
                );
              })}
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        <ElementoLeyenda color={COLOR_OBSERVADO} tipo="linea">
          Réplicas registradas (magnitud {formatearNumero(mc, 1)} o mayor)
        </ElementoLeyenda>
        <ElementoLeyenda color={COLOR_ESPERADO} tipo="discontinua">
          Réplicas esperadas por el modelo
        </ElementoLeyenda>
        <ElementoLeyenda color={COLOR_BANDA}>Rango probable (95 de cada 100 casos)</ElementoLeyenda>
      </Leyenda>
    </div>
  );
}
