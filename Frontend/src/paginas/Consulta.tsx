import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiSismos, claves } from '@/api/endpoints';
import type { FiltrosSismos } from '@/api/tipos';
import { DatoClave, Tarjeta } from '@/componentes/ui/Basicos';
import { ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { HistogramaMagnitud } from '@/graficas/HistogramaMagnitud';
import { MapaColombia } from '@/graficas/MapaColombia';
import { formatearEntero, formatearFecha, formatearMagnitud, formatearProfundidad } from '@/lib/formato';
import { FormularioFiltros } from './consulta/FormularioFiltros';
import { TablaSismos } from './consulta/TablaSismos';

const FILTROS_INICIALES: FiltrosSismos = { incluirAnomalos: false };

export default function PaginaConsulta() {
  const [filtros, setFiltros] = useState<FiltrosSismos>(FILTROS_INICIALES);

  const departamentos = useQuery({ queryKey: claves.departamentos, queryFn: apiSismos.departamentos, staleTime: Infinity });
  const estadisticas = useQuery({
    queryKey: claves.estadisticas(filtros),
    queryFn: () => apiSismos.estadisticas(filtros),
  });

  return (
    <>
      <Tarjeta titulo="Filtros">
        <FormularioFiltros
          departamentos={departamentos.data ?? []}
          cargandoDepartamentos={departamentos.isPending}
          alAplicar={setFiltros}
        />
        {departamentos.isError && <p className="mt-2 text-xs text-[#b42828]">No se pudo cargar la lista de departamentos.</p>}
      </Tarjeta>

      <ContenidoConsulta
        consulta={estadisticas}
        textoCargando="Calculando estadísticas…"
        esVacio={(e) => e.total === 0}
        vacio={
          <Tarjeta>
            <EstadoVacio titulo="No hay sismos con estos filtros">Prueba ampliando el rango de fechas o de magnitud.</EstadoVacio>
          </Tarjeta>
        }
      >
        {(e) => (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <DatoClave etiqueta="Sismos" valor={formatearEntero(e.total)} />
              <DatoClave etiqueta="Magnitud máxima" valor={formatearMagnitud(e.magnitudMax)} />
              <DatoClave etiqueta="Profundidad mediana" valor={formatearProfundidad(e.profundidadMediana)} />
              <DatoClave
                etiqueta="Periodo"
                valor={<span className="text-base">{formatearFecha(e.rango.desde)} – {formatearFecha(e.rango.hasta)}</span>}
              />
            </dl>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
              <Tarjeta
                titulo="Mapa de sismos"
                descripcion={`${formatearEntero(e.puntos.length)} eventos con ubicación (se priorizan las magnitudes mayores)`}
                className="xl:col-span-3"
              >
                <MapaColombia puntos={e.puntos} departamentoResaltado={filtros.departamento} />
              </Tarjeta>
              <div className="space-y-4 xl:col-span-2">
                <Tarjeta titulo="Distribución de magnitudes" descripcion="Intervalos de 0,5">
                  <HistogramaMagnitud bins={e.histograma} />
                </Tarjeta>
                <Tarjeta titulo="Departamentos con más sismos">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Departamento</th>
                        <th scope="col" className="text-right">
                          Sismos
                        </th>
                        <th scope="col" className="text-right">
                          M máx.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.porDepartamento.slice(0, 8).map((d) => (
                        <tr key={d.departamento}>
                          <td>{d.departamento}</td>
                          <td className="text-right tabular-nums">{formatearEntero(d.total)}</td>
                          <td className="text-right tabular-nums">{formatearMagnitud(d.magnitudMax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Tarjeta>
              </div>
            </div>
          </>
        )}
      </ContenidoConsulta>

      <Tarjeta titulo="Listado de sismos">
        {/* La clave reinicia página y orden al cambiar los filtros */}
        <TablaSismos key={JSON.stringify(filtros)} filtros={filtros} />
      </Tarjeta>
    </>
  );
}
