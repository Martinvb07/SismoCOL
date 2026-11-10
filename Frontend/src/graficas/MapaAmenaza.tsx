import { geoMercator, geoPath } from 'd3-geo';
import { scaleThreshold } from 'd3-scale';
import type { Feature, Geometry } from 'geojson';
import { useId } from 'react';
import type { CeldaAmenaza } from '@/api/tipos';
import { EstadoCargando, EstadoError } from '@/componentes/ui/Estados';
import { formatearEntero, formatearNumero, formatearPorcentaje } from '@/lib/formato';
import { ContenedorGrafica, ElementoLeyenda, FilaTooltip, Leyenda, Tooltip } from './comun';
import { useTooltip } from './estilo';
import { useDepartamentosGeo, type PropiedadesDepartamento } from './geo';

interface Props {
  celdas: CeldaAmenaza[];
  tamanoCelda: number;
  magnitud: number;
  anios: number;
  alto?: number;
}

const ALTO_POR_DEFECTO = 560;
const BORDE_DEPARTAMENTO = 'var(--mapa-borde)';
// Paleta secuencial (ColorBrewer OrRd, 6 clases): legible en tema claro y oscuro.
const UMBRALES = [0.01, 0.05, 0.1, 0.25, 0.5];
const COLORES = ['#fef0d9', '#fdd49e', '#fdbb84', '#fc8d59', '#e34a33', '#b30000'];
const color = scaleThreshold<number, string>().domain(UMBRALES).range(COLORES);

function etiquetaClase(i: number): string {
  const desde = i === 0 ? 0 : UMBRALES[i - 1] ?? 0;
  const hasta = UMBRALES[i];
  return hasta === undefined ? `≥ ${formatearPorcentaje(desde, 0)}` : `${formatearPorcentaje(desde, 0)} – ${formatearPorcentaje(hasta, 0)}`;
}

/** Probabilidad de al menos un sismo ≥ magnitud en `anios` por celda (sismicidad suavizada). */
export function MapaAmenaza({ celdas, tamanoCelda, magnitud, anios, alto = ALTO_POR_DEFECTO }: Props) {
  const geo = useDepartamentosGeo();
  const { tooltip, mostrar, ocultar } = useTooltip<CeldaAmenaza>();
  const idRecorte = useId();
  if (geo.isPending) return <EstadoCargando texto="Cargando mapa…" alto="h-64" />;
  if (geo.isError) return <EstadoError error={geo.error} alReintentar={() => void geo.refetch()} />;
  const coleccion = geo.data;
  const medio = tamanoCelda / 2;

  return (
    <div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={`Mapa de amenaza: probabilidad de al menos un sismo de magnitud ${formatearNumero(magnitud, 0)} o mayor en ${formatearNumero(anios, 0)} años, en celdas de ${formatearNumero(tamanoCelda, 1)} grados`}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold">
                Celda {formatearNumero(tooltip.dato.latitud, 2)}°, {formatearNumero(tooltip.dato.longitud, 2)}°
              </p>
              <FilaTooltip etiqueta={`Probabilidad en ${formatearNumero(anios, 0)} años`} valor={formatearPorcentaje(tooltip.dato.probabilidad10a)} />
              <FilaTooltip etiqueta="Sismos de magnitud 5 o más por año" valor={formatearNumero(tooltip.dato.tasaM5, 3)} />
              <FilaTooltip etiqueta="Sismos registrados en el cuadro" valor={formatearEntero(tooltip.dato.eventos)} />
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const proyeccion = geoMercator().fitSize([ancho, alto], coleccion);
          const camino = geoPath(proyeccion);
          return (
            <>
              <defs>
                <clipPath id={idRecorte}>
                  <rect x={0} y={0} width={ancho} height={alto} />
                </clipPath>
              </defs>
              <g clipPath={`url(#${idRecorte})`} className="capa-aparece">
                {celdas.map((c) => {
                  const a = proyeccion([c.longitud - medio, c.latitud + medio]);
                  const b = proyeccion([c.longitud + medio, c.latitud - medio]);
                  if (!a || !b) return null;
                  return (
                    <rect
                      key={`${c.latitud}|${c.longitud}`}
                      x={a[0]}
                      y={a[1]}
                      width={Math.max(0, b[0] - a[0])}
                      height={Math.max(0, b[1] - a[1])}
                      fill={color(c.probabilidad10a)}
                      fillOpacity={0.85}
                      onMouseMove={(e) => mostrar(e, c)}
                      onMouseLeave={ocultar}
                    />
                  );
                })}
              </g>
              <g pointerEvents="none">
                {coleccion.features.map((f: Feature<Geometry, PropiedadesDepartamento>) => (
                  <path key={f.properties.codigo} d={camino(f) ?? undefined} fill="none" stroke={BORDE_DEPARTAMENTO} strokeWidth={0.9} />
                ))}
              </g>
            </>
          );
        }}
      </ContenedorGrafica>
      <Leyenda>
        <li className="font-medium text-tinta-secundaria">
          Probabilidad de un sismo de magnitud {formatearNumero(magnitud, 0)} o más en {formatearNumero(anios, 0)} años:
        </li>
        {COLORES.map((c, i) => (
          <ElementoLeyenda key={c} color={c}>
            {etiquetaClase(i)}
          </ElementoLeyenda>
        ))}
      </Leyenda>
      <p className="mt-1 text-[11px] text-tinta-tenue">Límites: © colaboradores de OpenStreetMap, geoBoundaries (ODbL).</p>
    </div>
  );
}
