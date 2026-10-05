import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { mensajeDeError } from '@/api/cliente';
import { apiSimulacion, claves } from '@/api/endpoints';
import type { Dispositivo, Simulacion } from '@/api/tipos';
import { Alerta, Boton, Insignia, InsigniaEstado, Tarjeta } from '@/componentes/ui/Basicos';
import { ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { DURACION_SENAL_MS, REFRESCO_DISPOSITIVO_MS } from '@/config';
import { estiloMagnitud } from '@/lib/escalasColor';
import { LIMITES } from '@/lib/esquemas';
import { ETIQUETAS_ENVIO } from '@/lib/etiquetas';
import { formatearFechaHora, formatearMagnitud, formatearNumero } from '@/lib/formato';
import { PanelSenales } from './simulacion/PanelSenales';

const MAGNITUD_INICIAL = 4.5;
const { min: MAG_MIN, max: MAG_MAX, paso: PASO } = LIMITES.magnitudSimulacion;

function EstadoDispositivo({ d }: { d: Dispositivo }) {
  const enLinea = d.estado === 'EN_LINEA';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-fondo px-3 py-2">
      <div>
        <p className="font-medium">{d.nombre}</p>
        <p className="text-xs text-tinta-tenue">Tópico MQTT: {d.topicoMqtt}</p>
      </div>
      <div className="text-right">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
            enLinea ? 'bg-primario text-white' : 'bg-[#5f6f75] text-white'
          }`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${enLinea ? 'animate-pulse bg-white' : 'bg-white/60'}`} />
          {enLinea ? 'En línea' : 'Desconectado'}
        </span>
        <p className="mt-1 text-xs text-tinta-tenue">Última conexión: {formatearFechaHora(d.ultimaConexion)}</p>
      </div>
    </div>
  );
}

function ResultadoEnvio({ s }: { s: Simulacion }) {
  if (s.estadoEnvio === 'ENVIADA') {
    return (
      <Alerta tipo="exito" titulo="Simulación enviada">
        El {s.dispositivo.nombre} confirmó la señal de {formatearMagnitud(s.magnitudSimulada)}.
      </Alerta>
    );
  }
  if (s.estadoEnvio === 'FALLIDA') {
    return (
      <Alerta tipo="error" titulo="Simulación fallida">
        El {s.dispositivo.nombre} no confirmó en 5 segundos. Revisa que esté encendido y conectado al broker MQTT.
      </Alerta>
    );
  }
  return <Alerta tipo="info">Simulación pendiente de confirmación.</Alerta>;
}

