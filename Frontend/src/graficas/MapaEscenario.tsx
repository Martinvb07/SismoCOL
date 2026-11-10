import { geoMercator, geoPath } from 'd3-geo';
import { scaleLinear } from 'd3-scale';
import type { Feature, Geometry } from 'geojson';
import type { CSSProperties } from 'react';
import type { MunicipioEscenario } from '@/api/tipos';
import { NIVELES_IMPACTO } from '@/api/tipos';
import { EstadoCargando, EstadoError } from '@/componentes/ui/Estados';
import { estiloNivelImpacto } from '@/lib/escalasColor';
import { formatearNumero, formatearPorcentaje } from '@/lib/formato';
import { ContenedorGrafica, ElementoLeyenda, FilaTooltip, Leyenda, Tooltip } from './comun';
import { useTooltip } from './estilo';
import { useDepartamentosGeo, type PropiedadesDepartamento } from './geo';

interface Props {
  municipios: MunicipioEscenario[];
  epicentro: { latitud: number; longitud: number };
  alto?: number;
}

const ALTO_POR_DEFECTO = 480;
const radio = scaleLinear().domain([3, 8]).range([2.5, 9]).clamp(true);

/** Municipios del escenario coloreados por nivel de impacto; el tamaño crece con la intensidad estimada. */
export function MapaEscenario({ municipios, epicentro, alto = ALTO_POR_DEFECTO }: Props) {
  const geo = useDepartamentosGeo();
  const { tooltip, mostrar, ocultar } = useTooltip<MunicipioEscenario>();
  if (geo.isPending) return <EstadoCargando texto="Cargando mapa…" alto="h-64" />;
  if (geo.isError) return <EstadoError error={geo.error} alReintentar={() => void geo.refetch()} />;
  const coleccion = geo.data;
  // Se pinta primero el impacto bajo para que el alto quede encima.
  const ordenados = [...municipios].sort((a, b) => NIVELES_IMPACTO.indexOf(a.nivelImpacto) - NIVELES_IMPACTO.indexOf(b.nivelImpacto));
  return (
    <div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={`Mapa del escenario con ${municipios.length} municipios coloreados por nivel de impacto estimado`}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold">
                {tooltip.dato.municipio} ({tooltip.dato.departamento})
              </p>
              <FilaTooltip etiqueta="Nivel" valor={estiloNivelImpacto(tooltip.dato.nivelImpacto).etiqueta} />
              <FilaTooltip etiqueta="Probabilidad" valor={formatearPorcentaje(tooltip.dato.probabilidad)} />
              <FilaTooltip etiqueta="Intensidad estimada" valor={formatearNumero(tooltip.dato.intensidadMmi, 1)} />
              <FilaTooltip etiqueta="Distancia hipocentral" valor={`${formatearNumero(tooltip.dato.distanciaHipocentralKm)} km`} />
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const proyeccion = geoMercator().fitSize([ancho, alto], coleccion);
          const camino = geoPath(proyeccion);
          const epi = proyeccion([epicentro.longitud, epicentro.latitud]);
          return (
            <>
              <g pointerEvents="none">
                {coleccion.features.map((f: Feature<Geometry, PropiedadesDepartamento>) => (
                  <path key={f.properties.codigo} d={camino(f) ?? undefined} fill="var(--mapa-relleno)" stroke="var(--mapa-borde)" strokeWidth={0.75} />
                ))}
              </g>
              {ordenados.map((m, i) => {
                const pos = proyeccion([m.longitud, m.latitud]);
                if (!pos) return null;
                return (
                  <circle
                    key={m.codigo}
                    cx={pos[0]}
                    cy={pos[1]}
                    r={radio(m.intensidadMmi)}
                    fill={estiloNivelImpacto(m.nivelImpacto).relleno}
                    fillOpacity={0.85}
                    stroke="#fff"
                    strokeWidth={0.5}
                    className="punto-aparece"
                    style={{ '--i': i } as CSSProperties}
                    onMouseMove={(e) => mostrar(e, m)}
                    onMouseLeave={ocultar}
                  />
                );
              })}
              {epi && (
                <g transform={`translate(${epi[0]},${epi[1]})`} pointerEvents="none">
                  <path d="M0,-9 L2.6,-2.8 9,-2.8 3.8,1.2 5.8,8 0,4 -5.8,8 -3.8,1.2 -9,-2.8 -2.6,-2.8 Z" fill="var(--grafica-tinta)" />
                </g>
              )}
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        {NIVELES_IMPACTO.map((n) => (
          <ElementoLeyenda key={n} color={estiloNivelImpacto(n).relleno} tipo="punto">
            {estiloNivelImpacto(n).etiqueta}
          </ElementoLeyenda>
        ))}
        <li className="text-tinta-tenue">El tamaño crece con la intensidad estimada; la estrella es el epicentro.</li>
      </Leyenda>
      <p className="mt-1 text-[11px] text-tinta-tenue">Límites: © colaboradores de OpenStreetMap, geoBoundaries (ODbL).</p>
    </div>
  );
}
