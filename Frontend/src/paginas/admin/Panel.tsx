import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiAdmin, claves } from '@/api/endpoints';
import { RUTAS } from '@/componentes/layout/navegacion';
import { DatoClave, Insignia, Tarjeta } from '@/componentes/ui/Basicos';
import { ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { ETIQUETAS_ACTIVIDAD } from '@/lib/etiquetas';
import { formatearEntero, formatearFechaHora, formatearNumero, formatearPorcentaje } from '@/lib/formato';
import { TablaCargas } from './TablaCargas';

export default function PaginaAdminPanel() {
  const resumen = useQuery({ queryKey: claves.resumen, queryFn: apiAdmin.resumen });

  return (
    <>
      <ContenidoConsulta consulta={resumen} textoCargando="Cargando resumen…">
        {(r) => (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <DatoClave
                etiqueta="Registros"
                valor={formatearEntero(r.registros)}
                detalle={`${formatearEntero(r.registrosValidos)} válidos (${formatearPorcentaje(r.registros ? r.registrosValidos / r.registros : 0)})`}
              />
              <DatoClave
                etiqueta="Modelo activo"
                valor={r.modeloActivo ? r.modeloActivo.version : 'Ninguno'}
                detalle={
                  r.modeloActivo ? `${r.modeloActivo.algoritmo} · F1 macro ${formatearNumero(r.modeloActivo.f1Macro, 2)}` : 'Entrena o activa un modelo'
                }
              />
              <DatoClave
                etiqueta="Usuarios"
                valor={formatearEntero(r.usuarios)}
                detalle={`${formatearEntero(r.usuariosActivos)} activos`}
              />
              <DatoClave
                etiqueta="ESP32"
                valor={!r.dispositivo ? 'Sin registrar' : r.dispositivo.estado === 'EN_LINEA' ? 'En línea' : 'Desconectado'}
                detalle={r.dispositivo ? `Última conexión: ${formatearFechaHora(r.dispositivo.ultimaConexion)}` : undefined}
              />
            </dl>

            <Tarjeta titulo="Actividad reciente">
              {r.actividadReciente.length === 0 ? (
                <EstadoVacio titulo="Sin actividad reciente" />
              ) : (
                <ul className="divide-y divide-borde">
                  {r.actividadReciente.map((a, i) => (
                    <li key={`${a.fecha}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Insignia tono="marca">{ETIQUETAS_ACTIVIDAD[a.tipo]}</Insignia>
                        <span>{a.descripcion}</span>
                      </div>
                      <span className="text-xs text-tinta-tenue">
                        {formatearFechaHora(a.fecha)} · {a.usuario ?? 'Sistema'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </>
        )}
      </ContenidoConsulta>

      <Tarjeta
        titulo="Historial de cargas"
        acciones={
          <Link to={RUTAS.adminDatos} className="text-sm font-medium text-primario-oscuro underline">
            Cargar datos
          </Link>
        }
      >
        <TablaCargas />
      </Tarjeta>
    </>
  );
}
