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
      className={`tarjeta ${className}`}
      aria-labelledby={titulo ? idTitulo : undefined}
    >
      {(titulo || acciones) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
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
  primario:
    'bg-gradient-to-b from-primario to-primario-oscuro text-white shadow-[0_6px_16px_-6px_rgb(var(--c-primario)/.6)] hover:brightness-110 disabled:opacity-50 disabled:shadow-none',
  secundario: 'border border-borde bg-superficie text-tinta hover:bg-superficie-2 disabled:text-tinta-tenue',
  peligro: 'bg-peligro text-white hover:brightness-110 disabled:opacity-50',
  fantasma: 'text-primario hover:bg-primario-claro disabled:text-tinta-tenue',
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
  const relleno = tamano === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm';
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[.97] disabled:cursor-not-allowed disabled:active:scale-100 ${relleno} ${CLASES_VARIANTE[variante]} ${className}`}
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
  const clases = tono === 'marca' ? 'bg-primario/15 text-primario' : 'bg-superficie-2 text-tinta-secundaria';
  return <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${clases}`}>{children}</span>;
}

/* ---------- Alertas ---------- */

type TipoAlerta = 'error' | 'aviso' | 'exito' | 'info';

const CLASES_ALERTA: Record<TipoAlerta, string> = {
  error: 'border-peligro-borde bg-peligro-fondo text-peligro-texto',
  aviso: 'border-aviso-borde bg-aviso-fondo text-aviso-texto',
  exito: 'border-exito-borde bg-exito-fondo text-exito-texto',
  info: 'border-primario/30 bg-primario/10 text-tinta',
};

export function Alerta({ tipo = 'info', titulo, children }: { tipo?: TipoAlerta; titulo?: string; children?: ReactNode }) {
  const Icono = tipo === 'exito' ? IconoCheck : tipo === 'info' ? IconoInfo : IconoAlerta;
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`flex animate-entrada gap-2 rounded-xl border px-3 py-2.5 text-sm ${CLASES_ALERTA[tipo]}`}>
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
    <div className="rounded-xl border border-borde bg-superficie-2 px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-tinta-tenue">{etiqueta}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-tinta">{valor}</dd>
      {detalle && <dd className="text-xs text-tinta-tenue">{detalle}</dd>}
    </div>
  );
}
