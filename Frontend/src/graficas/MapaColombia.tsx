import { useQuery } from '@tanstack/react-query';
import { max } from 'd3-array';
import { geoMercator, geoPath } from 'd3-geo';
import { scaleSqrt } from 'd3-scale';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { useMemo } from 'react';
import type { PuntoMapa } from '@/api/tipos';
import { EstadoCargando, EstadoError } from '@/componentes/ui/Estados';
import { RUTA_GEOJSON_DEPARTAMENTOS } from '@/config';
import { colorMagnitud, LEYENDA_MAGNITUD } from '@/lib/escalasColor';
import { formatearFechaHora, formatearMagnitud, formatearNumero, formatearProfundidad } from '@/lib/formato';
import { ContenedorGrafica, ElementoLeyenda, FilaTooltip, Leyenda, Tooltip, useTooltip } from './comun';

export interface PropiedadesDepartamento {
  nombre: string;
  codigo: string;
}
export type ColeccionDepartamentos = FeatureCollection<Geometry, PropiedadesDepartamento>;

/** Carga el GeoJSON de departamentos (estático en /public). */
export async function cargarDepartamentos(): Promise<ColeccionDepartamentos> {
  const respuesta = await fetch(RUTA_GEOJSON_DEPARTAMENTOS);
  if (!respuesta.ok) throw new Error('No se pudo cargar el mapa de departamentos.');
  return (await respuesta.json()) as ColeccionDepartamentos;
}

