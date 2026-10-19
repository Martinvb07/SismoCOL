import { useEffect, useId, useState } from 'react';

/** Logo de SismoCol: un sismograma dentro de una placa con degradado. */
export function Logo({ tamano = 36 }: { tamano?: number }) {
  // id propio por instancia: si dos logos comparten id y uno está oculto, el otro pierde el degradado.
  const idDegradado = useId();
  return (
    <svg className="logo flex-none" width={tamano} height={tamano} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={idDegradado} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--c-primario))" />
          <stop offset="1" stopColor="rgb(var(--c-primario-oscuro))" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${idDegradado})`} />
      <path
        d="M4 17h5l3-8 4 15 3-11 2 4h7"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DURACION_SALIDA_MS = 450;

/** Pantalla de carga con el logo, ondas y barra (como en ArbiCrypto). */
export function Splash({ texto = 'Cargando SismoCol', detalle, visible = true }: { texto?: string; detalle?: string; visible?: boolean }) {
  const [montado, setMontado] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMontado(true);
      return;
    }
    const t = setTimeout(() => setMontado(false), DURACION_SALIDA_MS);
    return () => clearTimeout(t);
  }, [visible]);
  if (!montado) return null;
  return (
    <div
      className="splash"
      role="status"
      aria-live="polite"
      style={visible ? undefined : { opacity: 0, transition: `opacity ${DURACION_SALIDA_MS}ms ease`, pointerEvents: 'none' }}
    >
      <span className="splash-marca">
        <span className="splash-onda" />
        <span className="splash-onda segunda" />
        <span className="splash-anillo" />
        <Logo tamano={56} />
      </span>
      <b>{texto}</b>
      {detalle && <small>{detalle}</small>}
      <span className="splash-barra">
        <i />
      </span>
    </div>
  );
}
