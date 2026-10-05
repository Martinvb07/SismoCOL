import { extent, max } from 'd3-array';
import type { Axis } from 'd3-axis';
import { format } from 'd3-format';
import { scaleLinear, scaleLog } from 'd3-scale';
import { useCallback, useId, useMemo, useState } from 'react';
import type { GutenbergRichter, PuntoGR } from '@/api/tipos';
import { rectaGutenbergRichter } from '@/lib/analisis';
import { formatearEntero, formatearNumero } from '@/lib/formato';
import { ContenedorGrafica, Eje, ElementoLeyenda, FilaTooltip, Leyenda, Tooltip } from './comun';
import { ESTILO_GRAFICA, MARGENES_POR_DEFECTO, useTooltip } from './estilo';

interface Props {
  gr: GutenbergRichter;
  alto?: number;
}

const ALTO_POR_DEFECTO = 300;
const RADIO_PUNTO = 4;
const MARGEN_MAGNITUD = 0.2;
const COLOR_ACUMULADO = ESTILO_GRAFICA.colorPrimario;
const COLOR_INCREMENTAL = '#7d8b91';
const COLOR_RECTA = ESTILO_GRAFICA.colorSecundario;
const COLOR_MC = ESTILO_GRAFICA.colorAcento;
const formatoPotencia = format('~s');

