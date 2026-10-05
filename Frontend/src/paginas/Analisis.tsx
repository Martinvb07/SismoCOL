import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { apiAnalisis, claves } from '@/api/endpoints';
import { NIVELES_ADVERTENCIA, type NivelAdvertencia, type Probabilidades, type Zona } from '@/api/tipos';
import { Insignia, InsigniaEstado, Tarjeta } from '@/componentes/ui/Basicos';
import { AvisoAlcance, ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { Selector } from '@/componentes/ui/Formulario';
import { GraficaGutenbergRichter } from '@/graficas/GraficaGutenbergRichter';
import { ResumenMannKendall, SerieMensual } from '@/graficas/SerieMensual';
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
                M ≥ {m}
                <span className="block font-normal normal-case tracking-normal">1 año / 10 años</span>
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

  const fechaCorte = advertencias.data?.fechaCorte ?? probabilidades.data?.fechaCorte ?? frecuencia.data?.fechaCorte ?? null;

  return (
    <>
      <AvisoAlcance fechaCorte={fechaCorte} />

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Tarjeta titulo="Tendencia mensual" descripcion="Mann-Kendall con pendiente de Sen sobre eventos por mes">
          {zona === null ? (
            <EstadoVacio titulo="Elige una zona" />
          ) : (
            <ContenidoConsulta consulta={frecuencia} esVacio={(f) => f.serieMensual.length === 0}>
              {(f) => (
                <div className="space-y-3">
                  <AvisoAgrupada agrupadaEn={f.agrupadaEn} />
                  <ResumenMannKendall mk={f.mannKendall} />
                  <SerieMensual serie={f.serieMensual} mannKendall={f.mannKendall} />
                </div>
              )}
            </ContenidoConsulta>
          )}
        </Tarjeta>

        <Tarjeta titulo="Gutenberg-Richter" descripcion="Frecuencia acumulada por magnitud y magnitud de completitud">
          {zona === null ? (
            <EstadoVacio titulo="Elige una zona" />
          ) : (
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
          )}
        </Tarjeta>
      </div>

      <Tarjeta
        titulo="Advertencias de actividad"
        descripcion="Ventana actual comparada con el comportamiento habitual de cada zona (prueba de Poisson)"
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
                      p-valor
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
        titulo="Probabilidad de ocurrencia"
        descripcion="Probabilidad de al menos un sismo de magnitud igual o mayor (Poisson sobre Gutenberg-Richter)"
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

      <AvisoAlcance fechaCorte={fechaCorte} />
    </>
  );
}
