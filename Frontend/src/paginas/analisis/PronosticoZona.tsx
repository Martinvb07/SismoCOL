import { useQuery } from '@tanstack/react-query';
import { apiAnalisis, claves } from '@/api/endpoints';
import type { PronosticoActividad } from '@/api/tipos';
import { Insignia, Tarjeta } from '@/componentes/ui/Basicos';
import { ContenidoConsulta } from '@/componentes/ui/Estados';
import { GraficaPronostico } from '@/graficas/GraficaPronostico';
import { ETIQUETAS_MODELO_PRONOSTICO } from '@/lib/etiquetas';
import { formatearFechaHora, formatearMes, formatearNumero } from '@/lib/formato';

function TablaBacktesting({ p }: { p: PronosticoActividad }) {
  const horizontes = Array.from({ length: p.parametros.horizonteBacktest }, (_, i) => String(i + 1));
  return (
    <div className="overflow-x-auto">
      <table className="tabla min-w-[40rem]">
        <caption className="sr-only">Error de cada modelo en el backtesting por origen móvil</caption>
        <thead>
          <tr>
            <th scope="col">Modelo</th>
            <th scope="col" className="text-right">
              MAE
            </th>
            <th scope="col" className="text-right">
              MAPE
            </th>
            {horizontes.map((h) => (
              <th key={h} scope="col" className="text-right">
                MAE t+{h}
              </th>
            ))}
            <th scope="col" className="text-right">
              Pronósticos
            </th>
          </tr>
        </thead>
        <tbody>
          {p.backtesting.map((b) => (
            <tr key={b.modelo} className={b.modelo === p.modeloGanador ? 'bg-primario-claro' : undefined}>
              <td className="font-medium">
                {ETIQUETAS_MODELO_PRONOSTICO[b.modelo]} {b.modelo === p.modeloGanador && <Insignia tono="marca">Elegido</Insignia>}
              </td>
              <td className="text-right tabular-nums">{formatearNumero(b.mae, 2)}</td>
              <td className="whitespace-nowrap text-right tabular-nums">{b.mape === null ? '—' : `${formatearNumero(b.mape, 1)} %`}</td>
              {horizontes.map((h) => (
                <td key={h} className="text-right tabular-nums">
                  {formatearNumero(b.maePorHorizonte[h], 2)}
                </td>
              ))}
              <td className="text-right tabular-nums">{formatearNumero(b.nPronosticos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaMeses({ p }: { p: PronosticoActividad }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabla min-w-[36rem]">
        <caption className="sr-only">Pronóstico mensual con bandas del 80 y el 95 %</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col" className="text-right">
              Pronóstico
            </th>
            <th scope="col" className="text-right">
              Banda 80 %
            </th>
            <th scope="col" className="text-right">
              Banda 95 %
            </th>
          </tr>
        </thead>
        <tbody>
          {p.pronostico.map((x) => (
            <tr key={x.mes}>
              <td className="capitalize">{formatearMes(x.mes)}</td>
              <td className="text-right tabular-nums">{formatearNumero(x.valor, 1)}</td>
              <td className="whitespace-nowrap text-right tabular-nums">
                {formatearNumero(x.inferior80, 0)} – {formatearNumero(x.superior80, 0)}
              </td>
              <td className="whitespace-nowrap text-right tabular-nums">
                {formatearNumero(x.inferior95, 0)} – {formatearNumero(x.superior95, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pestaña «Pronóstico» de Análisis: serie, pronóstico de 12 meses y backtesting. */
export function PronosticoZona({ zona }: { zona: string }) {
  const consulta = useQuery({ queryKey: claves.pronostico(zona), queryFn: () => apiAnalisis.pronostico(zona) });
  return (
    <ContenidoConsulta consulta={consulta}>
      {(p) => {
        const orden = p.parametros.ordenSarima.join(',');
        const estacional = p.parametros.ordenEstacional.join(',');
        return (
          <>
            <Tarjeta
              titulo="Sismos por mes: observado y pronóstico"
              descripcion={`Sismos M ≥ ${formatearNumero(p.mc, 1)} por mes en ${p.zona}. Modelo mostrado: ${ETIQUETAS_MODELO_PRONOSTICO[p.modeloGanador]} (el de menor MAE en el backtesting)`}
            >
              <GraficaPronostico serie={p.serie} pronostico={p.pronostico} />
              <p className="mt-2 text-xs text-tinta-tenue">
                Catálogo {p.parametros.catalogo}, meses completos de {formatearMes(p.periodoInicio.slice(0, 7))} a {formatearMes(p.periodoFin.slice(0, 7))} ({p.nMeses} meses).
                SARIMA({orden})({estacional}) sobre log(1 + conteo), orden elegido por {p.parametros.seleccionOrden}. Calculado el{' '}
                {formatearFechaHora(p.fechaCalculo)}.
              </p>
            </Tarjeta>
            <div className="grid grid-cols-1 gap-4">
              <Tarjeta
                titulo="Backtesting por origen móvil"
                descripcion={`Entrenando hasta el mes t (desde el mes ${p.parametros.minMesesEntrenamiento}) y pronosticando t+1 a t+${p.parametros.horizonteBacktest}`}
              >
                <TablaBacktesting p={p} />
                <p className="mt-2 text-xs text-tinta-tenue">El MAPE excluye los meses con 0 eventos, donde no está definido.</p>
              </Tarjeta>
              <Tarjeta titulo="Pronóstico mensual" descripcion="Valor central y bandas del modelo elegido">
                <TablaMeses p={p} />
              </Tarjeta>
            </div>
          </>
        );
      }}
    </ContenidoConsulta>
  );
}
