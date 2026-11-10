import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { apiAmenaza, claves } from '@/api/endpoints';
import type { CabeceraAmenaza, ProbabilidadesHorizonte, RespuestaPeriodosRetorno } from '@/api/tipos';
import { Insignia, Tarjeta } from '@/componentes/ui/Basicos';
import { ContenidoConsulta } from '@/componentes/ui/Estados';
import { DetalleTecnico, EnPalabrasSimples, Semaforo, Termino } from '@/componentes/ui/Explicacion';
import { porcentajeSimple, resumenAmenazaZona, tituloMapaAmenaza, zonasMasAmenazadas } from '@/lib/resumenes';
import { explicacionSemaforo } from '@/umbralesSemaforo';
import { Selector } from '@/componentes/ui/Formulario';
import { MapaAmenaza } from '@/graficas/MapaAmenaza';
import { formatearEntero, formatearFecha, formatearFechaHora, formatearNumero, formatearPorcentaje } from '@/lib/formato';

const HORIZONTES: ReadonlyArray<{ clave: keyof ProbabilidadesHorizonte; titulo: string }> = [
  { clave: 'dias30', titulo: '30 días' },
  { clave: 'anios1', titulo: '1 año' },
  { clave: 'anios5', titulo: '5 años' },
  { clave: 'anios10', titulo: '10 años' },
  { clave: 'anios50', titulo: '50 años' },
];
const MAGNITUDES = [5, 6, 7] as const;

function formatearAnios(valor: number): string {
  if (valor < 1) return `${formatearNumero(valor * 12, 1)} meses`;
  return `${formatearNumero(valor, valor < 10 ? 1 : 0)} años`;
}

function Procedencia({ c }: { c: CabeceraAmenaza }) {
  const p = c.parametros;
  return (
    <p className="mt-2 text-xs text-tinta-tenue">
      Catálogo {p.catalogo === 'USGS_HIST' ? 'USGS histórico' : p.catalogo} (M ≥ {formatearNumero(p.magnitudMinCatalogo, 1)}) del{' '}
      {formatearFecha(c.periodoInicio)} al {formatearFecha(c.periodoFin)} ({formatearNumero(p.anios, 1)} años):{' '}
      {formatearEntero(p.eventosCatalogo)} eventos, {formatearEntero(p.eventosDepurados)} tras quitar réplicas ({p.depuracion}). Mc ={' '}
      {formatearNumero(p.mc, 1)}; b regional = {formatearNumero(p.bRegional, 2)} ± {formatearNumero(p.errorBRegional, 2)}. Calculado el{' '}
      {formatearFechaHora(c.fechaCalculo)}.
    </p>
  );
}

