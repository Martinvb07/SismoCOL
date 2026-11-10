import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mensajeDeError } from '@/api/cliente';
import { apiAdmin } from '@/api/endpoints';
import type { RespuestaSincronizacion } from '@/api/tipos';
import { Alerta, Boton, Tarjeta } from '@/componentes/ui/Basicos';
import { IconoRecargar } from '@/componentes/ui/Iconos';
import { CargaArchivo } from './datos/CargaArchivo';
import { Entrenamiento, VersionesModelo } from './datos/Entrenamiento';
import { EncabezadoCargas, FilaCarga } from './TablaCargas';

interface PropsSincronizacion {
  accion: () => Promise<RespuestaSincronizacion>;
  descripcion: string;
  boton: string;
}

function Sincronizacion({ accion, descripcion, boton }: PropsSincronizacion) {
  const clienteConsultas = useQueryClient();
  const sincronizar = useMutation({
    mutationFn: accion,
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: ['cargas'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['admin'] });
    },
  });
  const r = sincronizar.data;

  return (
    <div className="space-y-3">
      <p className="text-sm text-tinta-secundaria">{descripcion}</p>
      <Boton onClick={() => sincronizar.mutate()} cargando={sincronizar.isPending}>
        <IconoRecargar /> {boton}
      </Boton>
      {sincronizar.isError && <Alerta tipo="error">{mensajeDeError(sincronizar.error)}</Alerta>}
      {r && (
        <>
          {r.errores.length > 0 && (
            <Alerta tipo="aviso" titulo={r.cargas.length > 0 ? 'Sincronización parcial' : 'Ninguna fuente respondió'}>
              <ul className="list-disc pl-4">
                {r.errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alerta>
          )}
          {r.cargas.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="tabla min-w-[52rem]">
                <EncabezadoCargas />
                <tbody>
                  {r.cargas.map((c) => (
                    <FilaCarga key={c.idCarga} c={c} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            r.errores.length === 0 && <Alerta tipo="info">No había registros nuevos.</Alerta>
          )}
        </>
      )}
    </div>
  );
}

export default function PaginaAdminDatos() {
  return (
    <>
      <Tarjeta titulo="Cargar archivo" descripcion="CSV o XLSX con sismos o reportes de daño. Se valida y se informa el resultado.">
        <CargaArchivo />
      </Tarjeta>
      <Tarjeta titulo="Sincronización con fuentes oficiales">
        <Sincronizacion
          accion={apiAdmin.sincronizar}
          boton="Sincronizar ahora"
          descripcion="Trae los eventos nuevos de USGS (FDSN) y los reportes de sismos de UNGRD (datos.gov.co). También corre a diario de forma automática."
        />
      </Tarjeta>
      <Tarjeta
        titulo="Catálogo histórico USGS"
        descripcion="Sismos M ≥ 4,5 desde 1973 (fuente USGS histórico). Se usa para tasas de sismos grandes y periodos de retorno; no se mezcla con el catálogo del SGC."
      >
        <Sincronizacion
          accion={apiAdmin.sincronizarHistorico}
          boton="Sincronizar catálogo histórico"
          descripcion="La primera vez descarga todo el catálogo (una consulta por año, puede tardar unos minutos); después solo actualiza desde el año del último evento."
        />
      </Tarjeta>
      <Tarjeta titulo="Entrenamiento del modelo de impacto">
        <Entrenamiento />
      </Tarjeta>
      <Tarjeta titulo="Versiones del modelo" descripcion="Solo una versión está activa; activarla desactiva las demás.">
        <VersionesModelo />
      </Tarjeta>
    </>
  );
}