export default function PaginaSimulacion() {
  const idSlider = useId();
  const clienteConsultas = useQueryClient();
  const [magnitud, setMagnitud] = useState(MAGNITUD_INICIAL);
  const [senalActiva, setSenalActiva] = useState<number | null>(null);

  const dispositivos = useQuery({
    queryKey: claves.dispositivos,
    queryFn: apiSimulacion.dispositivos,
    refetchInterval: REFRESCO_DISPOSITIVO_MS,
    staleTime: 0,
  });
  const historial = useQuery({ queryKey: claves.simulaciones, queryFn: () => apiSimulacion.recientes() });

  const enviar = useMutation({
    mutationFn: apiSimulacion.enviar,
    onSuccess: (s) => {
      if (s.estadoEnvio === 'ENVIADA') setSenalActiva(s.magnitudSimulada);
      void clienteConsultas.invalidateQueries({ queryKey: claves.simulaciones });
      void clienteConsultas.invalidateQueries({ queryKey: claves.dispositivos });
    },
  });

  // La señal física dura 5 s: la animación también
  useEffect(() => {
    if (senalActiva === null) return;
    const t = setTimeout(() => setSenalActiva(null), DURACION_SENAL_MS);
    return () => clearTimeout(t);
  }, [senalActiva]);

  const algunoEnLinea = dispositivos.data?.some((d) => d.estado === 'EN_LINEA') ?? false;
  const estilo = estiloMagnitud(magnitud);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Tarjeta titulo="Simular un sismo" descripcion="La magnitud se envía por MQTT al prototipo ESP32" className="lg:col-span-3">
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <label htmlFor={idSlider} className="text-sm font-medium text-tinta-secundaria">
                  Magnitud
                </label>
                <output htmlFor={idSlider} className="flex items-center gap-2 text-3xl font-bold tabular-nums">
                  {formatearNumero(magnitud, 1)}
                  <InsigniaEstado estilo={estilo} />
                </output>
              </div>
              <input
                id={idSlider}
                type="range"
                min={MAG_MIN}
                max={MAG_MAX}
                step={PASO}
                value={magnitud}
                onChange={(e) => setMagnitud(Number(e.target.value))}
                aria-valuetext={`Magnitud ${formatearNumero(magnitud, 1)}`}
                className="w-full accent-primario"
              />
              <div className="flex justify-between text-xs text-tinta-tenue" aria-hidden="true">
                <span>{formatearNumero(MAG_MIN, 1)}</span>
                <span>{formatearNumero((MAG_MIN + MAG_MAX) / 2, 1)}</span>
                <span>{formatearNumero(MAG_MAX, 1)}</span>
              </div>
            </div>

            <PanelSenales magnitud={senalActiva ?? magnitud} activa={senalActiva !== null} />

            {!algunoEnLinea && dispositivos.isSuccess && (
              <Alerta tipo="aviso">El dispositivo está desconectado: el envío probablemente quedará como fallido.</Alerta>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Boton
                onClick={() => enviar.mutate(Number(magnitud.toFixed(1)))}
                cargando={enviar.isPending}
                disabled={senalActiva !== null}
              >
                {enviar.isPending ? 'Esperando confirmación del ESP32…' : 'Enviar al ESP32'}
              </Boton>
              <p className="text-xs text-tinta-tenue">Verde siempre · amarillo y vibración desde M 4 · rojo y buzzer desde M 6</p>
            </div>

            {enviar.isError && <Alerta tipo="error">{mensajeDeError(enviar.error)}</Alerta>}
            {enviar.data && !enviar.isPending && <ResultadoEnvio s={enviar.data} />}
          </div>
        </Tarjeta>

        <div className="space-y-4 lg:col-span-2">
          <Tarjeta
            titulo="Estado del dispositivo"
            descripcion={`Se actualiza cada ${formatearNumero(REFRESCO_DISPOSITIVO_MS / 1000)} s`}
            acciones={dispositivos.isFetching ? <Insignia>Actualizando…</Insignia> : undefined}
          >
            <ContenidoConsulta
              consulta={dispositivos}
              alto="h-20"
              esVacio={(d) => d.length === 0}
              vacio={<EstadoVacio titulo="No hay dispositivos registrados" />}
            >
              {(lista) => (
                <div className="space-y-2">
                  {lista.map((d) => (
                    <EstadoDispositivo key={d.idDispositivo} d={d} />
                  ))}
                </div>
              )}
            </ContenidoConsulta>
          </Tarjeta>

          <Tarjeta titulo="Historial reciente">
            <ContenidoConsulta
              consulta={historial}
              esVacio={(h) => h.length === 0}
              vacio={<EstadoVacio titulo="Aún no has enviado simulaciones" />}
            >
              {(lista) => (
                <ul className="divide-y divide-borde">
                  {lista.map((s) => (
                    <li key={s.idSimulacion} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <div>
                        <InsigniaEstado estilo={estiloMagnitud(s.magnitudSimulada)}>{formatearMagnitud(s.magnitudSimulada)}</InsigniaEstado>
                        <p className="mt-0.5 text-xs text-tinta-tenue">{formatearFechaHora(s.fecha)}</p>
                      </div>
                      <Insignia tono={s.estadoEnvio === 'ENVIADA' ? 'marca' : 'neutro'}>{ETIQUETAS_ENVIO[s.estadoEnvio]}</Insignia>
                    </li>
                  ))}
                </ul>
              )}
            </ContenidoConsulta>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