function TablaPeriodos({ datos, zonaSeleccionada }: { datos: RespuestaPeriodosRetorno; zonaSeleccionada: string }) {
  const [magnitud, setMagnitud] = useState<number>(6);
  const idMagnitud = useId();
  return (
    <div className="space-y-3">
      <div className="w-40">
        <label htmlFor={idMagnitud} className="mb-1 block text-sm font-medium text-tinta-secundaria">
          Magnitud
        </label>
        <Selector id={idMagnitud} value={magnitud} onChange={(e) => setMagnitud(Number(e.target.value))}>
          {MAGNITUDES.map((m) => (
            <option key={m} value={m}>
              M ≥ {m}
            </option>
          ))}
        </Selector>
      </div>
      <div className="overflow-x-auto">
        <table className="tabla min-w-[56rem]">
          <caption className="sr-only">Periodo de retorno y probabilidad de Poisson de al menos un sismo de magnitud {magnitud} o mayor, por zona</caption>
          <thead>
            <tr>
              <th scope="col">Zona</th>
              <th scope="col" className="text-right">
                <Termino termino="valorB">b</Termino>
              </th>
              <th scope="col" className="text-right">
                <Termino termino="periodoRetorno">Periodo de retorno</Termino>
                <span className="block font-normal normal-case tracking-normal">rango por b ± σb</span>
              </th>
              {HORIZONTES.map((h) => (
                <th key={h.clave} scope="col" className="text-right">
                  {h.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.zonas.map((z) => {
              const m = z.magnitudes.find((x) => x.magnitud === magnitud);
              if (!m) return null;
              return (
                <tr key={z.zona} className={z.zona === zonaSeleccionada ? 'bg-primario-claro' : undefined}>
                  <td className="font-medium">
                    {z.zona}
                    {z.agrupadaEn && <span className="block text-xs font-normal text-tinta-tenue">agrupada en {z.agrupadaEn}</span>}
                  </td>
                  <td className="text-right tabular-nums">{formatearNumero(z.b, 2)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    <strong>{formatearAnios(m.periodoRetorno)}</strong>
                    <span className="block text-xs text-tinta-tenue">
                      {formatearAnios(m.periodoRetornoMin)} – {formatearAnios(m.periodoRetornoMax)}
                    </span>
                    {m.extrapolado && (
                      <Insignia>
                        extrapolado (máx. obs. M {formatearNumero(z.magnitudMaximaObservada, 1)})
                      </Insignia>
                    )}
                  </td>
                  {HORIZONTES.map((h) => (
                    <td key={h.clave} className="text-right tabular-nums">
                      {formatearPorcentaje(m.probabilidades[h.clave])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-tinta-tenue">
        Tr = 1/λ(M) con λ(M) = 10^(a − b·M) anual; P(al menos uno en t) = 1 − e^(−λt). Son tasas promedio de largo plazo: no indican cuándo
        ocurrirá un sismo. «Extrapolado» significa que la magnitud supera la máxima observada en la zona.
      </p>
    </div>
  );
}

/** Pestaña «Periodo de retorno y amenaza» de Análisis (catálogo histórico, D17). */
function ResumenAmenaza({ datos, zona }: { datos: RespuestaPeriodosRetorno; zona: string }) {
  const elegida = datos.zonas.find((z) => z.zona === zona) ?? datos.zonas[0];
  if (!elegida) return null;
  const resumen = resumenAmenazaZona(elegida);
  return (
    <EnPalabrasSimples semaforo={<Semaforo nivel={resumen.nivel} titulo="Amenaza" explicacion={explicacionSemaforo('amenaza')} />}>
      <p>{resumen.texto}</p>
      <p className="text-sm text-tinta-secundaria">
        Es un promedio de largo plazo con sismos desde {new Date(datos.periodoInicio).getUTCFullYear()}: no dice cuándo ocurrirá el próximo.
      </p>
    </EnPalabrasSimples>
  );
}

function ZonasMasAmenazadas({ datos }: { datos: RespuestaPeriodosRetorno }) {
  const top = zonasMasAmenazadas(datos.zonas, 5);
  return (
    <ol className="space-y-2">
      {top.map((z, i) => (
        <li key={z.nombre} className="flex items-center gap-3 text-sm">
          <span className="w-5 text-right font-semibold tabular-nums text-tinta-tenue">{i + 1}.</span>
          <span className="w-40 shrink-0 truncate font-medium" title={z.nombre}>
            {z.nombre}
          </span>
          <span className="h-3 flex-1 rounded bg-fondo" aria-hidden="true">
            <span className="block h-3 rounded bg-peligro" style={{ width: `${Math.max(z.probabilidad * 100, 1)}%` }} />
          </span>
          <span className="w-24 text-right tabular-nums">{porcentajeSimple(z.probabilidad)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Pestaña «Periodo de retorno y amenaza» de Análisis (catálogo histórico, D17). */
export function Amenaza({ zona }: { zona: string }) {
  const periodos = useQuery({ queryKey: claves.periodosRetorno, queryFn: apiAmenaza.periodosRetorno });
  const mapa = useQuery({ queryKey: claves.mapaAmenaza, queryFn: apiAmenaza.mapa });
  return (
    <>
      <ContenidoConsulta consulta={periodos} alto="h-24" esVacio={(p) => p.zonas.length === 0}>
        {(p) => (
          <>
            <ResumenAmenaza datos={p} zona={zona} />
            <Tarjeta
              titulo="Zonas con más probabilidad de un sismo fuerte"
              descripcion={
                <>
                  Probabilidad de al menos un sismo de <Termino termino="magnitud">magnitud</Termino> 6 o más en los próximos 10 años
                </>
              }
            >
              <ZonasMasAmenazadas datos={p} />
            </Tarjeta>
          </>
        )}
      </ContenidoConsulta>
      <Tarjeta
        titulo={periodos.data ? tituloMapaAmenaza(periodos.data.zonas) : 'Mapa de amenaza'}
        descripcion={
          <>
            Mapa de <Termino termino="amenaza">amenaza</Termino>: probabilidad de al menos un sismo de magnitud 5 o más en 10 años en cada cuadro
            del mapa
          </>
        }
      >
        <ContenidoConsulta consulta={mapa} esVacio={(m) => m.celdas.length === 0}>
          {(m) => (
            <>
              <MapaAmenaza
                celdas={m.celdas}
                tamanoCelda={m.parametros.tamanoCeldaGrados}
                magnitud={m.parametros.magnitudMapa}
                anios={m.parametros.aniosMapa}
              />
              <p className="mt-2 text-xs text-tinta-tenue">
                Incluye los sismos del mar y de los países vecinos que pueden sentirse en Colombia.
              </p>
            </>
          )}
        </ContenidoConsulta>
      </Tarjeta>
      <DetalleTecnico>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Periodo de retorno por zona (Gutenberg-Richter con el catálogo histórico depurado de réplicas)</h3>
          <ContenidoConsulta consulta={periodos} esVacio={(p) => p.zonas.length === 0}>
            {(p) => (
              <>
                <TablaPeriodos datos={p} zonaSeleccionada={zona} />
                <Procedencia c={p} />
              </>
            )}
          </ContenidoConsulta>
        </section>
        {mapa.data && (
          <section className="space-y-1 border-t border-borde pt-4">
            <h3 className="text-sm font-semibold">Método del mapa</h3>
            <p className="text-xs text-tinta-tenue">
              {mapa.data.parametros.metodoMapa}, celdas de {formatearNumero(mapa.data.parametros.tamanoCeldaGrados, 1)}°, kernel gaussiano con distancia de
              correlación de {formatearNumero(mapa.data.parametros.distanciaCorrelacionKm)} km; la tasa de M ≥{' '}
              {formatearNumero(mapa.data.parametros.magnitudMapa)} sale de la tasa en Mc con el b regional.
            </p>
            <Procedencia c={mapa.data} />
          </section>
        )}
      </DetalleTecnico>
    </>
  );
}
