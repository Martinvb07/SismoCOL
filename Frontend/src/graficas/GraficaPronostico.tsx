import { max } from 'd3-array';
import type { Axis } from 'd3-axis';
import { format } from 'd3-format';
import { scaleLinear, scalePoint } from 'd3-scale';
import { area, line } from 'd3-shape';
import { useCallback } from 'react';
import type { PuntoPronostico } from '@/api/tipos';
import { formatearEntero, formatearMes, formatearNumero } from '@/lib/formato';
import { ContenedorGrafica, Eje, ElementoLeyenda, FilaTooltip, Leyenda, Tooltip } from './comun';
import { ESTILO_GRAFICA, MARGENES_POR_DEFECTO, useTooltip } from './estilo';

interface Props {
  serie: Array<{ mes: string; eventos: number }>;
  pronostico: PuntoPronostico[];
  alto?: number;
}

interface Punto {
  mes: string;
  eventos: number | null;
  p: PuntoPronostico | null;
}

const ALTO_POR_DEFECTO = 300;
const ANCHO_MINIMO_ETIQUETA_MES = 56;
const COLOR_SERIE = ESTILO_GRAFICA.colorPrimario;
const COLOR_PRONOSTICO = ESTILO_GRAFICA.colorAcento;
const COLOR_BANDA = 'var(--grafica-barras)';
const formatoConteo = format('~s');

/** Serie mensual observada y pronóstico de 12 meses con bandas del 80 y el 95 %. */
export function GraficaPronostico({ serie, pronostico, alto = ALTO_POR_DEFECTO }: Props) {
  const { tooltip, mostrar, ocultar } = useTooltip<Punto>();
  const m = { ...MARGENES_POR_DEFECTO, izquierda: 60 };
  const puntos: Punto[] = [
    ...serie.map((s) => ({ mes: s.mes, eventos: s.eventos, p: null })),
    ...pronostico.map((p) => ({ mes: p.mes, eventos: null, p })),
  ];
  const ultimo = serie[serie.length - 1];
  // La banda arranca en el último mes observado para que no quede un hueco.
  const banda: PuntoPronostico[] = ultimo
    ? [{ mes: ultimo.mes, valor: ultimo.eventos, inferior80: ultimo.eventos, superior80: ultimo.eventos, inferior95: ultimo.eventos, superior95: ultimo.eventos }, ...pronostico]
    : pronostico;
  const maxY = Math.max(max(serie, (s) => s.eventos) ?? 0, max(pronostico, (p) => p.superior95) ?? 0, 1);
  const configurarY = useCallback((eje: Axis<number>) => eje.ticks(5).tickFormat((d) => formatoConteo(d)), []);

  return (
    <div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={`Sismos por mes durante ${serie.length} meses y pronóstico de ${pronostico.length} meses con bandas del 80 y el 95 %`}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold capitalize">{formatearMes(tooltip.dato.mes)}</p>
              {tooltip.dato.eventos !== null && <FilaTooltip etiqueta="Observados" valor={formatearEntero(tooltip.dato.eventos)} />}
              {tooltip.dato.p && (
                <>
                  <FilaTooltip etiqueta="Pronóstico" valor={formatearNumero(tooltip.dato.p.valor, 1)} />
                  <FilaTooltip etiqueta="Banda 80 %" valor={`${formatearNumero(tooltip.dato.p.inferior80, 0)} – ${formatearNumero(tooltip.dato.p.superior80, 0)}`} />
                  <FilaTooltip etiqueta="Banda 95 %" valor={`${formatearNumero(tooltip.dato.p.inferior95, 0)} – ${formatearNumero(tooltip.dato.p.superior95, 0)}`} />
                </>
              )}
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const x = scalePoint<string>()
            .domain(puntos.map((p) => p.mes))
            .range([m.izquierda, ancho - m.derecha])
            .padding(0.3);
          const y = scaleLinear()
            .domain([0, maxY])
            .nice()
            .range([alto - m.abajo, m.arriba]);
          const cadaN = Math.max(1, Math.ceil((ANCHO_MINIMO_ETIQUETA_MES * puntos.length) / Math.max(ancho, 1)));
          const configurarX = (eje: Axis<string>) =>
            eje.tickValues(puntos.filter((_, i) => i % cadaN === 0).map((p) => p.mes)).tickFormat((mes) => formatearMes(mes));
          const xm = (mes: string) => x(mes) ?? 0;
          const area95 = area<PuntoPronostico>()
            .x((p) => xm(p.mes))
            .y0((p) => y(p.inferior95))
            .y1((p) => y(p.superior95));
          const area80 = area<PuntoPronostico>()
            .x((p) => xm(p.mes))
            .y0((p) => y(p.inferior80))
            .y1((p) => y(p.superior80));
          const lineaPronostico = line<PuntoPronostico>()
            .x((p) => xm(p.mes))
            .y((p) => y(p.valor));
          const lineaSerie = line<{ mes: string; eventos: number }>()
            .x((p) => xm(p.mes))
            .y((p) => y(p.eventos));
          const paso = x.step();
          const anchoPlot = ancho - m.izquierda - m.derecha;

          return (
            <>
              <Eje
                escala={y}
                orientacion="izquierda"
                x={m.izquierda}
                configurar={configurarY}
                rejilla={anchoPlot}
                titulo="Sismos por mes"
                tituloEn={(m.arriba + alto - m.abajo) / 2}
              />
              <Eje escala={x} orientacion="abajo" y={alto - m.abajo} configurar={configurarX} />
              <path d={area95(banda) ?? undefined} fill={COLOR_BANDA} opacity={0.35} pointerEvents="none" className="banda-aparece" />
              <path d={area80(banda) ?? undefined} fill={COLOR_BANDA} opacity={0.7} pointerEvents="none" className="banda-aparece" />
              <path d={lineaSerie(serie) ?? undefined} fill="none" stroke={COLOR_SERIE} strokeWidth={ESTILO_GRAFICA.grosorLinea} strokeLinejoin="round" pointerEvents="none" pathLength={1} className="trazo-dibujado" />
              <path
                d={lineaPronostico(banda) ?? undefined}
                fill="none"
                stroke={COLOR_PRONOSTICO}
                strokeWidth={ESTILO_GRAFICA.grosorLinea}
                strokeDasharray="6 4"
                pointerEvents="none"
                className="trazo-aparece"
              />
              {puntos.map((p) => (
                <rect
                  key={p.mes}
                  x={xm(p.mes) - paso / 2}
                  y={m.arriba}
                  width={paso}
                  height={alto - m.abajo - m.arriba}
                  fill="transparent"
                  onMouseMove={(e) => mostrar(e, p)}
                  onMouseLeave={ocultar}
                />
              ))}
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        <ElementoLeyenda color={COLOR_SERIE} tipo="linea">
          Sismos registrados cada mes
        </ElementoLeyenda>
        <ElementoLeyenda color={COLOR_PRONOSTICO} tipo="discontinua">
          Sismos esperados (pronóstico)
        </ElementoLeyenda>
        <ElementoLeyenda color={COLOR_BANDA}>Rango probable: 8 de cada 10 casos (oscuro) y 95 de cada 100 (claro)</ElementoLeyenda>
      </Leyenda>
    </div>
  );
}
