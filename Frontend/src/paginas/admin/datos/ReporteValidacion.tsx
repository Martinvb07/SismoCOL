import type { ReporteCarga } from '@/api/tipos';
import { Alerta, DatoClave } from '@/componentes/ui/Basicos';
import { ETIQUETAS_CAMPO_MAPEO, ETIQUETAS_FUENTE } from '@/lib/etiquetas';
import { formatearEntero } from '@/lib/formato';

export function ReporteValidacion({ reporte }: { reporte: ReporteCarga }) {
  const mapeo = Object.entries(reporte.mapeo);
  const motivos = [...new Set(reporte.porFuente.flatMap((f) => Object.keys(f.porMotivo)))].sort();

  return (
    <div className="space-y-4">
      {reporte.avisos.length > 0 && (
        <Alerta tipo="aviso" titulo="Avisos de la carga">
          <ul className="list-disc pl-4">
            {reporte.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alerta>
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DatoClave etiqueta="Leídos" valor={formatearEntero(reporte.leidos)} />
        <DatoClave etiqueta="Válidos" valor={formatearEntero(reporte.validos)} />
        <DatoClave etiqueta="Rechazados sin fecha" valor={formatearEntero(reporte.rechazadosSinFecha)} />
      </dl>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Mapeo de columnas</h3>
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Campo SismoCol</th>
                <th scope="col">Columna del archivo</th>
              </tr>
            </thead>
            <tbody>
              {mapeo.map(([campo, columna]) => (
                <tr key={campo}>
                  <td>{ETIQUETAS_CAMPO_MAPEO[campo] ?? campo}</td>
                  <td>
                    <code className="rounded bg-fondo px-1 text-xs">{columna}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reporte.columnasIgnoradas.length > 0 && (
            <p className="mt-2 text-xs text-tinta-tenue">Columnas ignoradas: {reporte.columnasIgnoradas.join(', ')}</p>
          )}
        </div>

        <div className="overflow-x-auto">
          <h3 className="mb-2 text-sm font-semibold">Resultado por fuente</h3>
          <table className="tabla min-w-[34rem]">
            <thead>
              <tr>
                <th scope="col">Fuente</th>
                <th scope="col" className="text-right">
                  Leídos
                </th>
                <th scope="col" className="text-right">
                  Válidos
                </th>
                <th scope="col" className="text-right">
                  Nuevos
                </th>
                <th scope="col" className="text-right">
                  Existentes
                </th>
              </tr>
            </thead>
            <tbody>
              {reporte.porFuente.map((f) => (
                <tr key={f.fuente}>
                  <th scope="row" className="!bg-transparent !text-sm !font-medium !normal-case !tracking-normal !text-tinta">
                    {ETIQUETAS_FUENTE[f.fuente]}
                  </th>
                  <td className="text-right tabular-nums">{formatearEntero(f.leidos)}</td>
                  <td className="text-right tabular-nums">{formatearEntero(f.validos)}</td>
                  <td className="text-right tabular-nums">{formatearEntero(f.nuevos)}</td>
                  <td className="text-right tabular-nums">{formatearEntero(f.existentes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-tinta-tenue">
            Ubicación:{' '}
            {reporte.porFuente
              .map(
                (f) =>
                  `${ETIQUETAS_FUENTE[f.fuente]} ${formatearEntero(f.conEpicentro)} con epicentro y ${formatearEntero(f.conCentroide)} con centroide` +
                  (f.conAfectacion ? `; ${formatearEntero(f.conAfectacion)} con afectación` : ''),
              )
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <h3 className="mb-2 text-sm font-semibold">Registros anómalos por motivo</h3>
        {motivos.length === 0 ? (
          <p className="text-sm text-tinta-tenue">No se marcaron registros anómalos.</p>
        ) : (
          <table className="tabla min-w-[30rem]">
            <thead>
              <tr>
                <th scope="col">Motivo</th>
                {reporte.porFuente.map((f) => (
                  <th key={f.fuente} scope="col" className="text-right">
                    {ETIQUETAS_FUENTE[f.fuente]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {motivos.map((m) => (
                <tr key={m}>
                  <td className="first-letter:uppercase">{m}</td>
                  {reporte.porFuente.map((f) => (
                    <td key={f.fuente} className="text-right tabular-nums">
                      {formatearEntero(f.porMotivo[m] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
