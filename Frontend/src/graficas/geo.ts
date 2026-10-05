import { useQuery } from '@tanstack/react-query';
import type { FeatureCollection, Geometry } from 'geojson';
import { RUTA_GEOJSON_DEPARTAMENTOS } from '@/config';

export interface PropiedadesDepartamento {
  nombre: string;
  codigo: string;
}
export type ColeccionDepartamentos = FeatureCollection<Geometry, PropiedadesDepartamento>;

/** Carga el GeoJSON de departamentos (estático en /public/geo). */
export async function cargarDepartamentos(): Promise<ColeccionDepartamentos> {
  const respuesta = await fetch(new URL(RUTA_GEOJSON_DEPARTAMENTOS, window.location.origin));
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
