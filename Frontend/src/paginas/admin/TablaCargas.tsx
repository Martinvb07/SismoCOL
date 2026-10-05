import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiAdmin, claves } from '@/api/endpoints';
import type { Carga } from '@/api/tipos';
import { Insignia } from '@/componentes/ui/Basicos';
import { ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { Paginacion } from '@/componentes/ui/Paginacion';
import { ETIQUETAS_FUENTE } from '@/lib/etiquetas';
import { formatearEntero, formatearFechaHora } from '@/lib/formato';

const TAMANO_PAGINA_CARGAS = 10;

export function FilaCarga({ c }: { c: Carga }) {
  return (
    <tr>
      <td className="whitespace-nowrap">{formatearFechaHora(c.fechaCarga)}</td>
      <td>
        <Insignia tono={c.origen === 'API' ? 'marca' : 'neutro'}>{c.origen === 'API' ? 'API' : 'Archivo'}</Insignia>
      </td>
      <td>{ETIQUETAS_FUENTE[c.fuente]}</td>
      <td className="max-w-[14rem] truncate" title={c.nombreArchivo}>
        {c.nombreArchivo}
      </td>
      <td className="text-right tabular-nums">{formatearEntero(c.registrosLeidos)}</td>
      <td className="text-right tabular-nums">{formatearEntero(c.registrosValidos)}</td>
      <td>{c.estado === 'PROCESADO' ? 'Procesado' : <strong className="text-[#b42828]">Rechazado</strong>}</td>
      <td>{c.usuario?.nombre ?? 'Automática'}</td>
    </tr>
  );
}

export function EncabezadoCargas() {
  return (
    <thead>
      <tr>
        <th scope="col">Fecha</th>
        <th scope="col">Origen</th>
        <th scope="col">Fuente</th>
        <th scope="col">Archivo / recurso</th>
        <th scope="col" className="text-right">
          Leídos
        </th>
        <th scope="col" className="text-right">
          Válidos
        </th>
        <th scope="col">Estado</th>
        <th scope="col">Usuario</th>
      </tr>
    </thead>
  );
}

export function TablaCargas() {
  const [pagina, setPagina] = useState(1);
  const paginacion = { pagina, tamano: TAMANO_PAGINA_CARGAS };
  const consulta = useQuery({
    queryKey: claves.cargas(paginacion),
    queryFn: () => apiAdmin.cargas(paginacion),
    placeholderData: keepPreviousData,
  });
  return (
    <ContenidoConsulta consulta={consulta} esVacio={(d) => d.total === 0} vacio={<EstadoVacio titulo="Todavía no hay cargas" />}>
      {(d) => (
        <>
          <div className="overflow-x-auto">
            <table className="tabla min-w-[52rem]">
              <EncabezadoCargas />
              <tbody>
                {d.datos.map((c) => (
                  <FilaCarga key={c.idCarga} c={c} />
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={d.pagina} tamano={d.tamano} total={d.total} alCambiar={setPagina} cargando={consulta.isFetching} />
        </>
      )}
    </ContenidoConsulta>
  );
}
