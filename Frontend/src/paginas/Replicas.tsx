import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { mensajeDeError } from '@/api/cliente';
import { apiReplicas, apiSismos, claves } from '@/api/endpoints';
import type {
  DetalleReplicas,
  FiltrosSismos,
  HorizonteReplicas,
  PronosticoReplicas,
  ResumenPrincipal,
  ResumenValidacionReplicas,
  SismoPrincipal,
} from '@/api/tipos';
import { useSesion } from '@/auth/sesion';
import { Alerta, Boton, DatoClave, Insignia, InsigniaEstado, Tarjeta } from '@/componentes/ui/Basicos';
import { AvisoAlcance, ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { DetalleTecnico, EnPalabrasSimples, Semaforo, Termino } from '@/componentes/ui/Explicacion';
import { Campo, Entrada, EntradaFecha, Selector } from '@/componentes/ui/Formulario';
import { IconoRecargar } from '@/componentes/ui/Iconos';
import { Paginacion } from '@/componentes/ui/Paginacion';
import { AVISO_PRONOSTICO } from '@/config';
import { CurvaReplicas } from '@/graficas/CurvaReplicas';
import { estiloMagnitud } from '@/lib/escalasColor';
import { ETIQUETAS_FUENTE, ETIQUETAS_METODO } from '@/lib/etiquetas';
import { MAGNITUD_SISMO_FUERTE } from '@/lib/replicas';
import { porcentajeSimple, resumenReplicas, tituloCurvaReplicas } from '@/lib/resumenes';
import { explicacionSemaforo } from '@/umbralesSemaforo';
import { formatearEntero, formatearFechaHora, formatearMagnitud, formatearNumero, formatearPorcentaje, formatearProfundidad } from '@/lib/formato';
/** Parámetro de la URL con el sismo elegido: /replicas?sismo=123. */
const PARAMETRO_SISMO = 'sismo';
/** Filas por página del listado de sismos. */
const TAMANO_LISTADO = 10;

const ETIQUETAS_HORIZONTE: Record<HorizonteReplicas['horizonte'], string> = {
  '24h': 'Próximas 24 h',
  '7d': 'Próximos 7 días',
  '30d': 'Próximos 30 días',
};

function lugarPrincipal(s: SismoPrincipal): string {
  return s.municipio ? `${s.municipio} (${s.departamento ?? ''})` : `fuera de un municipio (${formatearNumero(s.latitud, 2)}, ${formatearNumero(s.longitud, 2)})`;
}

function nombrePrincipal(s: SismoPrincipal): string {
  return `${formatearMagnitud(s.magnitud)} · ${formatearFechaHora(s.fechaHora)} · ${lugarPrincipal(s)}`;
}

function TablaProbabilidades({ horizontes }: { horizontes: HorizonteReplicas[] }) {
  const magnitudes = horizontes[0]?.magnitudes.map((m) => m.magnitud) ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="tabla min-w-[40rem]">
        <caption className="sr-only">Probabilidad de al menos una réplica y número esperado con intervalo del 95 %, por ventana y magnitud</caption>
        <thead>
          <tr>
            <th scope="col">Ventana</th>
            {magnitudes.map((m) => (
              <th key={m} scope="col" className="text-right">
                M ≥ {formatearNumero(m, Number.isInteger(m) ? 0 : 1)}
                <span className="block font-normal normal-case tracking-normal">P(≥1) · N esperado [IC 95 %]</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {horizontes.map((h) => (
            <tr key={h.horizonte}>
              <th scope="row" className="!bg-transparent !text-sm !font-medium !normal-case !tracking-normal !text-tinta">
                {ETIQUETAS_HORIZONTE[h.horizonte]}
              </th>
              {h.magnitudes.map((m) => (
                <td key={m.magnitud} className="whitespace-nowrap text-right tabular-nums">
                  <strong>{formatearPorcentaje(m.probabilidad)}</strong> · {formatearNumero(m.esperado, m.esperado < 10 ? 2 : 0)} [
                  {formatearEntero(m.ic95[0])}–{formatearEntero(m.ic95[1])}]
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Parametros({ p }: { p: PronosticoReplicas }) {
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DatoClave etiqueta="Método" valor={ETIQUETAS_METODO[p.metodo]} />
        <DatoClave
          etiqueta="Réplicas ≥ Mc en el ajuste"
          valor={formatearEntero(p.nReplicas)}
          detalle={<Termino termino="completitud">{`Mc = ${formatearNumero(p.mc, 1)}`}</Termino>}
        />
        <DatoClave
          etiqueta="a · b"
          valor={`${formatearNumero(p.a, 2)} · ${formatearNumero(p.b, 2)}`}
          detalle={<Termino termino="valorB">{p.parametros.bEstimado ? 'b de la secuencia' : 'b genérico'}</Termino>}
        />
        <DatoClave etiqueta="p · c (días)" valor={`${formatearNumero(p.p, 2)} · ${formatearNumero(p.c, 3)}`} />
      </dl>
      <p className="text-xs text-tinta-tenue">
        {p.idPronostico === null && 'Calculado al consultar (no se guarda) · '}
        Ventana de Gardner-Knopoff: {formatearNumero(p.parametros.ventanaKm, 0)} km y {formatearNumero(p.parametros.ventanaDias, 0)} días ·{' '}
        {formatearEntero(p.parametros.nSecuencia)} sismos en la secuencia · fuentes: {p.parametros.fuentes.join(', ') || '—'} · datos hasta{' '}
        {formatearFechaHora(p.parametros.datosHasta)}
        {p.parametros.finCatalogoSgc && ` (SGC hasta ${formatearFechaHora(p.parametros.finCatalogoSgc)}; después, USGS M ≥ 2,5)`} · calculado el{' '}
        {formatearFechaHora(p.fechaCalculo)}.
      </p>
      {p.parametros.avisos.length > 0 && (
        <Alerta tipo="aviso" titulo="Avisos del ajuste">
          <ul className="list-disc pl-4">
            {p.parametros.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Alerta>
      )}
    </div>
  );
}

function ResumenMetricas({ titulo, r }: { titulo: string; r: ResumenValidacionReplicas | undefined }) {
  if (!r || r.casos === 0) return null;
  return (
    <div className="rounded-md bg-fondo px-3 py-2 text-sm">
      <p className="font-semibold">{titulo}</p>
      <p className="tabular-nums text-tinta-secundaria">
        {formatearPorcentaje(r.fraccionDentroIc95)} de {formatearEntero(r.casos)} casos dentro del IC 95 % · error absoluto medio{' '}
        {formatearNumero(r.errorAbsolutoMedio, 2)} · log-verosimilitud {formatearNumero(r.logVerosimilitudTotal, 1)}
      </p>
    </div>
  );
}

function TablaValidacion({ v }: { v: PronosticoReplicas }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabla min-w-[44rem]">
        <caption className="sr-only">Réplicas observadas contra esperadas tras ajustar con las primeras {v.horasAjuste} horas</caption>
        <thead>
          <tr>
            <th scope="col">Ventana</th>
            <th scope="col" className="text-right">
              Magnitud
            </th>
            <th scope="col" className="text-right">
              Observadas
            </th>
            <th scope="col" className="text-right">
              Esperadas [IC 95 %]
            </th>
            <th scope="col" className="text-right">
              Genérico [IC 95 %]
            </th>
            <th scope="col">Dentro del IC</th>
          </tr>
        </thead>
        <tbody>
          {v.resultados.horizontes.flatMap((h, i) =>
            h.magnitudes.map((m, j) => {
              const g = v.resultados.horizontesGenerico?.[i]?.magnitudes[j];
              return (
                <tr key={`${h.horizonte}-${m.magnitud}`}>
                  <td className="whitespace-nowrap">
                    {ETIQUETAS_HORIZONTE[h.horizonte]}
                    {h.cobertura !== undefined && h.cobertura < 1 && (
                      <span className="block text-xs text-tinta-tenue">datos para el {formatearPorcentaje(h.cobertura, 0)} de la ventana</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums">≥ {formatearNumero(m.magnitud, 1)}</td>
                  <td className="text-right tabular-nums">{formatearEntero(m.observado)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {formatearNumero(m.esperado, 2)} [{m.ic95[0]}–{m.ic95[1]}]
                  </td>
                  <td className="whitespace-nowrap text-right tabular-nums text-tinta-tenue">
                    {g ? `${formatearNumero(g.esperado, 2)} [${g.ic95[0]}–${g.ic95[1]}]` : '—'}
                  </td>
                  <td>{m.dentroIc95 ? <Insignia tono="marca">Sí</Insignia> : <Insignia>No</Insignia>}</td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

function Validacion({ detalle, esAdmin }: { detalle: DetalleReplicas; esAdmin: boolean }) {
  const clienteConsultas = useQueryClient();
  const [horas, setHoras] = useState<number | null>(null);
  const idVentana = useId();
  const validar = useMutation({
    mutationFn: () => apiReplicas.validar(detalle.principal.idSismo),
    onSuccess: () => {
      void clienteConsultas.invalidateQueries({ queryKey: claves.replicas });
    },
  });
  const ventanas = detalle.validacion;
  // Mientras no haya validación guardada se muestra el resumen de la última ejecución.
  const elegida = ventanas.find((v) => v.horasAjuste === horas) ?? ventanas[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-secundaria">
        Se ajusta el modelo solo con las primeras 24 h, 72 h o 7 días tras el sismo y se compara lo que pronosticaba con lo que ocurrió después. La
        columna «Genérico» usa los parámetros de California sin ajustar nada a la secuencia, como referencia.
      </p>
      {esAdmin && (
        <Boton variante="secundario" onClick={() => validar.mutate()} cargando={validar.isPending}>
          <IconoRecargar /> Ejecutar validación retrospectiva
        </Boton>
      )}
      {validar.isError && <Alerta tipo="error">{mensajeDeError(validar.error)}</Alerta>}
      {!elegida ? (
        <EstadoVacio titulo="Este sismo todavía no tiene validación retrospectiva" />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <label htmlFor={idVentana} className="mb-1 block text-sm font-medium text-tinta-secundaria">
                Datos usados en el ajuste
              </label>
              <Selector id={idVentana} value={String(elegida.horasAjuste)} onChange={(e) => setHoras(Number(e.target.value))}>
                {ventanas.map((v) => (
                  <option key={v.idPronostico} value={String(v.horasAjuste)}>
                    Primeras {formatearNumero(v.horasAjuste)} h
                  </option>
                ))}
              </Selector>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <ResumenMetricas titulo="Modelo ajustado" r={elegida.resultados.resumen} />
            <ResumenMetricas titulo="Genérico (referencia)" r={elegida.resultados.resumenGenerico} />
          </div>
          <CurvaReplicas curva={elegida.resultados.curva} diasAjuste={(elegida.horasAjuste ?? 0) / 24} mc={elegida.mc} />
          <Parametros p={elegida} />
          <TablaValidacion v={elegida} />
        </>
      )}
    </div>
  );
}

function ProbabilidadesSimples({ p }: { p: PronosticoReplicas }) {
  const siete = p.resultados.horizontes.find((h) => h.horizonte === '7d');
  if (!siete) return null;
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {siete.magnitudes.map((m) => (
        <DatoClave
          key={m.magnitud}
          etiqueta={`Réplica de magnitud ${formatearNumero(m.magnitud)} o más`}
          valor={porcentajeSimple(m.probabilidad)}
          detalle="probabilidad de al menos una en 7 días"
        />
      ))}
    </dl>
  );
}

function Detalle({ idSismo, esAdmin }: { idSismo: number; esAdmin: boolean }) {
  const detalle = useQuery({ queryKey: claves.replicasSismo(idSismo), queryFn: () => apiReplicas.sismo(idSismo) });
  return (
    <ContenidoConsulta consulta={detalle} textoCargando="Calculando el pronóstico de réplicas…">
      {(d) => {
        const p = d.pronostico;
        const diasAjuste = (p.horasAjuste ?? 0) / 24;
        const resumen = resumenReplicas(p);
        return (
          <>
            <EnPalabrasSimples
              semaforo={<Semaforo nivel={resumen.nivel} titulo="Nivel de réplicas" explicacion={explicacionSemaforo('replicas')} />}
            >
              <p>{resumen.texto}</p>
              {d.advertencia && <p className="text-sm text-tinta-secundaria">{d.advertencia}</p>}
            </EnPalabrasSimples>
            <Tarjeta
              titulo={
                <>
                  Probabilidad de <Termino termino="replica">réplicas</Termino> en los próximos 7 días
                </>
              }
              descripcion={
                <>
                  Sismo de <Termino termino="magnitud">magnitud</Termino> {formatearNumero(d.principal.magnitud, 1)} del{' '}
                  {formatearFechaHora(d.principal.fechaHora)} · {lugarPrincipal(d.principal)} · {formatearProfundidad(d.principal.profundidadKm)} de
                  profundidad
                </>
              }
            >
              <ProbabilidadesSimples p={p} />
            </Tarjeta>
            <Tarjeta titulo={tituloCurvaReplicas(p.resultados.curva)} descripcion="Réplicas acumuladas desde el sismo: lo registrado contra lo que espera el modelo">
              <CurvaReplicas curva={p.resultados.curva} diasAjuste={diasAjuste} mc={p.mc} />
            </Tarjeta>
            <DetalleTecnico>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">
                  Pronóstico por ventana y magnitud con <Termino termino="intervalo">intervalo del 95 %</Termino>
                </h3>
                <p className="text-xs text-tinta-tenue">
                  Sismo: {nombrePrincipal(d.principal)} · fuente {ETIQUETAS_FUENTE[d.principal.fuente]} · método: {ETIQUETAS_METODO[d.metodo]} · desde{' '}
                  {formatearFechaHora(p.parametros.datosHasta)} (último dato disponible)
                </p>
                <TablaProbabilidades horizontes={p.resultados.horizontes} />
                <Parametros p={p} />
              </section>
              <section className="space-y-3 border-t border-borde pt-4">
                <h3 className="text-sm font-semibold">
                  Validación retrospectiva (<Termino termino="backtesting">backtesting</Termino>)
                </h3>
                <Validacion detalle={d} esAdmin={esAdmin} />
              </section>
            </DetalleTecnico>
          </>
        );
      }}
    </ContenidoConsulta>
  );
}

function Recalcular() {
  const clienteConsultas = useQueryClient();
  const recalcular = useMutation({
    mutationFn: apiReplicas.recalcular,
    onSuccess: () => void clienteConsultas.invalidateQueries({ queryKey: claves.replicas }),
  });
  return (
    <div className="space-y-2">
      <Boton variante="secundario" tamano="sm" onClick={() => recalcular.mutate()} cargando={recalcular.isPending}>
        <IconoRecargar /> Recalcular pronósticos
      </Boton>
      {recalcular.isError && <Alerta tipo="error">{mensajeDeError(recalcular.error)}</Alerta>}
    </div>
  );
}

function SismosFuertes({ alElegir, elegido }: { alElegir: (id: number) => void; elegido: number | null }) {
  const principales = useQuery({ queryKey: claves.replicas, queryFn: apiReplicas.principales });
  return (
    <ContenidoConsulta
      consulta={principales}
      alto="h-12"
      esVacio={(l) => l.length === 0}
      vacio={<EstadoVacio titulo="No hay sismos fuertes recientes">Se calculan después de cada carga o sincronización.</EstadoVacio>}
    >
      {(lista: ResumenPrincipal[]) => (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((s) => (
            <li key={s.idSismo}>
              <button
                type="button"
                onClick={() => alElegir(s.idSismo)}
                aria-pressed={elegido === s.idSismo}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:border-primario ${
                  elegido === s.idSismo ? 'border-primario bg-primario-claro' : 'border-borde bg-superficie'
                }`}
              >
                <span className="font-semibold">{formatearMagnitud(s.magnitud)}</span> · {formatearFechaHora(s.fechaHora)}
                <span className="block text-tinta-secundaria">{s.municipio ? `${s.municipio} (${s.departamento ?? ''})` : 'Fuera de un municipio'}</span>
                <span className="block text-xs text-tinta-tenue">Réplica de magnitud 4 o más en 7 días: {porcentajeSimple(s.probabilidad7dM4)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ContenidoConsulta>
  );
}

function BuscadorSismos({ alElegir, elegido }: { alElegir: (id: number) => void; elegido: number | null }) {
  const [filtros, setFiltros] = useState<FiltrosSismos>({ instrumental: true });
  const [pagina, setPagina] = useState(1);
  const departamentos = useQuery({ queryKey: claves.departamentos, queryFn: apiSismos.departamentos, staleTime: Infinity });
  const paginacion = { pagina, tamano: TAMANO_LISTADO };
  const resultados = useQuery({
    queryKey: claves.sismos(filtros, paginacion, 'fecha_desc'),
    queryFn: () => apiSismos.listar(filtros, paginacion, 'fecha_desc'),
    placeholderData: keepPreviousData,
  });

  const buscar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const texto = (clave: string) => {
      const valor = datos.get(clave);
      return typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
    };
    const magnitud = Number(texto('magMin'));
    setFiltros({
      desde: texto('desde'),
      hasta: texto('hasta'),
      departamento: texto('departamento'),
      municipio: texto('municipio'),
      magMin: texto('magMin') !== undefined && Number.isFinite(magnitud) ? magnitud : undefined,
      instrumental: true,
    });
    setPagina(1);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={buscar} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Buscar sismos">
        <Campo etiqueta="Desde">{(p) => <EntradaFecha {...p} name="desde" />}</Campo>
        <Campo etiqueta="Hasta">{(p) => <EntradaFecha {...p} name="hasta" />}</Campo>
        <Campo etiqueta="Departamento">
          {(p) => (
            <Selector {...p} name="departamento" defaultValue="" disabled={departamentos.isPending}>
              <option value="">Todos</option>
              {(departamentos.data ?? []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Selector>
          )}
        </Campo>
        <Campo etiqueta="Municipio">{(p) => <Entrada {...p} name="municipio" placeholder="Ej.: Los Santos" />}</Campo>
        <Campo etiqueta="Magnitud mínima">
          {(p) => (
            <Entrada
              {...p}
              name="magMin"
              type="number"
              inputMode="decimal"
              step={0.1}
              min={0}
              max={9}
              placeholder="Todas"
            />
          )}
        </Campo>
        <Boton type="submit">Buscar</Boton>
      </form>
      <ContenidoConsulta
        consulta={resultados}
        esVacio={(r) => r.total === 0}
        vacio={<EstadoVacio titulo="No hay sismos con esos datos">Prueba con otras fechas o una magnitud menor.</EstadoVacio>}
      >
        {(r) => (
          <>
            <div className="overflow-x-auto" aria-busy={resultados.isFetching}>
              <table className="tabla min-w-[40rem]">
                <caption className="sr-only">Sismos encontrados para ver su pronóstico de réplicas, del más reciente al más antiguo</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha (hora Colombia)</th>
                    <th scope="col">Magnitud</th>
                    <th scope="col">Lugar</th>
                    <th scope="col">Fuente</th>
                    <th scope="col">
                      <span className="sr-only">Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={resultados.isPlaceholderData ? 'opacity-60' : undefined}>
                  {r.datos.map((s) => (
                    <tr key={s.idSismo} className={s.idSismo === elegido ? 'bg-primario-claro' : undefined}>
                      <td className="whitespace-nowrap tabular-nums">{formatearFechaHora(s.fechaHora)}</td>
                      <td>
                        <InsigniaEstado estilo={estiloMagnitud(s.magnitud)}>{formatearMagnitud(s.magnitud)}</InsigniaEstado>
                      </td>
                      <td>{s.municipio ? `${s.municipio} (${s.departamento ?? ''})` : (s.departamento ?? '—')}</td>
                      <td>{ETIQUETAS_FUENTE[s.fuente]}</td>
                      <td className="text-right">
                        <Boton variante="secundario" tamano="sm" onClick={() => alElegir(s.idSismo)} aria-label={`Ver réplicas del sismo del ${formatearFechaHora(s.fechaHora)}`}>
                          Ver réplicas
                        </Boton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={r.pagina} tamano={r.tamano} total={r.total} alCambiar={setPagina} cargando={resultados.isFetching} />
          </>
        )}
      </ContenidoConsulta>
    </div>
  );
}

export default function PaginaReplicas() {
  const { rol } = useSesion();
  const esAdmin = rol === 'ADMIN';
  const [parametros, setParametros] = useSearchParams();
  const principales = useQuery({ queryKey: claves.replicas, queryFn: apiReplicas.principales });
  const delParametro = Number(parametros.get(PARAMETRO_SISMO));
  const idSismo = Number.isInteger(delParametro) && delParametro > 0 ? delParametro : (principales.data?.[0]?.idSismo ?? null);
  const refDetalle = useRef<HTMLDivElement>(null);
  const [irAlDetalle, setIrAlDetalle] = useState(false);

  // Al elegir un sismo de la lista, la vista baja hasta su pronóstico.
  useEffect(() => {
    if (!irAlDetalle) return;
    refDetalle.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    setIrAlDetalle(false);
  }, [irAlDetalle, idSismo]);

  const elegir = (id: number) => {
    setParametros({ [PARAMETRO_SISMO]: String(id) });
    setIrAlDetalle(true);
  };

  return (
    <>
      <AvisoAlcance texto={AVISO_PRONOSTICO} />
      <Tarjeta
        titulo="Elige un sismo"
        descripcion="Todos los sismos del registro (Servicio Geológico Colombiano y USGS), del más reciente al más antiguo. Elige cualquiera para ver qué réplicas se esperan."
        acciones={esAdmin ? <Recalcular /> : undefined}
      >
        <div className="space-y-5">
          <section aria-labelledby="titulo-fuertes" className="space-y-2">
            <h3 id="titulo-fuertes" className="text-sm font-semibold text-tinta-secundaria">
              Sismos fuertes recientes (magnitud {MAGNITUD_SISMO_FUERTE} o más)
            </h3>
            <SismosFuertes alElegir={elegir} elegido={idSismo} />
          </section>
          <section aria-labelledby="titulo-todos" className="space-y-2 border-t border-borde pt-4">
            <h3 id="titulo-todos" className="text-sm font-semibold text-tinta-secundaria">
              Todos los sismos
            </h3>
            <BuscadorSismos alElegir={elegir} elegido={idSismo} />
          </section>
        </div>
      </Tarjeta>
      <div ref={refDetalle} className="scroll-mt-24 space-y-5">
        {idSismo !== null && <Detalle idSismo={idSismo} esAdmin={esAdmin} />}
      </div>
      <AvisoAlcance texto={AVISO_PRONOSTICO} />
    </>
  );
}