export function useDepartamentosGeo() {
  return useQuery({
    queryKey: ['geo', 'departamentos'],
    queryFn: cargarDepartamentos,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

interface Props {
  puntos?: PuntoMapa[];
  alto?: number;
  /** Departamento a resaltar. */
  departamentoResaltado?: string;
  /** Si se define, el clic en el mapa devuelve la coordenada (latitud, longitud). */
  alHacerClic?: (coordenada: { latitud: number; longitud: number }) => void;
  /** Marcador único (p. ej. el punto elegido en la predicción). */
  marcador?: { latitud: number; longitud: number } | null;
  etiqueta?: string;
  mostrarLeyenda?: boolean;
}

const ALTO_POR_DEFECTO = 480;
const RADIO_MINIMO = 1.5;
const RADIO_MAXIMO = 14;
const MAGNITUD_MAXIMA_ESCALA = 7;
const RELLENO_DEPARTAMENTO = '#e9eef1';
const RELLENO_RESALTADO = '#cfe8ee';
const BORDE_DEPARTAMENTO = '#b8c4ca';
const DECIMALES_COORDENADA = 4;

export function MapaColombia({
  puntos = [],
  alto = ALTO_POR_DEFECTO,
  departamentoResaltado,
  alHacerClic,
  marcador,
  etiqueta,
  mostrarLeyenda = true,
}: Props) {
  const geo = useDepartamentosGeo();
  const { tooltip, mostrar, ocultar } = useTooltip<PuntoMapa>();

  // Pinta primero los sismos pequeños para que los grandes queden encima.
  const ordenados = useMemo(() => [...puntos].sort((a, b) => a.magnitud - b.magnitud), [puntos]);
  const radio = useMemo(() => {
    const magMax = Math.max(max(puntos, (p) => p.magnitud) ?? MAGNITUD_MAXIMA_ESCALA, MAGNITUD_MAXIMA_ESCALA);
    // El área del círculo crece con la magnitud
    return scaleSqrt().domain([0, magMax]).range([RADIO_MINIMO, RADIO_MAXIMO]).clamp(true);
  }, [puntos]);

  if (geo.isPending) return <EstadoCargando texto="Cargando mapa…" alto="h-64" />;
  if (geo.isError) return <EstadoError error={geo.error} alReintentar={() => void geo.refetch()} />;

  const coleccion = geo.data;
  const descripcion = etiqueta ?? `Mapa de Colombia con ${puntos.length} sismos coloreados por magnitud`;

  return (
    <div>
      <ContenedorGrafica
        alto={alto}
        etiqueta={descripcion}
        superpuesto={(ancho) =>
          tooltip && (
            <Tooltip x={tooltip.x} y={tooltip.y} anchoContenedor={ancho}>
              <p className="mb-1 font-semibold">{tooltip.dato.municipio ?? 'Municipio sin dato'}</p>
              <FilaTooltip etiqueta="Fecha" valor={formatearFechaHora(tooltip.dato.fechaHora)} />
              <FilaTooltip etiqueta="Magnitud" valor={formatearMagnitud(tooltip.dato.magnitud)} />
              <FilaTooltip etiqueta="Profundidad" valor={formatearProfundidad(tooltip.dato.profundidadKm)} />
            </Tooltip>
          )
        }
      >
        {(ancho) => {
          const proyeccion = geoMercator().fitSize([ancho, alto], coleccion);
          const camino = geoPath(proyeccion);
          const manejarClic = alHacerClic
            ? (e: React.MouseEvent<SVGRectElement>) => {
                const caja = e.currentTarget.getBoundingClientRect();
                const invertido = proyeccion.invert?.([e.clientX - caja.left, e.clientY - caja.top]);
                if (!invertido) return;
                const [longitud, latitud] = invertido;
                const redondear = (v: number) => Number(v.toFixed(DECIMALES_COORDENADA));
                alHacerClic({ latitud: redondear(latitud), longitud: redondear(longitud) });
              }
            : undefined;
          const posMarcador = marcador ? proyeccion([marcador.longitud, marcador.latitud]) : null;
          return (
            <>
              {alHacerClic && (
                <rect x={0} y={0} width={ancho} height={alto} fill="#f7fbfc" className="cursor-crosshair" onClick={manejarClic} />
              )}
              <g pointerEvents={alHacerClic ? 'none' : undefined}>
                {coleccion.features.map((f: Feature<Geometry, PropiedadesDepartamento>) => (
                  <path
                    key={f.properties.codigo}
                    d={camino(f) ?? undefined}
                    fill={f.properties.nombre === departamentoResaltado ? RELLENO_RESALTADO : RELLENO_DEPARTAMENTO}
                    stroke={BORDE_DEPARTAMENTO}
                    strokeWidth={0.75}
                  >
                    <title>{f.properties.nombre}</title>
                  </path>
                ))}
              </g>
              <g pointerEvents={alHacerClic ? 'none' : undefined}>
                {ordenados.map((p) => {
                  const pos = proyeccion([p.longitud, p.latitud]);
                  if (!pos) return null;
                  return (
                    <circle
                      key={p.idSismo}
                      cx={pos[0]}
                      cy={pos[1]}
                      r={radio(p.magnitud)}
                      fill={colorMagnitud(p.magnitud)}
                      fillOpacity={0.7}
                      stroke="#fff"
                      strokeWidth={0.75}
                      onMouseMove={(e) => mostrar(e, p)}
                      onMouseLeave={ocultar}
                    />
                  );
                })}
              </g>
              {posMarcador && (
                <g transform={`translate(${posMarcador[0]},${posMarcador[1]})`} pointerEvents="none">
                  <circle r={9} fill="none" stroke="#14323b" strokeWidth={2} />
                  <circle r={3} fill="#14323b" />
                </g>
              )}
            </>
          );
        }}
      </ContenedorGrafica>
      {mostrarLeyenda && (
        <Leyenda>
          {LEYENDA_MAGNITUD.map((e) => (
            <ElementoLeyenda key={e.etiqueta} color={e.relleno} tipo="punto">
              {e.etiqueta}
            </ElementoLeyenda>
          ))}
          <li className="text-tinta-tenue">El tamaño del círculo crece con la magnitud.</li>
        </Leyenda>
      )}
      {marcador && (
        <p className="sr-only" aria-live="polite">
          Punto elegido: latitud {formatearNumero(marcador.latitud, DECIMALES_COORDENADA)}, longitud{' '}
          {formatearNumero(marcador.longitud, DECIMALES_COORDENADA)}
        </p>
      )}
      <p className="mt-1 text-[11px] text-tinta-tenue">Límites: © colaboradores de OpenStreetMap, geoBoundaries (ODbL).</p>
    </div>
  );
}
