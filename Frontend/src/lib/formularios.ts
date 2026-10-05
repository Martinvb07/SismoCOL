import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { esErrorApi } from '@/api/cliente';

/**
 * Lleva los `detalles` de un error 400/409 de la API a los campos del formulario.
 * Devuelve true si al menos un detalle se asoció a un campo conocido.
 */
export function aplicarErroresApi<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, campos: readonly Path<T>[]): boolean {
  if (!esErrorApi(error)) return false;
  let aplicado = false;
  for (const detalle of error.detalles) {
    const campo = campos.find((c) => c === detalle.campo);
    if (campo) {
      setError(campo, { type: 'servidor', message: detalle.mensaje });
      aplicado = true;
    }
  }
  return aplicado;
}

/** Convierte el valor de un input numérico vacío en undefined (para Zod opcional). Acepta coma decimal. */
export function numeroOpcional(valor: unknown): number | undefined {
  if (valor === '' || valor === null || valor === undefined) return undefined;
  if (typeof valor === 'number') return Number.isNaN(valor) ? undefined : valor;
  if (typeof valor !== 'string') return undefined;
  const n = Number(valor.replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
}
