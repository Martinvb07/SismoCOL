import type { SVGProps } from 'react';

/** Íconos SVG en línea (trazo 2 px, 24×24). Decorativos por defecto. */
type PropsIcono = SVGProps<SVGSVGElement> & { titulo?: string };

function Icono({ titulo, children, ...props }: PropsIcono) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.25em"
      height="1.25em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo ? undefined : true}
      role={titulo ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {titulo ? <title>{titulo}</title> : null}
      {children}
    </svg>
  );
}

export const IconoMapa = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
    <path d="M9 4v14M15 6v14" />
  </Icono>
);
export const IconoGrafica = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-4 3 3 5-6" />
  </Icono>
);
export const IconoObjetivo = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </Icono>
);
export const IconoChip = (p: PropsIcono) => (
  <Icono {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </Icono>
);
export const IconoPanel = (p: PropsIcono) => (
  <Icono {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </Icono>
);
export const IconoBaseDatos = (p: PropsIcono) => (
  <Icono {...p}>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </Icono>
);
export const IconoAjustes = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Icono>
);
export const IconoUsuarios = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    <path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-1.8-5.6-4.5-6.6" />
  </Icono>
);
export const IconoSalir = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Icono>
);
export const IconoMenu = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Icono>
);
export const IconoCerrar = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icono>
);
export const IconoDescarga = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Icono>
);
export const IconoSubir = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 21V9M7 14l5-5 5 5M5 3h14" />
  </Icono>
);
export const IconoAlerta = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Icono>
);
export const IconoInfo = (p: PropsIcono) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icono>
);
export const IconoCheck = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="m5 12 5 5L20 7" />
  </Icono>
);
export const IconoRecargar = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 3v6h-6" />
  </Icono>
);
export const IconoCentroide = (p: PropsIcono) => (
  <Icono {...p}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" strokeDasharray="3 2" />
    <circle cx="12" cy="10" r="2" />
  </Icono>
);
export const IconoOrden = ({ direccion, ...p }: PropsIcono & { direccion: 'asc' | 'desc' | null }) => (
  <Icono {...p}>
    <path d="m8 9 4-4 4 4" opacity={direccion === 'asc' ? 1 : 0.3} />
    <path d="m16 15-4 4-4-4" opacity={direccion === 'desc' ? 1 : 0.3} />
  </Icono>
);
