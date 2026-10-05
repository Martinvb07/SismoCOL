import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { EstiloEstado } from '@/lib/escalasColor';
import { IconoAlerta, IconoCheck, IconoInfo } from './Iconos';

/* ---------- Tarjeta ---------- */

interface PropsTarjeta {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  /** id del encabezado, para aria-labelledby */
  id?: string;
}

export function Tarjeta({ titulo, descripcion, acciones, children, className = '', id }: PropsTarjeta) {
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <section
      className={`rounded-lg border border-borde bg-white p-4 shadow-sm sm:p-5 ${className}`}
      aria-labelledby={titulo ? idTitulo : undefined}
    >
      {(titulo || acciones) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {titulo && (
              <h2 id={idTitulo} className="text-base font-semibold text-tinta">
                {titulo}
              </h2>
            )}
            {descripcion && <p className="mt-0.5 text-sm text-tinta-tenue">{descripcion}</p>}
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------- Botón ---------- */

type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'fantasma';

const CLASES_VARIANTE: Record<VarianteBoton, string> = {
  primario: 'bg-primario text-white hover:bg-primario-oscuro disabled:bg-primario/50',
  secundario: 'border border-borde bg-white text-tinta hover:bg-fondo disabled:text-tinta-tenue',
  peligro: 'bg-[#b42828] text-white hover:bg-[#931f1f] disabled:opacity-50',
  fantasma: 'text-primario-oscuro hover:bg-primario-claro disabled:text-tinta-tenue',
};

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  cargando?: boolean;
  tamano?: 'sm' | 'md';
}

export function Boton({
  variante = 'primario',
  cargando = false,
  tamano = 'md',
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: PropsBoton) {
  const relleno = tamano === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-4 py-2 text-sm';
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed ${relleno} ${CLASES_VARIANTE[variante]} ${className}`}
      {...props}
    >
      {cargando && <Giro />}
      {children}
    </button>
  );
}

export function Giro({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

/* ---------- Insignias ---------- */

export function InsigniaEstado({ estilo, children }: { estilo: EstiloEstado; children?: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: estilo.fondo, color: estilo.texto, borderColor: estilo.borde }}
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: estilo.relleno }} />
      {children ?? estilo.etiqueta}
    </span>
  );
}

export function Insignia({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'marca' }) {
  const clases = tono === 'marca' ? 'bg-primario-claro text-primario-oscuro' : 'bg-fondo text-tinta-secundaria';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${clases}`}>{children}</span>;
}

/* ---------- Alertas ---------- */

type TipoAlerta = 'error' | 'aviso' | 'exito' | 'info';

const CLASES_ALERTA: Record<TipoAlerta, string> = {
  error: 'border-[#eea3a3] bg-[#fbe3e3] text-[#931f1f]',
  aviso: 'border-[#f0d77a] bg-[#fdf5d8] text-[#6b5200]',
  exito: 'border-[#9fd6b5] bg-[#e3f4ea] text-[#1d6b3c]',
  info: 'border-primario/30 bg-primario-claro text-tinta',
};

export function Alerta({ tipo = 'info', titulo, children }: { tipo?: TipoAlerta; titulo?: string; children?: ReactNode }) {
  const Icono = tipo === 'exito' ? IconoCheck : tipo === 'info' ? IconoInfo : IconoAlerta;
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${CLASES_ALERTA[tipo]}`}>
      <Icono className="mt-0.5 shrink-0" />
      <div>
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}

/* ---------- Dato clave ---------- */

export function DatoClave({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="rounded-md bg-fondo px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">{etiqueta}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-tinta">{valor}</dd>
      {detalle && <dd className="text-xs text-tinta-tenue">{detalle}</dd>}
    </div>
  );
}
