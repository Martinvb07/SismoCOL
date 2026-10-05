import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mensajeDeError } from '@/api/cliente';
import { AVISO_ALCANCE } from '@/config';
import { formatearFechaLarga } from '@/lib/formato';
import { Boton, Giro } from './Basicos';
import { IconoAlerta, IconoInfo, IconoRecargar } from './Iconos';

export function EstadoCargando({ texto = 'Cargando…', alto = 'h-40' }: { texto?: string; alto?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex ${alto} items-center justify-center gap-2 text-sm text-tinta-tenue`}>
      <Giro className="text-primario" />
      {texto}
    </div>
  );
}

export function EstadoError({ error, alReintentar }: { error: unknown; alReintentar?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-md border border-[#eea3a3] bg-[#fbe3e3] px-4 py-6 text-center text-sm text-[#931f1f]">
      <IconoAlerta className="h-6 w-6" />
      <p>{mensajeDeError(error)}</p>
      {alReintentar && (
        <Boton variante="secundario" tamano="sm" onClick={alReintentar}>
          <IconoRecargar /> Reintentar
        </Boton>
      )}
    </div>
  );
}

export function EstadoVacio({ titulo = 'Sin datos', children }: { titulo?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-borde px-4 py-8 text-center text-sm text-tinta-tenue">
      <IconoInfo className="h-6 w-6" />
      <p className="font-medium text-tinta-secundaria">{titulo}</p>
      {children}
    </div>
  );
}

interface PropsContenido<T> {
  consulta: UseQueryResult<T>;
  esVacio?: (datos: T) => boolean;
  vacio?: ReactNode;
  textoCargando?: string;
  alto?: string;
  children: (datos: T) => ReactNode;
}

/** Resuelve los estados de carga, error y vacío de una consulta. */
export function ContenidoConsulta<T>({ consulta, esVacio, vacio, textoCargando, alto, children }: PropsContenido<T>) {
  if (consulta.isPending) return <EstadoCargando texto={textoCargando} alto={alto} />;
  if (consulta.isError) return <EstadoError error={consulta.error} alReintentar={() => void consulta.refetch()} />;
  if (esVacio?.(consulta.data)) return <>{vacio ?? <EstadoVacio />}</>;
  return <>{children(consulta.data)}</>;
}

/** Aviso obligatorio en toda vista con probabilidades o advertencias. */
export function AvisoAlcance({ fechaCorte }: { fechaCorte?: string | null }) {
  return (
    <aside
      aria-label="Aviso de alcance"
      className="flex flex-col gap-1 rounded-md border border-[#f0d77a] bg-[#fdf5d8] px-4 py-3 text-sm text-[#5c4600] sm:flex-row sm:items-start sm:justify-between sm:gap-4"
    >
      <p className="flex gap-2">
        <IconoAlerta className="mt-0.5 shrink-0" />
        <span>{AVISO_ALCANCE}</span>
      </p>
      {fechaCorte !== undefined && (
        <p className="shrink-0 whitespace-nowrap font-semibold">Datos hasta {formatearFechaLarga(fechaCorte)}</p>
      )}
    </aside>
  );
}
