import type { ReporteEntrenamiento } from '@/api/tipos';
import { NIVELES_IMPACTO } from '@/api/tipos';
import { Alerta, Insignia } from '@/componentes/ui/Basicos';
import { ImportanciaGlobal } from '@/graficas/BarrasShap';
import { CurvaConfiabilidad } from '@/graficas/CurvaConfiabilidad';
import { estiloNivelImpacto } from '@/lib/escalasColor';
import { formatearEntero, formatearNumero } from '@/lib/formato';

const ETIQUETAS_ORIGEN: Record<string, string> = {
  REPORTE: 'Reportes de daño',
  CONTROL_MISMO_EVENTO: 'Controles del mismo evento',
  SGC_SIN_REPORTE: 'Sismos SGC sin reporte',
};

function TablaComparacion({ reporte }: { reporte: ReporteEntrenamiento }) {
  const filas = [...reporte.comparacion].sort((a, b) => b.f1Macro - a.f1Macro);
  return (
    <div className="overflow-x-auto">
      <table className="tabla min-w-[56rem]">
        <caption className="sr-only">Comparación de modelos con validación cruzada</caption>
        <thead>
          <tr>
            <th scope="col">Modelo</th>
            <th scope="col" className="text-right">
              F1 macro
            </th>
            <th scope="col" className="text-right">
              Exactitud
            </th>
            <th scope="col" className="text-right">
              Brier
            </th>
            {NIVELES_IMPACTO.map((c) => (
              <th key={c} scope="col" className="text-right">
                F1 {estiloNivelImpacto(c).etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.algoritmo} className={f.algoritmo === reporte.elegido ? 'bg-primario-claro' : undefined}>
              <td className="font-medium">
                {f.algoritmo} {f.algoritmo === reporte.elegido && <Insignia tono="marca">Elegido</Insignia>}
              </td>
              <td className="text-right tabular-nums">{formatearNumero(f.f1Macro, 3)}</td>
              <td className="text-right tabular-nums">{formatearNumero(f.exactitud, 3)}</td>
              <td className="text-right tabular-nums">{formatearNumero(f.brier, 3)}</td>
              {NIVELES_IMPACTO.map((c) => (
                <td key={c} className="text-right tabular-nums">
                  {formatearNumero(f.porClase?.[c]?.f1, 2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reporte de un entrenamiento v2 (D18). Los modelos anteriores no traen estos campos. */
export function ReporteModelo({ reporte }: { reporte: ReporteEntrenamiento }) {
  const { activacion, calibracion, sinCalibrar, shap, confiabilidad } = reporte;
  return (
    <div className="space-y-5">
      {activacion && (
        <Alerta tipo={activacion.activado ? 'exito' : 'info'} titulo={activacion.activado ? 'Modelo activado' : 'Modelo no activado'}>
          {activacion.regla}. F1 macro del nuevo: {formatearNumero(activacion.f1MacroNuevo, 3)}
          {activacion.vigente
            ? `; vigente ${activacion.vigente.version}: ${formatearNumero(activacion.vigente.f1Macro ?? activacion.vigente.f1MacroRegistrado, 3)} (${activacion.comparadoCon ?? 'mismos pliegues'}).`
            : '; no había un modelo activo.'}
        </Alerta>
      )}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Comparación de modelos</h3>
        <p className="mb-2 text-xs text-tinta-tenue">{reporte.validacion}. Brier multiclase: menor es mejor.</p>
        <TablaComparacion reporte={reporte} />
      </div>
      {calibracion && sinCalibrar && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Calibración de probabilidades ({calibracion.metodo === 'isotonic' ? 'isotónica' : 'sigmoide'})</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-md bg-fondo px-3 py-2">
              <dt className="text-xs text-tinta-tenue">Brier sin calibrar</dt>
              <dd className="font-semibold tabular-nums">{formatearNumero(sinCalibrar.brier, 3)}</dd>
            </div>
            <div className="rounded-md bg-fondo px-3 py-2">
              <dt className="text-xs text-tinta-tenue">Brier calibrado</dt>
              <dd className="font-semibold tabular-nums">{formatearNumero(calibracion.brier, 3)}</dd>
            </div>
            <div className="rounded-md bg-fondo px-3 py-2">
              <dt className="text-xs text-tinta-tenue">F1 macro sin calibrar / calibrado</dt>
              <dd className="font-semibold tabular-nums">
                {formatearNumero(sinCalibrar.f1Macro, 3)} / {formatearNumero(calibracion.f1Macro, 3)}
              </dd>
            </div>
            <div className="rounded-md bg-fondo px-3 py-2">
              <dt className="text-xs text-tinta-tenue">Versión desplegada</dt>
              <dd className="font-semibold">{reporte.desplegado}</dd>
            </div>
          </dl>
          <p className="text-xs text-tinta-tenue">{reporte.criterioDespliegue}.</p>
          {confiabilidad && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <CurvaConfiabilidad curvas={confiabilidad.sinCalibrar} titulo="Sin calibrar" />
              <CurvaConfiabilidad curvas={confiabilidad.calibrado} titulo="Calibrado" />
            </div>
          )}
        </div>
      )}
      {shap && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Importancia global de las variables (SHAP)</h3>
          <p className="mb-2 text-xs text-tinta-tenue">
            {shap.metodo} sobre {formatearEntero(shap.muestra)} ejemplos; salida: {shap.salida}.
          </p>
          <ImportanciaGlobal importancia={shap.importancia} />
        </div>
      )}
      {reporte.composicion && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Datos de entrenamiento</h3>
          <p className="mb-2 text-xs text-tinta-tenue">
            {formatearEntero(reporte.ejemplos)} ejemplos; {formatearEntero(reporte.reportesConEpicentro)} de {formatearEntero(reporte.reportes)} reportes de daño
            con epicentro asociado (el resto usa el centroide del municipio).
          </p>
          <div className="overflow-x-auto">
            <table className="tabla min-w-[36rem]">
              <thead>
                <tr>
                  <th scope="col">Origen</th>
                  {NIVELES_IMPACTO.map((c) => (
                    <th key={c} scope="col" className="text-right">
                      {estiloNivelImpacto(c).etiqueta}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(reporte.composicion).map(([origen, conteos]) => (
                  <tr key={origen}>
                    <td>{ETIQUETAS_ORIGEN[origen] ?? origen}</td>
                    {NIVELES_IMPACTO.map((c) => (
                      <td key={c} className="text-right tabular-nums">
                        {formatearEntero(conteos[c] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {reporte.avisosDatos && reporte.avisosDatos.length > 0 && (
        <Alerta tipo="aviso" titulo="Avisos de los datos">
          <ul className="list-disc pl-4">
            {reporte.avisosDatos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alerta>
      )}
    </div>
  );
}
