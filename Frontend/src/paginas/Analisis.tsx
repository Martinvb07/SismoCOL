import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Amenaza } from './analisis/Amenaza';
import { PronosticoZona } from './analisis/PronosticoZona';
import { apiAnalisis, claves } from '@/api/endpoints';
import { NIVELES_ADVERTENCIA, type NivelAdvertencia, type Probabilidades, type Zona } from '@/api/tipos';
import { Insignia, InsigniaEstado, Tarjeta } from '@/componentes/ui/Basicos';
import { AvisoAlcance, ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { Selector } from '@/componentes/ui/Formulario';
import { GraficaGutenbergRichter } from '@/graficas/GraficaGutenbergRichter';
import { ResumenMannKendall, SerieMensual } from '@/graficas/SerieMensual';
import { DetalleTecnico, EnPalabrasSimples, Semaforo, Termino } from '@/componentes/ui/Explicacion';
import { AVISO_PRONOSTICO } from '@/config';
import { resumenAdvertencias, tituloTendencia } from '@/lib/resumenes';
import { EXPLICACION_ADVERTENCIA } from '@/umbralesSemaforo';
import { estiloNivelAdvertencia } from '@/lib/escalasColor';
import { formatearFecha, formatearFechaHora, formatearNumero, formatearPorcentaje, formatearPValor } from '@/lib/formato';

function nombreZona(z: Pick<Zona, 'zona' | 'agrupadaEn'>): string {
  return z.agrupadaEn ? `${z.zona} (agrupada en ${z.agrupadaEn})` : z.zona;
}

function AvisoAgrupada({ agrupadaEn }: { agrupadaEn: string | null }) {
  if (!agrupadaEn) return null;
  return (
    <p className="mb-3 text-sm text-tinta-secundaria">
      <Insignia tono="marca">Agrupada</Insignia> La zona no alcanza el mínimo de eventos y se analiza con su región: <strong>{agrupadaEn}</strong>.
    </p>
  );
}

type Pestana = 'frecuencia' | 'pronostico' | 'amenaza';
const PARAMETRO_PESTANA = 'pestana';

function esPestana(valor: string | null): valor is Pestana {
  return valor === 'frecuencia' || valor === 'pronostico' || valor === 'amenaza';
}

const PESTANAS: ReadonlyArray<{ id: Pestana; titulo: string }> = [
  { id: 'frecuencia', titulo: 'Frecuencia y advertencias' },
  { id: 'pronostico', titulo: 'Pronóstico' },
  { id: 'amenaza', titulo: 'Periodo de retorno y amenaza' },
];

function Pestanas({ activa, alCambiar }: { activa: Pestana; alCambiar: (p: Pestana) => void }) {
  return (
    <div role="tablist" aria-label="Secciones del análisis" className="flex gap-1 overflow-x-auto border-b border-borde">
      {PESTANAS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          id={`pestana-${p.id}`}
          aria-selected={activa === p.id}
          aria-controls={`panel-${p.id}`}
          onClick={() => alCambiar(p.id)}
          className={`-mb-px shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activa === p.id ? 'border-primario text-primario' : 'border-transparent text-tinta-secundaria hover:text-tinta'
          }`}
        >
          {p.titulo}
        </button>
      ))}
    </div>
  );
}

