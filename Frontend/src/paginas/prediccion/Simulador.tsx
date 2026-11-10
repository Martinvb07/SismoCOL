import { useMutation } from '@tanstack/react-query';
import { mensajeDeError } from '@/api/cliente';
import { apiModelos } from '@/api/endpoints';
import type { CuerpoPrediccion, RespuestaEscenario } from '@/api/tipos';
import { NIVELES_IMPACTO } from '@/api/tipos';
import { Alerta, Boton, InsigniaEstado } from '@/componentes/ui/Basicos';
import { EstadoVacio } from '@/componentes/ui/Estados';
import { EnPalabrasSimples, Semaforo, Termino } from '@/componentes/ui/Explicacion';
import { resumenEscenario } from '@/lib/resumenes';
import { EXPLICACION_IMPACTO } from '@/umbralesSemaforo';
import { MapaEscenario } from '@/graficas/MapaEscenario';
import { estiloNivelImpacto } from '@/lib/escalasColor';
import { formatearEntero, formatearMagnitud, formatearNumero, formatearPorcentaje } from '@/lib/formato';

function Resumen({ r }: { r: RespuestaEscenario }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {[...NIVELES_IMPACTO].reverse().map((n) => {
        const estilo = estiloNivelImpacto(n);
        return (
          <div key={n} className="rounded-md border px-3 py-2" style={{ borderColor: estilo.borde, backgroundColor: estilo.fondo }}>
            <dt className="text-xs" style={{ color: estilo.texto }}>
              {estilo.etiqueta}
            </dt>
            <dd className="text-lg font-semibold tabular-nums" style={{ color: estilo.texto }}>
              {formatearEntero(r.municipios.filter((m) => m.nivelImpacto === n).length)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Simulador: estima intensidad y nivel de impacto en todos los municipios cercanos al epicentro. */
export function Simulador({ entrada }: { entrada: CuerpoPrediccion | null }) {
  const escenario = useMutation({ mutationFn: apiModelos.escenario });
  const r = escenario.data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-secundaria">
        Usa la magnitud, la profundidad y el punto del formulario. Para cada municipio a menos de 300 km donde el sismo se sentiría, se estima qué
        tan fuerte sería la sacudida (<Termino termino="mmi">intensidad</Termino>) y el nivel de <Termino termino="impacto">impacto</Termino>.
      </p>
      <Boton variante="secundario" onClick={() => entrada && escenario.mutate(entrada)} cargando={escenario.isPending} disabled={!entrada}>
        Simular escenario
      </Boton>
      {escenario.isError && <Alerta tipo="error">{mensajeDeError(escenario.error)}</Alerta>}
      {!r && !escenario.isError && <EstadoVacio titulo="Aún no hay escenario">Completa el formulario y pulsa «Simular escenario».</EstadoVacio>}
      {r && (
        <div className="space-y-4">
          {(() => {
            const resumen = resumenEscenario(r);
            return (
              <EnPalabrasSimples semaforo={<Semaforo nivel={resumen.nivel} titulo="Impacto" explicacion={EXPLICACION_IMPACTO} />}>
                <p>{resumen.texto}</p>
              </EnPalabrasSimples>
            );
          })()}
          <p className="text-sm">
            {formatearMagnitud(r.entrada.magnitud)} a {formatearNumero(r.entrada.profundidadKm)} km de profundidad en{' '}
            {formatearNumero(r.entrada.latitud, 2)}, {formatearNumero(r.entrada.longitud, 2)} ·{' '}
            <strong>{formatearEntero(r.municipios.length)} municipios</strong> a menos de 300 km donde el sismo se sentiría · modelo {r.modelo.version}
          </p>
          {!r.modeloUsaDistancia && (
            <Alerta tipo="aviso" titulo="El modelo activo no usa la distancia">
              Es un modelo anterior a la fase 5 (magnitud, profundidad y ubicación): no distingue municipios cercanos de lejanos. Entrena y activa
              un modelo nuevo para un escenario realista.
            </Alerta>
          )}
          <Resumen r={r} />
          <h3 className="text-sm font-semibold">Los municipios más cercanos al epicentro sentirían la sacudida más fuerte</h3>
          <MapaEscenario municipios={r.municipios} epicentro={r.entrada} />
          <div className="max-h-[28rem] overflow-auto">
            <table className="tabla min-w-[48rem]">
              <caption className="sr-only">Municipios del escenario ordenados por nivel de impacto e intensidad</caption>
              <thead className="sticky top-0">
                <tr>
                  <th scope="col">Municipio</th>
                  <th scope="col">Nivel</th>
                  <th scope="col" className="text-right">
                    Probabilidad
                  </th>
                  <th scope="col" className="text-right">
                    Probabilidad de impacto alto
                  </th>
                  <th scope="col" className="text-right">
                    <Termino termino="mmi">Intensidad</Termino>
                  </th>
                  <th scope="col" className="text-right">
                    Distancia
                  </th>
                  <th scope="col" className="text-right">
                    Población 2018
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.municipios.map((m) => (
                  <tr key={m.codigo}>
                    <td className="font-medium">
                      {m.municipio} <span className="text-xs font-normal text-tinta-tenue">({m.departamento})</span>
                    </td>
                    <td>
                      <InsigniaEstado estilo={estiloNivelImpacto(m.nivelImpacto)} />
                    </td>
                    <td className="text-right tabular-nums">{formatearPorcentaje(m.probabilidad)}</td>
                    <td className="text-right tabular-nums">{formatearPorcentaje(m.probabilidades.ALTO)}</td>
                    <td className="text-right tabular-nums">{formatearNumero(m.intensidadMmi, 1)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatearNumero(m.distanciaHipocentralKm)} km</td>
                    <td className="text-right tabular-nums">{m.poblacion === null ? '—' : formatearEntero(m.poblacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
