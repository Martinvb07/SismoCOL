import { senalesPorMagnitud } from '@/lib/analisis';
import { COLORES_ESTADO } from '@/lib/escalasColor';
import { formatearNumero } from '@/lib/formato';

interface Props {
  magnitud: number;
  /** true mientras dura la señal (5 s): los LEDs brillan y se animan. */
  activa: boolean;
}

const COLOR_APAGADO = '#d5dde1';

function Led({ color, encendido, activa, etiqueta }: { color: string; encendido: boolean; activa: boolean; etiqueta: string }) {
  const brillando = encendido && activa;
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className={`block h-12 w-12 rounded-full border-2 border-white transition-all duration-300 ${brillando ? 'animate-pulse' : ''}`}
        style={{
          backgroundColor: encendido ? color : COLOR_APAGADO,
          opacity: encendido ? (activa ? 1 : 0.45) : 1,
          boxShadow: brillando ? `0 0 18px 6px ${color}` : 'inset 0 2px 4px rgba(0,0,0,0.15)',
        }}
        aria-hidden="true"
      />
      <span className="text-xs font-medium text-tinta-secundaria">
        {etiqueta}
        <span className="sr-only">: {encendido ? 'encendido' : 'apagado'}</span>
      </span>
    </div>
  );
}

function Actuador({ nombre, encendido, activa, animacion, icono }: { nombre: string; encendido: boolean; activa: boolean; animacion: string; icono: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-lg border ${
          encendido ? 'border-lateral bg-lateral text-white' : 'border-borde bg-fondo text-tinta-tenue'
        } ${encendido && activa ? animacion : ''}`}
        style={{ opacity: encendido && !activa ? 0.55 : 1 }}
        aria-hidden="true"
      >
        {icono}
      </span>
      <span className="text-xs font-medium text-tinta-secundaria">
        {nombre}
        <span className="sr-only">: {encendido ? 'activo' : 'inactivo'}</span>
      </span>
    </div>
  );
}

/** Representación del prototipo ESP32: verde siempre, amarillo/vibración ≥ 4, rojo/buzzer ≥ 6. */
export function PanelSenales({ magnitud, activa }: Props) {
  const s = senalesPorMagnitud(magnitud);
  return (
    <figure className="rounded-lg border border-borde bg-white p-4" aria-live="polite">
      <div className="flex flex-wrap items-end justify-center gap-6">
        <Led color={COLORES_ESTADO.verde.relleno} encendido={s.verde} activa={activa} etiqueta="Verde" />
        <Led color={COLORES_ESTADO.amarillo.relleno} encendido={s.amarillo} activa={activa} etiqueta="Amarillo" />
        <Led color={COLORES_ESTADO.rojo.relleno} encendido={s.rojo} activa={activa} etiqueta="Rojo" />
        <span className="mx-2 hidden h-12 w-px bg-borde sm:block" aria-hidden="true" />
        <Actuador
          nombre="Vibración"
          encendido={s.vibracion}
          activa={activa}
          animacion="animate-vibrar"
          icono={
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="8" y="4" width="8" height="16" rx="2" />
              <path d="M4 8v8M20 8v8M2 10v4M22 10v4" />
            </svg>
          }
        />
        <Actuador
          nombre="Buzzer"
          encendido={s.buzzer}
          activa={activa}
          animacion="animate-pulse"
          icono={
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5 6 9H2v6h4l5 4V5Z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
            </svg>
          }
        />
      </div>
      <figcaption className="mt-3 text-center text-sm text-tinta-secundaria">
        {activa ? (
          <strong>Señal activa para M {formatearNumero(magnitud, 1)} (5 s)</strong>
        ) : (
          <>Vista previa para M {formatearNumero(magnitud, 1)}</>
        )}
      </figcaption>
    </figure>
  );
}
