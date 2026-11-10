import type { Axis } from 'd3-axis';
import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { useCallback } from 'react';
import type { NivelImpacto, PuntoConfiabilidad } from '@/api/tipos';
import { NIVELES_IMPACTO } from '@/api/tipos';
import { estiloNivelImpacto } from '@/lib/escalasColor';
import { ContenedorGrafica, Eje, ElementoLeyenda, Leyenda } from './comun';
import { ESTILO_GRAFICA, MARGENES_POR_DEFECTO } from './estilo';

interface Props {
  curvas: Partial<Record<NivelImpacto, PuntoConfiabilidad[]>>;
  titulo: string;
  alto?: number;
}

const ALTO_POR_DEFECTO = 260;
const formatoProbabilidad = format('.0%');

/** Curva de confiabilidad uno-contra-resto por clase: probabilidad predicha contra frecuencia observada. */
export function CurvaConfiabilidad({ curvas, titulo, alto = ALTO_POR_DEFECTO }: Props) {
  const m = { ...MARGENES_POR_DEFECTO, abajo: 40 };
  const configurar = useCallback((eje: Axis<number>) => eje.ticks(5).tickFormat((d) => formatoProbabilidad(d)), []);
  const clases = NIVELES_IMPACTO.filter((c) => (curvas[c]?.length ?? 0) > 0);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">{titulo}</p>
      <ContenedorGrafica alto={alto} etiqueta={`Curva de confiabilidad (${titulo}): probabilidad predicha contra frecuencia observada por clase`}>
        {(ancho) => {
          const lado = Math.min(ancho - m.izquierda - m.derecha, alto - m.arriba - m.abajo);
          const x = scaleLinear().domain([0, 1]).range([m.izquierda, m.izquierda + lado]);
          const y = scaleLinear().domain([0, 1]).range([m.arriba + lado, m.arriba]);
          const trazo = line<PuntoConfiabilidad>()
            .x((p) => x(p.predicha))
            .y((p) => y(p.observada));
          return (
            <>
              <Eje escala={y} orientacion="izquierda" x={m.izquierda} configurar={configurar} rejilla={lado} />
              <Eje escala={x} orientacion="abajo" y={m.arriba + lado} configurar={configurar} />
              <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke={ESTILO_GRAFICA.colorEje} strokeDasharray="4 4" />
              {clases.map((c) => {
                const puntos = curvas[c] ?? [];
                const color = estiloNivelImpacto(c).relleno;
                return (
                  <g key={c}>
                    <path d={trazo(puntos) ?? undefined} fill="none" stroke={color} strokeWidth={ESTILO_GRAFICA.grosorLinea} />
                    {puntos.map((p, i) => (
                      <circle key={i} cx={x(p.predicha)} cy={y(p.observada)} r={3} fill={color} />
                    ))}
                  </g>
                );
              })}
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        {clases.map((c) => (
          <ElementoLeyenda key={c} color={estiloNivelImpacto(c).relleno} tipo="linea">
            {estiloNivelImpacto(c).etiqueta}
          </ElementoLeyenda>
        ))}
        <ElementoLeyenda color={ESTILO_GRAFICA.colorEje} tipo="discontinua">
          Calibración perfecta
        </ElementoLeyenda>
      </Leyenda>
    </div>
  );
}
