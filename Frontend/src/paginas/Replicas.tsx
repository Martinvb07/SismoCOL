import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { mensajeDeError } from '@/api/cliente';
import { apiReplicas, claves } from '@/api/endpoints';
import type {
  DetalleReplicas,
  HorizonteReplicas,
  PronosticoReplicas,
  ResumenPrincipal,
  ResumenValidacionReplicas,
  SismoPrincipal,
} from '@/api/tipos';
import { useSesion } from '@/auth/sesion';
import { Alerta, Boton, DatoClave, Insignia, Tarjeta } from '@/componentes/ui/Basicos';
import { AvisoAlcance, ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { Selector } from '@/componentes/ui/Formulario';
import { IconoRecargar } from '@/componentes/ui/Iconos';
import { AVISO_PRONOSTICO } from '@/config';
import { CurvaReplicas } from '@/graficas/CurvaReplicas';
import { ETIQUETAS_METODO } from '@/lib/etiquetas';
import { formatearEntero, formatearFechaHora, formatearMagnitud, formatearNumero, formatearPorcentaje, formatearProfundidad } from '@/lib/formato';

const ETIQUETAS_HORIZONTE: Record<HorizonteReplicas['horizonte'], string> = {
  '24h': 'Próximas 24 h',
  '7d': 'Próximos 7 días',
  '30d': 'Próximos 30 días',
};

function nombrePrincipal(s: SismoPrincipal): string {
  const lugar = s.municipio ? `${s.municipio} (${s.departamento ?? ''})` : `${formatearNumero(s.latitud, 2)}, ${formatearNumero(s.longitud, 2)}`;
  return `${formatearMagnitud(s.magnitud)} · ${formatearFechaHora(s.fechaHora)} · ${lugar}`;
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
        <DatoClave etiqueta="Réplicas ≥ Mc en el ajuste" valor={formatearEntero(p.nReplicas)} detalle={`Mc = ${formatearNumero(p.mc, 1)}`} />
        <DatoClave etiqueta="a · b" valor={`${formatearNumero(p.a, 2)} · ${formatearNumero(p.b, 2)}`} detalle={p.parametros.bEstimado ? 'b de la secuencia' : 'b genérico'} />
        <DatoClave etiqueta="p · c (días)" valor={`${formatearNumero(p.p, 2)} · ${formatearNumero(p.c, 3)}`} />
      </dl>
      <p className="text-xs text-tinta-tenue">
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
  const elegida = ventanas.find((v) => v.horasAjuste === horas) ?? ventanas[0];

  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-secundaria">
        Se ajusta el modelo solo con las primeras 24 h, 72 h o 7 días tras el principal y se compara lo que pronosticaba con lo que ocurrió después. La
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

function Detalle({ idSismo, esAdmin }: { idSismo: number; esAdmin: boolean }) {
  const detalle = useQuery({ queryKey: claves.detalleReplicas(idSismo), queryFn: () => apiReplicas.detalle(idSismo) });
  return (
    <ContenidoConsulta consulta={detalle}>
      {(d) => {
        const p = d.pronostico;
        const diasAjuste = (p.horasAjuste ?? 0) / 24;
        return (
          <>
            <Tarjeta
              titulo="Pronóstico vigente"
              descripcion={`Probabilidad de al menos una réplica desde ${formatearFechaHora(p.parametros.datosHasta)} (último dato disponible)`}
            >
              <div className="space-y-4">
                <p className="text-sm text-tinta-secundaria">
                  Principal: {nombrePrincipal(d.principal)} · profundidad {formatearProfundidad(d.principal.profundidadKm)} · fuente {d.principal.fuente}
                </p>
                <TablaProbabilidades horizontes={p.resultados.horizontes} />
                <Parametros p={p} />
              </div>
            </Tarjeta>
            <Tarjeta titulo="Curva de decaimiento" descripcion="Réplicas acumuladas ≥ Mc: observado contra esperado (eje de tiempo logarítmico)">
              <CurvaReplicas curva={p.resultados.curva} diasAjuste={diasAjuste} mc={p.mc} />
            </Tarjeta>
            <Tarjeta titulo="Validación retrospectiva" descripcion="Backtesting: ajuste con los primeros datos y comparación con lo observado después">
              <Validacion detalle={d} esAdmin={esAdmin} />
            </Tarjeta>
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

export default function PaginaReplicas() {
  const { rol } = useSesion();
  const esAdmin = rol === 'ADMIN';
  const idSelector = useId();
  const [elegido, setElegido] = useState<number | null>(null);
  const principales = useQuery({ queryKey: claves.replicas, queryFn: apiReplicas.principales });
  const idSismo = elegido ?? principales.data?.[0]?.idSismo ?? null;

  return (
    <>
      <AvisoAlcance texto={AVISO_PRONOSTICO} />
      <Tarjeta
        titulo="Sismo principal"
        descripcion="Sismos con M ≥ 6 del catálogo instrumental (SGC y USGS reciente) que no son réplica de otro mayor"
        acciones={esAdmin ? <Recalcular /> : undefined}
      >
        <ContenidoConsulta
          consulta={principales}
          alto="h-12"
          esVacio={(l) => l.length === 0}
          vacio={<EstadoVacio titulo="No hay pronósticos de réplicas todavía">Se calculan después de cada carga o sincronización.</EstadoVacio>}
        >
          {(lista: ResumenPrincipal[]) => (
            <div className="w-full max-w-2xl">
              <label htmlFor={idSelector} className="mb-1 block text-sm font-medium text-tinta-secundaria">
                Sismo
              </label>
              <Selector id={idSelector} value={idSismo ?? ''} onChange={(e) => setElegido(Number(e.target.value))}>
                {lista.map((s) => (
                  <option key={s.idSismo} value={s.idSismo}>
                    {nombrePrincipal(s)} · P(M≥4 en 7 d) {formatearPorcentaje(s.probabilidad7dM4)}
                  </option>
                ))}
              </Selector>
            </div>
          )}
        </ContenidoConsulta>
      </Tarjeta>
      {idSismo !== null && <Detalle idSismo={idSismo} esAdmin={esAdmin} />}
      <AvisoAlcance texto={AVISO_PRONOSTICO} />
    </>
  );
}