export function GraficaGutenbergRichter({ gr, alto = ALTO_POR_DEFECTO }: Props) {
  const [verIncremental, setVerIncremental] = useState(false);
  const { tooltip, mostrar, ocultar } = useTooltip<PuntoGR>();
  const idCasilla = useId();
  const m = { ...MARGENES_POR_DEFECTO, izquierda: 56 };

  const puntos = useMemo(() => gr.puntos.filter((p) => p.acumulado > 0), [gr.puntos]);
  const magnitudMaxima = max(puntos, (p) => p.magnitud) ?? gr.mc;
  const recta = useMemo(() => rectaGutenbergRichter(gr, magnitudMaxima), [gr, magnitudMaxima]);

  const [mMin = gr.mc, mMax = magnitudMaxima] = extent(puntos, (p) => p.magnitud);
  const nMax = Math.max(max(puntos, (p) => p.acumulado) ?? 1, recta[0].n);
  const nMin = Math.max(1, Math.min(...puntos.map((p) => p.acumulado), recta[1].n));

  const configurarX = useCallback((eje: Axis<number>) => eje.ticks(8).tickFormat((d) => formatearNumero(d, 1)), []);
  const configurarY = useCallback(
    (eje: Axis<number>) =>
      eje.ticks(5, '~s').tickFormat((d) => {
        const n = d;
        return Number.isInteger(Math.log10(n)) ? formatoPotencia(n) : '';
      }),
    [],
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="tabular-nums text-tinta-secundaria">
          <span className="font-semibold text-tinta">log₁₀ N = {formatearNumero(gr.a, 2)} − {formatearNumero(gr.b, 2)}·M</span>{' '}
          (anual) · b = {formatearNumero(gr.b, 2)} ± {formatearNumero(gr.errorB, 2)} · Mc = {formatearNumero(gr.mc, 1)} ·{' '}
          {formatearEntero(gr.nEventos)} eventos en {formatearNumero(gr.anios, 1)} años
        </p>
        <label htmlFor={idCasilla} className="flex items-center gap-2 text-tinta-secundaria">
          <input
            id={idCasilla}
            type="checkbox"
            checked={verIncremental}
            onChange={(e) => setVerIncremental(e.target.checked)}
            className="h-4 w-4 accent-primario"
          />
          Ver conteos incrementales
        </label>
      </div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={`Relación Gutenberg-Richter: b = ${formatearNumero(gr.b, 2)}, Mc = ${formatearNumero(gr.mc, 1)}`}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold">M ≥ {formatearNumero(tooltip.dato.magnitud, 1)}</p>
              <FilaTooltip etiqueta="N acumulado" valor={formatearEntero(tooltip.dato.acumulado)} />
              <FilaTooltip etiqueta="N incremental" valor={formatearEntero(tooltip.dato.incremental)} />
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const x = scaleLinear()
            .domain([Math.min(mMin, gr.mc) - MARGEN_MAGNITUD, mMax + MARGEN_MAGNITUD])
            .range([m.izquierda, ancho - m.derecha]);
          const y = scaleLog()
            .domain([Math.max(nMin * 0.8, 0.5), nMax * 1.2])
            .range([alto - m.abajo, m.arriba]);
          const anchoPlot = ancho - m.izquierda - m.derecha;
          const [inicio, fin] = recta;
          return (
            <>
              <Eje escala={y} orientacion="izquierda" x={m.izquierda} configurar={configurarY} rejilla={anchoPlot} />
              <Eje escala={x} orientacion="abajo" y={alto - m.abajo} configurar={configurarX} />
              <text x={ancho - m.derecha} y={alto - 4} textAnchor="end" fontSize={ESTILO_GRAFICA.tamanoTexto} fill={ESTILO_GRAFICA.colorEje}>
                Magnitud
              </text>
              <text
                transform={`translate(12,${m.arriba}) rotate(-90)`}
                textAnchor="end"
                fontSize={ESTILO_GRAFICA.tamanoTexto}
                fill={ESTILO_GRAFICA.colorEje}
              >
                N (escala log)
              </text>

              {/* Magnitud de completitud */}
              <line x1={x(gr.mc)} x2={x(gr.mc)} y1={m.arriba} y2={alto - m.abajo} stroke={COLOR_MC} strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={x(gr.mc) + 4} y={m.arriba + 10} fontSize={ESTILO_GRAFICA.tamanoTexto} fill={COLOR_MC}>
                Mc = {formatearNumero(gr.mc, 1)}
              </text>

              {/* Recta ajustada sobre conteos totales: log10 N = a + log10(años) − b·M */}
              <line
                x1={x(inicio.magnitud)}
                x2={x(fin.magnitud)}
                y1={y(inicio.n)}
                y2={y(fin.n)}
                stroke={COLOR_RECTA}
                strokeWidth={ESTILO_GRAFICA.grosorLinea}
              />

              {verIncremental &&
                puntos
                  .filter((p) => p.incremental > 0)
                  .map((p) => (
                    <circle
                      key={`i-${p.magnitud}`}
                      cx={x(p.magnitud)}
                      cy={y(p.incremental)}
                      r={RADIO_PUNTO - 1}
                      fill="#fff"
                      stroke={COLOR_INCREMENTAL}
                      strokeWidth={1.5}
                    />
                  ))}
              {puntos.map((p) => (
                <circle
                  key={`a-${p.magnitud}`}
                  cx={x(p.magnitud)}
                  cy={y(p.acumulado)}
                  r={tooltip?.dato === p ? RADIO_PUNTO + 2 : RADIO_PUNTO}
                  fill={COLOR_ACUMULADO}
                  stroke="#fff"
                  strokeWidth={1.5}
                  opacity={p.magnitud < gr.mc ? 0.45 : 1}
                  onMouseMove={(e) => mostrar(e, p)}
                  onMouseLeave={ocultar}
                />
              ))}
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        <ElementoLeyenda color={COLOR_ACUMULADO} tipo="punto">
          N(≥M) acumulado
        </ElementoLeyenda>
        {verIncremental && (
          <ElementoLeyenda color={COLOR_INCREMENTAL} tipo="punto">
            N incremental
          </ElementoLeyenda>
        )}
        <ElementoLeyenda color={COLOR_RECTA} tipo="linea">
          Recta ajustada (periodo completo)
        </ElementoLeyenda>
        <ElementoLeyenda color={COLOR_MC} tipo="discontinua">
          Magnitud de completitud
        </ElementoLeyenda>
      </Leyenda>
    </div>
  );
}
