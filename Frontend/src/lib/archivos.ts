import { EXTENSIONES_ARCHIVO_PERMITIDAS, TAMANO_MAXIMO_ARCHIVO_BYTES } from '@/config';
import { formatearBytes } from './formato';

/** Valida extensión y tamaño de un archivo de carga. Devuelve el mensaje de error o null. */
export function validarArchivoCarga(archivo: Pick<File, 'name' | 'size'>): string | null {
  const nombre = archivo.name.toLowerCase();
  if (!EXTENSIONES_ARCHIVO_PERMITIDAS.some((ext) => nombre.endsWith(ext))) return 'Solo se admiten archivos CSV o XLSX.';
  if (archivo.size > TAMANO_MAXIMO_ARCHIVO_BYTES) return `El archivo supera ${formatearBytes(TAMANO_MAXIMO_ARCHIVO_BYTES)}.`;
  if (archivo.size === 0) return 'El archivo está vacío.';
  return null;
}
