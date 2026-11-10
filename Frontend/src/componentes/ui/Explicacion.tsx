import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSARIO, type TerminoGlosario } from '@/lib/glosario';
import type { NivelSemaforo } from '@/umbralesSemaforo';
import { IconoInfo } from './Iconos';

/* ---------- Ayuda (i) ---------- */

const ANCHO_AYUDA = 256;
const MARGEN_PANTALLA = 8;

/** Ícono (i) con una explicación en una frase. Se abre al pasar el puntero, al enfocar o al tocar, y nunca se sale de la pantalla. */
export function Ayuda({ termino, texto, etiqueta }: { termino?: TerminoGlosario; texto?: string; etiqueta?: string }) {
  const id = useId();
  const [fija, setFija] = useState(false); // abierta por clic o toque
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const globo = useRef<HTMLSpanElement>(null);
  const contenido = texto ?? (termino ? GLOSARIO[termino] : '');

  const mostrar = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(ANCHO_AYUDA, window.innerWidth - 2 * MARGEN_PANTALLA);
    const left = Math.min(Math.max(r.left + r.width / 2 - ancho / 2, MARGEN_PANTALLA), window.innerWidth - ancho - MARGEN_PANTALLA);
    setPos({ left, top: r.bottom + 6 });
  };
  const ocultar = () => {
    if (!fija) setPos(null);
  };
  // Más cerca del borde inferior que de su alto: se abre hacia arriba.
  useEffect(() => {
    const g = globo.current;
    const r = boton.current?.getBoundingClientRect();
    if (!pos || !g || !r) return;
    const alto = g.offsetHeight;
    if (pos.top + alto > window.innerHeight - MARGEN_PANTALLA && r.top - alto - 6 > MARGEN_PANTALLA) {
      setPos({ left: pos.left, top: r.top - alto - 6 });
    }
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const cerrar = (e: Event) => {
      const dentro = ref.current?.contains(e.target as Node) || globo.current?.contains(e.target as Node);
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !dentro) {
        setFija(false);
        setPos(null);
      }
    };
    const alDesplazar = () => {
      setFija(false);
      setPos(null);
    };
    document.addEventListener('keydown', cerrar);
    document.addEventListener('pointerdown', cerrar);
    window.addEventListener('scroll', alDesplazar, true);
    return () => {
      document.removeEventListener('keydown', cerrar);
      document.removeEventListener('pointerdown', cerrar);
      window.removeEventListener('scroll', alDesplazar, true);
    };
  }, [pos]);

  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={mostrar} onMouseLeave={ocultar}>
      <button
        ref={boton}
        type="button"
        aria-label={`¿Qué significa ${etiqueta ?? 'esto'}?`}
        aria-describedby={id}
        aria-expanded={pos !== null}
        onFocus={mostrar}
        onBlur={ocultar}
        onClick={() => {
          if (fija) {
            setFija(false);
            setPos(null);
          } else {
            setFija(true);
            mostrar();
          }
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-tinta-tenue hover:text-primario focus:outline-none focus-visible:ring-2 focus-visible:ring-primario"
      >
        <IconoInfo className="h-3.5 w-3.5" />
      </button>
      {/* En un portal: un ancestro con transform (animaciones) rompería position: fixed. */}
      {createPortal(
        <span
          ref={globo}
          id={id}
          role="tooltip"
          style={pos ? { left: pos.left, top: pos.top, width: Math.min(ANCHO_AYUDA, window.innerWidth - 2 * MARGEN_PANTALLA) } : undefined}
          className={`fixed z-50 rounded-xl border border-borde bg-superficie px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-tinta shadow-elevada ${
            pos ? 'block' : 'hidden'
          }`}
        >
          {contenido}
        </span>,
        document.body,
      )}
    </span>
  );
}

/** Término técnico seguido de su ayuda (i). */
export function Termino({ termino, children }: { termino: TerminoGlosario; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {children}
      <Ayuda termino={termino} etiqueta={typeof children === 'string' ? children : undefined} />
    </span>
  );
}

/* ---------- Semáforo ---------- */

const ESTILO_SEMAFORO: Record<NivelSemaforo, { etiqueta: string; clases: string; luz: string }> = {
  BAJO: { etiqueta: 'Bajo', clases: 'border-exito-borde bg-exito-fondo text-exito-texto', luz: 'bg-exito-texto' },
  MODERADO: { etiqueta: 'Moderado', clases: 'border-aviso-borde bg-aviso-fondo text-aviso-texto', luz: 'bg-aviso-texto' },
  ALTO: { etiqueta: 'Alto', clases: 'border-peligro-borde bg-peligro-fondo text-peligro-texto', luz: 'bg-peligro-texto' },
};
const ORDEN: readonly NivelSemaforo[] = ['BAJO', 'MODERADO', 'ALTO'];

/** Semáforo con color y texto (nunca solo color) y su criterio en un tooltip. */
export function Semaforo({ nivel, explicacion, titulo = 'Nivel' }: { nivel: NivelSemaforo; explicacion: string; titulo?: string }) {
  const e = ESTILO_SEMAFORO[nivel];
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${e.clases}`}>
      <span className="flex gap-1" aria-hidden="true">
        {ORDEN.map((n) => (
          <span key={n} className={`h-2.5 w-2.5 rounded-full ${n === nivel ? e.luz : 'bg-current opacity-20'}`} />
        ))}
      </span>
      <span>
        {titulo}: {e.etiqueta.toLowerCase()}
      </span>
      <Ayuda texto={explicacion} etiqueta="este nivel" />
    </div>
  );
}

/* ---------- Tarjeta «En palabras simples» ---------- */

export function EnPalabrasSimples({ children, semaforo }: { children: ReactNode; semaforo?: ReactNode }) {
  return (
    <section aria-label="En palabras simples" className="rounded-2xl border border-primario/30 bg-primario/5 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primario">En palabras simples</h2>
        {semaforo}
      </div>
      <div className="mt-1 space-y-1 text-base leading-relaxed text-tinta">{children}</div>
    </section>
  );
}

/* ---------- Detalle técnico plegable ---------- */

/** Bloque plegable «Ver detalle técnico», cerrado por defecto. */
export function DetalleTecnico({ children, titulo = 'Ver detalle técnico' }: { children: ReactNode; titulo?: string }) {
  return (
    <details className="group rounded-2xl border border-borde bg-superficie">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-tinta-secundaria hover:text-tinta sm:px-5 [&::-webkit-details-marker]:hidden">
        {titulo}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-borde px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}
