import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { mensajeDeError } from '@/api/cliente';
import { apiSismos, claves } from '@/api/endpoints';
import type { FiltrosSismos, OrdenSismos, Sismo } from '@/api/tipos';
import { Alerta, Boton, Insignia, InsigniaEstado } from '@/componentes/ui/Basicos';
import { ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { IconoCentroide, IconoDescarga, IconoOrden } from '@/componentes/ui/Iconos';
import { Paginacion } from '@/componentes/ui/Paginacion';
import { TAMANO_PAGINA_POR_DEFECTO } from '@/config';
import { descargarBlob } from '@/lib/descargas';
import { estiloMagnitud, estiloNivelImpacto } from '@/lib/escalasColor';
import { ETIQUETAS_FUENTE } from '@/lib/etiquetas';
import { fechaIsoBogota, formatearFechaHora, formatearMagnitud, formatearProfundidad } from '@/lib/formato';

type Columna = 'fecha' | 'magnitud';

function direccion(orden: OrdenSismos, columna: Columna): 'asc' | 'desc' | null {
  if (!orden.startsWith(columna)) return null;
  return orden.endsWith('asc') ? 'asc' : 'desc';
}

function siguienteOrden(orden: OrdenSismos, columna: Columna): OrdenSismos {
  const actual = direccion(orden, columna);
  return `${columna}_${actual === 'desc' ? 'asc' : 'desc'}` as OrdenSismos;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

function EncabezadoOrdenable({ columna, orden, alCambiar, children }: { columna: Columna; orden: OrdenSismos; alCambiar: (o: OrdenSismos) => void; children: string }) {
  const dir = direccion(orden, columna);
  return (
    <th scope="col" aria-sort={dir ? ARIA_SORT[dir] : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-tinta" onClick={() => alCambiar(siguienteOrden(orden, columna))}>
        {children}
        <IconoOrden direccion={dir} />
      </button>
    </th>
  );
}

function FilaSismo({ sismo }: { sismo: Sismo }) {
  return (
    <tr>
      <td className="whitespace-nowrap tabular-nums">{formatearFechaHora(sismo.fechaHora)}</td>
      <td>
        <InsigniaEstado estilo={estiloMagnitud(sismo.magnitud)}>{formatearMagnitud(sismo.magnitud)}</InsigniaEstado>
      </td>
      <td className="whitespace-nowrap tabular-nums">{formatearProfundidad(sismo.profundidadKm)}</td>
      <td>{sismo.departamento ?? '—'}</td>
      <td>
        <span className="inline-flex items-center gap-1">
          {sismo.municipio ?? '—'}
          {sismo.precisionUbicacion === 'CENTROIDE_MUNICIPIO' && (
            <span title="Ubicación aproximada: centroide del municipio" className="inline-flex items-center gap-0.5 text-xs text-tinta-tenue">
              <IconoCentroide titulo="Centroide municipal" />
              <span className="sr-only sm:not-sr-only">centroide</span>
            </span>
          )}
        </span>
      </td>
      <td>{ETIQUETAS_FUENTE[sismo.fuente]}</td>
      <td>
        <div className="flex flex-wrap gap-1">
          {sismo.nivelImpacto && <InsigniaEstado estilo={estiloNivelImpacto(sismo.nivelImpacto)} />}
          {sismo.esReplica && <Insignia>Réplica</Insignia>}
          {sismo.esAnomalo && <Insignia>Anómalo: {sismo.motivoAnomalia ?? 'sin motivo'}</Insignia>}
        </div>
      </td>
    </tr>
  );
}

export function TablaSismos({ filtros }: { filtros: FiltrosSismos }) {
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<OrdenSismos>('fecha_desc');
  const paginacion = { pagina, tamano: TAMANO_PAGINA_POR_DEFECTO };

  const consulta = useQuery({
    queryKey: claves.sismos(filtros, paginacion, orden),
    queryFn: () => apiSismos.listar(filtros, paginacion, orden),
    placeholderData: keepPreviousData,
  });

  const exportar = useMutation({
    mutationFn: () => apiSismos.exportar(filtros),
    onSuccess: (blob) => descargarBlob(blob, `sismocol-sismos-${fechaIsoBogota()}.csv`),
  });

  const cambiarOrden = (nuevo: OrdenSismos) => {
    setOrden(nuevo);
    setPagina(1);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs text-tinta-tenue">
          <IconoCentroide /> Ubicación aproximada al centroide del municipio (sin epicentro).
        </p>
        <Boton variante="secundario" onClick={() => exportar.mutate()} cargando={exportar.isPending}>
          <IconoDescarga /> Exportar CSV
        </Boton>
      </div>
      {exportar.isError && (
        <div className="mb-3">
          <Alerta tipo="error">No se pudo exportar: {mensajeDeError(exportar.error)}</Alerta>
        </div>
      )}
      <ContenidoConsulta
        consulta={consulta}
        esVacio={(d) => d.total === 0}
        vacio={<EstadoVacio titulo="No hay sismos con estos filtros">Prueba ampliando el rango de fechas o de magnitud.</EstadoVacio>}
      >
        {(datos) => (
          <>
            <div className="overflow-x-auto" aria-busy={consulta.isFetching}>
              <table className="tabla min-w-[56rem]">
                <caption className="sr-only">Sismos registrados, ordenados por {orden.startsWith('fecha') ? 'fecha' : 'magnitud'}</caption>
                <thead>
                  <tr>
                    <EncabezadoOrdenable columna="fecha" orden={orden} alCambiar={cambiarOrden}>
                      Fecha (hora Colombia)
                    </EncabezadoOrdenable>
                    <EncabezadoOrdenable columna="magnitud" orden={orden} alCambiar={cambiarOrden}>
                      Magnitud
                    </EncabezadoOrdenable>
                    <th scope="col">Profundidad</th>
                    <th scope="col">Departamento</th>
                    <th scope="col">Municipio</th>
                    <th scope="col">Fuente</th>
                    <th scope="col">Observaciones</th>
                  </tr>
                </thead>
                <tbody className={consulta.isPlaceholderData ? 'opacity-60' : undefined}>
                  {datos.datos.map((s) => (
                    <FilaSismo key={s.idSismo} sismo={s} />
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={datos.pagina} tamano={datos.tamano} total={datos.total} alCambiar={setPagina} cargando={consulta.isFetching} />
          </>
        )}
      </ContenidoConsulta>
    </div>
  );
}