function TablaProbabilidades({ datos, zonaSeleccionada }: { datos: Probabilidades; zonaSeleccionada: string }) {
  const MAGNITUDES = [4, 5, 6] as const;
  return (
    <div className="overflow-x-auto">
      <table className="tabla min-w-[40rem]">
        <caption className="sr-only">Probabilidad de al menos un sismo de magnitud igual o mayor en 1 y 10 años, por zona</caption>
        <thead>
          <tr>
            <th scope="col">Zona</th>
            {MAGNITUDES.map((m) => (
              <th key={m} scope="col" className="text-right">
                Magnitud {m} o más
                <span className="block font-normal normal-case tracking-normal">en 1 año / en 10 años</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {datos.zonas.map((z) => (
            <tr key={z.zona} className={z.zona === zonaSeleccionada ? 'bg-primario-claro' : undefined} aria-current={z.zona === zonaSeleccionada || undefined}>
              <th scope="row" className="!bg-transparent !text-sm !font-medium !normal-case !tracking-normal !text-tinta">
                {nombreZona(z)}
              </th>
              {MAGNITUDES.map((m) => {
                const p = z.probabilidades.find((x) => x.magnitud === m);
                return (
                  <td key={m} className="whitespace-nowrap text-right tabular-nums">
                    {p ? `${formatearPorcentaje(p.anios1)} / ${formatearPorcentaje(p.anios10)}` : '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PaginaAnalisis() {
  const idSelector = useId();
  const idNivel = useId();
  const [zonaElegida, setZonaElegida] = useState<string | null>(null);
  const [nivel, setNivel] = useState<NivelAdvertencia | ''>('');
  const [parametros, setParametros] = useSearchParams();
  const delParametro = parametros.get(PARAMETRO_PESTANA);
  const pestana: Pestana = esPestana(delParametro) ? delParametro : 'frecuencia';
  const setPestana = (p: Pestana) => setParametros({ [PARAMETRO_PESTANA]: p }, { replace: true });
  const aviso = pestana === 'frecuencia' ? undefined : AVISO_PRONOSTICO;

  const zonas = useQuery({ queryKey: claves.zonas, queryFn: apiAnalisis.zonas });
  const zona = zonaElegida ?? zonas.data?.[0]?.zona ?? null;

  const frecuencia = useQuery({
    queryKey: claves.frecuencia(zona ?? ''),
    queryFn: () => apiAnalisis.frecuencia(zona as string),
    enabled: zona !== null,
  });
  const gr = useQuery({
    queryKey: claves.gutenbergRichter(zona ?? ''),
    queryFn: () => apiAnalisis.gutenbergRichter(zona as string),
    enabled: zona !== null,
  });
  const probabilidades = useQuery({ queryKey: claves.probabilidades, queryFn: apiAnalisis.probabilidades });
  const advertencias = useQuery({
    queryKey: [...claves.advertencias, nivel],
    queryFn: () => apiAnalisis.advertencias(nivel ? { nivel } : {}),
  });

  const todasAdvertencias = useQuery({ queryKey: [...claves.advertencias, ''], queryFn: () => apiAnalisis.advertencias({}) });
  const fechaCorte = advertencias.data?.fechaCorte ?? probabilidades.data?.fechaCorte ?? frecuencia.data?.fechaCorte ?? null;

  return (
    <>
      <AvisoAlcance fechaCorte={fechaCorte} texto={aviso} />

      <Tarjeta>
        <ContenidoConsulta consulta={zonas} alto="h-12" esVacio={(z) => z.length === 0} vacio={<EstadoVacio titulo="No hay zonas analizadas todavía" />}>
          {(lista) => (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full max-w-md">
                <label htmlFor={idSelector} className="mb-1 block text-sm font-medium text-tinta-secundaria">
                  Zona sísmica
                </label>
                <Selector id={idSelector} value={zona ?? ''} onChange={(e) => setZonaElegida(e.target.value)}>
                  {lista.map((z) => (
                    <option key={z.zona} value={z.zona}>
                      {nombreZona(z)} · {formatearNumero(z.nEventos)} eventos
                    </option>
                  ))}
                </Selector>
              </div>
              {(() => {
                const actual = lista.find((z) => z.zona === zona);
                return actual ? <p className="pb-2 text-sm text-tinta-tenue">Región: {actual.region}</p> : null;
              })()}
            </div>
          )}
        </ContenidoConsulta>
      </Tarjeta>

      <Pestanas activa={pestana} alCambiar={setPestana} />

      {pestana === 'pronostico' && (
        <div role="tabpanel" id="panel-pronostico" aria-labelledby="pestana-pronostico" className="space-y-4">
          {zona === null ? <EstadoVacio titulo="Elige una zona" /> : <PronosticoZona zona={zona} />}
        </div>
      )}

      {pestana === 'amenaza' && (
        <div role="tabpanel" id="panel-amenaza" aria-labelledby="pestana-amenaza" className="space-y-4">
          <Amenaza zona={zona ?? ''} />
        </div>
      )}

      {pestana === 'frecuencia' && (
        <div role="tabpanel" id="panel-frecuencia" aria-labelledby="pestana-frecuencia" className="space-y-4">
          <ContenidoConsulta consulta={todasAdvertencias} alto="h-24">
            {(a) => {
              const resumen = resumenAdvertencias(
                a.datos,
                a.fechaCorte,
                zona && frecuencia.data ? { nombre: zona, tendencia: frecuencia.data.mannKendall.tendencia } : undefined,
              );
              return (
                <EnPalabrasSimples semaforo={<Semaforo nivel={resumen.nivel} titulo="Actividad" explicacion={EXPLICACION_ADVERTENCIA} />}>
                  <p>{resumen.texto}</p>
                </EnPalabrasSimples>
              );
            }}
          </ContenidoConsulta>

          <Tarjeta
            titulo={zona && frecuencia.data ? tituloTendencia(zona, frecuencia.data.mannKendall.tendencia) : 'Sismos por mes'}
            descripcion={
              <>
                Cantidad de sismos registrados cada mes en la zona y su <Termino termino="tendencia">tendencia</Termino>
              </>
            }
          >
            {zona === null ? (
              <EstadoVacio titulo="Elige una zona" />
            ) : (
              <ContenidoConsulta consulta={frecuencia} esVacio={(f) => f.serieMensual.length === 0}>
                {(f) => (
                  <div className="space-y-3">
                    <AvisoAgrupada agrupadaEn={f.agrupadaEn} />
                    <SerieMensual serie={f.serieMensual} mannKendall={f.mannKendall} />
                  </div>
                )}
              </ContenidoConsulta>
            )}
          </Tarjeta>

          <DetalleTecnico>
            {zona === null ? (
              <EstadoVacio titulo="Elige una zona" />
            ) : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Prueba de tendencia de Mann-Kendall y pendiente de Sen</h3>
                  <ContenidoConsulta consulta={frecuencia} esVacio={(f) => f.serieMensual.length === 0}>
                    {(f) => <ResumenMannKendall mk={f.mannKendall} />}
                  </ContenidoConsulta>
                </section>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    Gutenberg-Richter: sismos por magnitud, <Termino termino="valorB">valor b</Termino> y{' '}
                    <Termino termino="completitud">magnitud de completitud</Termino>
                  </h3>
                  <ContenidoConsulta consulta={gr} esVacio={(g) => g.puntos.length === 0}>
                    {(g) => (
                      <>
                        <AvisoAgrupada agrupadaEn={g.agrupadaEn} />
                        <GraficaGutenbergRichter gr={g} />
                        <p className="mt-2 text-xs text-tinta-tenue">
                          Tasa anual de eventos M ≥ Mc: {formatearNumero(g.tasaAnual, 1)}. El valor a es anual; la recta se dibuja sobre los
                          conteos de todo el periodo (a + log₁₀ años).
                        </p>
                      </>
                    )}
                  </ContenidoConsulta>
                </section>
              </div>
            )}
          </DetalleTecnico>

          <Tarjeta
            titulo={<Termino termino="advertencia">Advertencias de actividad</Termino>}
            descripcion="Sismos de los últimos días comparados con lo habitual en cada zona"
            acciones={
              <div className="flex items-center gap-2">
                <label htmlFor={idNivel} className="text-sm text-tinta-secundaria">
                  Nivel
                </label>
                <Selector id={idNivel} value={nivel} onChange={(e) => setNivel(e.target.value as NivelAdvertencia | '')} className="w-36">
                  <option value="">Todos</option>
                  {NIVELES_ADVERTENCIA.map((n) => (
                    <option key={n} value={n}>
                      {estiloNivelAdvertencia(n).etiqueta}
                    </option>
                  ))}
                </Selector>
              </div>
            }
          >
            <ContenidoConsulta
              consulta={advertencias}
              esVacio={(a) => a.datos.length === 0}
              vacio={<EstadoVacio titulo="No hay advertencias para este filtro" />}
            >
              {(a) => (
                <div className="overflow-x-auto">
                  <table className="tabla min-w-[48rem]">
                    <thead>
                      <tr>
                        <th scope="col">Zona</th>
                        <th scope="col">Nivel</th>
                        <th scope="col">Ventana</th>
                        <th scope="col" className="text-right">
                          Observados
                        </th>
                        <th scope="col" className="text-right">
                          Esperados
                        </th>
                        <th scope="col" className="text-right">
                          <Termino termino="pValor">p-valor</Termino>
                        </th>
                        <th scope="col">Emitida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...a.datos]
                        .sort((x, y) => NIVELES_ADVERTENCIA.indexOf(y.nivel) - NIVELES_ADVERTENCIA.indexOf(x.nivel))
                        .map((adv) => (
                          <tr key={adv.idAdvertencia} className={adv.zona === zona ? 'bg-primario-claro' : undefined}>
                            <td className="font-medium">{adv.zona}</td>
                            <td>
                              <InsigniaEstado estilo={estiloNivelAdvertencia(adv.nivel)} />
                            </td>
                            <td className="whitespace-nowrap">
                              {formatearFecha(adv.ventanaInicio)} – {formatearFecha(adv.ventanaFin)}
                            </td>
                            <td className="text-right tabular-nums">{formatearNumero(adv.eventosObservados)}</td>
                            <td className="text-right tabular-nums">{formatearNumero(adv.eventosEsperados, 1)}</td>
                            <td className="text-right tabular-nums">{formatearPValor(adv.pValor)}</td>
                            <td className="whitespace-nowrap">{formatearFechaHora(adv.fechaEmision)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ContenidoConsulta>
          </Tarjeta>

          <Tarjeta
            titulo={<Termino termino="probabilidad">Probabilidad de que ocurra un sismo</Termino>}
            descripcion="Probabilidad de al menos un sismo de la magnitud indicada o mayor en cada zona, con el catálogo reciente del Servicio Geológico Colombiano"
          >
            <ContenidoConsulta consulta={probabilidades} esVacio={(p) => p.zonas.length === 0}>
              {(p) => (
                <>
                  <TablaProbabilidades datos={p} zonaSeleccionada={zona ?? ''} />
                  <p className="mt-2 text-xs text-tinta-tenue">
                    Calculado el {formatearFechaHora(p.fechaCalculo)} con datos hasta {formatearFecha(p.fechaCorte)}.
                  </p>
                </>
              )}
            </ContenidoConsulta>
          </Tarjeta>
        </div>
      )}

      <AvisoAlcance fechaCorte={fechaCorte} texto={aviso} />
    </>
  );
}
