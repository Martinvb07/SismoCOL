import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { mensajeDeError } from '@/api/cliente';
import { apiModelos, claves } from '@/api/endpoints';
import type { ReporteEntrenamiento } from '@/api/tipos';
import { Alerta, Boton, Giro, Insignia } from '@/componentes/ui/Basicos';
import { ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { estiloNivelImpacto } from '@/lib/escalasColor';
import { formatearEntero, formatearFechaHora, formatearNumero } from '@/lib/formato';

const SEGUNDO_MS = 1000;
const COLOR_BARRA = '#1f8fa6';
/** Intensidad máxima del sombreado de la matriz (0–1). */
const OPACIDAD_MAXIMA_CELDA = 0.85;
const UMBRAL_TEXTO_CLARO = 0.5;

function useCronometro(activo: boolean): number {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!activo) return;
    setSegundos(0);
    const inicio = Date.now();
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / SEGUNDO_MS)), SEGUNDO_MS);
    return () => clearInterval(id);
  }, [activo]);
  return segundos;
}

function Comparacion({ datos }: { datos: ReporteEntrenamiento['comparacion'] }) {
  const maximo = Math.max(...datos.map((d) => d.f1Macro), 0);
  return (
    <table className="tabla">
      <caption className="sr-only">F1 macro por algoritmo</caption>
      <thead>
        <tr>
          <th scope="col">Algoritmo</th>
          <th scope="col">F1 macro</th>
        </tr>
      </thead>
      <tbody>
        {[...datos]
          .sort((a, b) => b.f1Macro - a.f1Macro)
          .map((d) => (
            <tr key={d.algoritmo}>
              <td>
                {d.algoritmo} {d.f1Macro === maximo && <Insignia tono="marca">Mejor</Insignia>}
              </td>
              <td className="w-1/2">
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 rounded bg-fondo" aria-hidden="true">
                    <div className="h-3 rounded" style={{ width: `${d.f1Macro * 100}%`, backgroundColor: COLOR_BARRA }} />
                  </div>
                  <span className="w-12 text-right tabular-nums">{formatearNumero(d.f1Macro, 2)}</span>
                </div>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

function MatrizConfusion({ reporte }: { reporte: ReporteEntrenamiento }) {
  const maximo = Math.max(...reporte.matrizConfusion.flat(), 1);
  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <caption className="mb-1 text-left text-xs text-tinta-tenue">Filas: clase real · Columnas: clase predicha</caption>
        <thead>
          <tr>
            <th scope="col" className="p-1" />
            {reporte.clases.map((c) => (
              <th key={c} scope="col" className="p-1 text-xs font-semibold text-tinta-secundaria">
                {estiloNivelImpacto(c).etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {reporte.matrizConfusion.map((fila, i) => {
            const clase = reporte.clases[i];
            return (
              <tr key={clase ?? i}>
                <th scope="row" className="whitespace-nowrap p-1 text-right text-xs font-semibold text-tinta-secundaria">
                  {clase ? estiloNivelImpacto(clase).etiqueta : '—'}
                </th>
                {fila.map((valor, j) => {
                  const intensidad = (valor / maximo) * OPACIDAD_MAXIMA_CELDA;
                  return (
                    <td
                      key={j}
                      className={`h-12 w-20 border border-white text-center font-semibold tabular-nums ${i === j ? 'outline outline-1 outline-lateral' : ''}`}
                      style={{
                        backgroundColor: `rgba(31, 143, 166, ${intensidad})`,
                        color: intensidad > UMBRAL_TEXTO_CLARO ? '#fff' : '#1b2a30',
                      }}
                    >
                      {formatearEntero(valor)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PorClase({ reporte }: { reporte: ReporteEntrenamiento }) {
  return (
    <table className="tabla">
      <thead>
        <tr>
          <th scope="col">Clase</th>
          <th scope="col" className="text-right">
            Precisión
          </th>
          <th scope="col" className="text-right">
            Recall
          </th>
          <th scope="col" className="text-right">
            F1
          </th>
          <th scope="col" className="text-right">
            Soporte
          </th>
        </tr>
      </thead>
      <tbody>
        {reporte.clases.map((c) => {
          const m = reporte.porClase[c];
          return (
            <tr key={c}>
              <td>{estiloNivelImpacto(c).etiqueta}</td>
              <td className="text-right tabular-nums">{formatearNumero(m.precision, 2)}</td>
              <td className="text-right tabular-nums">{formatearNumero(m.recall, 2)}</td>
              <td className="text-right tabular-nums">{formatearNumero(m.f1, 2)}</td>
              <td className="text-right tabular-nums">{formatearEntero(m.soporte)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Entrenamiento() {
  const clienteConsultas = useQueryClient();
  const entrenar = useMutation({
    mutationFn: apiModelos.entrenar,
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: claves.modelos });
      void clienteConsultas.invalidateQueries({ queryKey: claves.resumen });
    },
  });
  const segundos = useCronometro(entrenar.isPending);

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-secundaria">
        Entrena árbol de decisión, Random Forest y regresión logística con validación cruzada estratificada y guarda el mejor por F1
        macro como una versión nueva (inactiva). Puede tardar unos 2 minutos.
      </p>
      <Boton onClick={() => entrenar.mutate()} cargando={entrenar.isPending}>
        Entrenar modelo
      </Boton>
      {entrenar.isPending && (
        <div role="status" className="flex items-center gap-2 rounded-md bg-primario-claro px-3 py-2 text-sm">
          <Giro className="text-primario" />
          Entrenando… {formatearEntero(segundos)} s transcurridos. No cierres esta página.
        </div>
      )}
      {entrenar.isError && <Alerta tipo="error">{mensajeDeError(entrenar.error)}</Alerta>}
      {entrenar.data && (
        <div className="space-y-4">
          <Alerta tipo="exito" titulo={`Modelo ${entrenar.data.modelo.version} entrenado`}>
            {entrenar.data.modelo.algoritmo} · exactitud {formatearNumero(entrenar.data.modelo.exactitud, 2)} · F1 macro{' '}
            {formatearNumero(entrenar.data.modelo.f1Macro, 2)}. Actívalo en la tabla de versiones para usarlo en las predicciones.
          </Alerta>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Comparación de algoritmos</h3>
              <Comparacion datos={entrenar.data.reporte.comparacion} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Matriz de confusión</h3>
              <MatrizConfusion reporte={entrenar.data.reporte} />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Reporte por clase</h3>
            <PorClase reporte={entrenar.data.reporte} />
          </div>
        </div>
      )}
    </div>
  );
}

export function VersionesModelo() {
  const clienteConsultas = useQueryClient();
  const modelos = useQuery({ queryKey: claves.modelos, queryFn: apiModelos.listar });
  const activar = useMutation({
    mutationFn: apiModelos.activar,
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: claves.modelos });
      void clienteConsultas.invalidateQueries({ queryKey: claves.resumen });
    },
  });

  return (
    <>
      {activar.isError && (
        <div className="mb-3">
          <Alerta tipo="error">{mensajeDeError(activar.error)}</Alerta>
        </div>
      )}
      <ContenidoConsulta consulta={modelos} esVacio={(m) => m.length === 0} vacio={<EstadoVacio titulo="No hay modelos entrenados" />}>
        {(lista) => (
          <div className="overflow-x-auto">
            <table className="tabla min-w-[44rem]">
              <thead>
                <tr>
                  <th scope="col">Versión</th>
                  <th scope="col">Algoritmo</th>
                  <th scope="col" className="text-right">
                    Exactitud
                  </th>
                  <th scope="col" className="text-right">
                    F1 macro
                  </th>
                  <th scope="col">Entrenado</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((m) => (
                  <tr key={m.idModelo}>
                    <td className="font-medium">{m.version}</td>
                    <td>{m.algoritmo}</td>
                    <td className="text-right tabular-nums">{formatearNumero(m.exactitud, 2)}</td>
                    <td className="text-right tabular-nums">{formatearNumero(m.f1Macro, 2)}</td>
                    <td className="whitespace-nowrap">{formatearFechaHora(m.fechaEntrenamiento)}</td>
                    <td>
                      {m.activo ? (
                        <Insignia tono="marca">Activo</Insignia>
                      ) : (
                        <Boton
                          variante="secundario"
                          tamano="sm"
                          onClick={() => activar.mutate(m.idModelo)}
                          cargando={activar.isPending && activar.variables === m.idModelo}
                          disabled={activar.isPending}
                        >
                          Activar
                        </Boton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ContenidoConsulta>
    </>
  );
}
