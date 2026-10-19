/**
 * Selector y selector de fecha con el estilo de SismoCol.
 *
 * Debajo queda el <select>/<input> nativo, oculto: conserva `name`, `ref`,
 * `onChange` y `value`, así que funcionan igual con react-hook-form
 * (register) y con estado controlado. Lo visible es un botón con una lista o
 * un calendario propios.
 */
import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { fechaIsoBogota } from '@/lib/formato';

const CLASES_DISPARADOR =
  'flex w-full items-center gap-2 rounded-xl border border-borde bg-superficie px-3 py-2.5 text-left text-sm text-tinta transition-[border-color,box-shadow] duration-200 hover:border-tinta-tenue/50 focus:border-primario focus:outline-none focus:ring-4 focus:ring-primario/15 disabled:cursor-not-allowed disabled:bg-superficie-2 disabled:text-tinta-tenue aria-[invalid=true]:border-peligro aria-expanded:border-primario aria-expanded:ring-4 aria-expanded:ring-primario/15';

const CLASES_PANEL =
  'menu-entrada absolute left-0 z-50 min-w-full overflow-hidden rounded-2xl border border-borde bg-superficie shadow-elevada';

const MIN_OPCIONES_BUSQUEDA = 8;
const ALTO_PANEL_PX = 320;

/* ---------- Utilidades ---------- */

function combinarRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (valor: T | null) => {
    for (const r of refs) {
      if (typeof r === 'function') r(valor);
      else if (r) (r as { current: T | null }).current = valor;
    }
  };
}

/**
 * Avisa cuando alguien asigna `.value` por código (reset de react-hook-form,
 * estado controlado de React), que no dispara eventos.
 */
function observarValor(el: HTMLInputElement | HTMLSelectElement, alCambiar: () => void): () => void {
  const propio = Object.getOwnPropertyDescriptor(el, 'value');
  const base = propio ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, 'value');
  // Los accesores se invocan siempre con .call(elemento), así que separarlos es seguro.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const leer = base?.get as ((this: unknown) => string) | undefined;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const escribir = base?.set as ((this: unknown, v: string) => void) | undefined;
  if (!leer || !escribir) return () => undefined;
  Object.defineProperty(el, 'value', {
    configurable: true,
    get(this: unknown) {
      return leer.call(this);
    },
    set(this: unknown, v: string) {
      escribir.call(this, v);
      alCambiar();
    },
  });
  return () => {
    if (propio) Object.defineProperty(el, 'value', propio);
    else delete (el as unknown as Record<string, unknown>).value;
  };
}

/** react-hook-form limpia con form.reset(), que no asigna .value ni emite eventos en los controles. */
function alReiniciarFormulario(el: HTMLInputElement | HTMLSelectElement, alCambiar: () => void): () => void {
  const formulario = el.form;
  if (!formulario) return () => undefined;
  // El evento llega antes de que el navegador restaure los valores.
  const alReiniciar = () => setTimeout(alCambiar, 0);
  formulario.addEventListener('reset', alReiniciar);
  return () => formulario.removeEventListener('reset', alReiniciar);
}

/** Asigna el valor como lo haría el usuario, para que React y RHF reciban el evento. */
function asignarComoUsuario(el: HTMLInputElement | HTMLSelectElement, valor: string, evento: 'change' | 'input') {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- se invoca con .call(el)
  const escribir = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el) as object, 'value')?.set as
    | ((this: unknown, v: string) => void)
    | undefined;
  escribir?.call(el, valor);
  el.dispatchEvent(new Event(evento, { bubbles: true }));
}

function textoDe(nodo: ReactNode): string {
  if (nodo === null || nodo === undefined || typeof nodo === 'boolean') return '';
  if (typeof nodo === 'string' || typeof nodo === 'number') return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoDe).join('');
  if (isValidElement<{ children?: ReactNode }>(nodo)) return textoDe(nodo.props.children);
  return '';
}

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Abre el panel hacia arriba si abajo no cabe; cierra con clic afuera o Escape. */
function usePanel(abierto: boolean, cerrar: () => void) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [haciaArriba, setHaciaArriba] = useState(false);

  useLayoutEffect(() => {
    if (!abierto || !contenedor.current) return;
    const caja = contenedor.current.getBoundingClientRect();
    const abajo = window.innerHeight - caja.bottom;
    setHaciaArriba(abajo < ALTO_PANEL_PX && caja.top > abajo);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('pointerdown', alPresionar);
    return () => document.removeEventListener('pointerdown', alPresionar);
  }, [abierto, cerrar]);

  return { contenedor, clasePosicion: haciaArriba ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top' };
}

/* ---------- Selector ---------- */

interface Opcion {
  valor: string;
  etiqueta: string;
  deshabilitada: boolean;
}

export const Selector = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selector(
  { className = '', children, id, disabled, 'aria-invalid': invalido, 'aria-describedby': describe, ...props },
  ref,
) {
  const nativo = useRef<HTMLSelectElement | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const busqueda = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();
  const [valor, setValor] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [activa, setActiva] = useState(0);
  const tecleado = useRef({ texto: '', hasta: 0 });

  const opciones = useMemo<Opcion[]>(
    () =>
      Children.toArray(children)
        .filter((h): h is ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }> => isValidElement(h))
        .map((h) => ({
          valor: String(h.props.value ?? textoDe(h.props.children)),
          etiqueta: textoDe(h.props.children),
          deshabilitada: Boolean(h.props.disabled),
        })),
    [children],
  );
  const conBusqueda = opciones.length > MIN_OPCIONES_BUSQUEDA;
  const visibles = useMemo(
    () => (filtro ? opciones.filter((o) => sinTildes(o.etiqueta).includes(sinTildes(filtro))) : opciones),
    [opciones, filtro],
  );

  const leer = useCallback(() => setValor(nativo.current?.value ?? ''), []);
  useLayoutEffect(() => {
    const el = nativo.current;
    if (!el) return;
    leer();
    el.addEventListener('change', leer);
    const dejar = observarValor(el, leer);
    const dejarReset = alReiniciarFormulario(el, leer);
    return () => {
      el.removeEventListener('change', leer);
      dejar();
      dejarReset();
    };
  }, [leer]);
  // Las opciones pueden llegar después (p. ej. departamentos) o cambiar el valor controlado.
  useEffect(leer, [leer, opciones, props.value]);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setFiltro('');
  }, []);
  const { contenedor, clasePosicion } = usePanel(abierto, cerrar);

  const abrir = () => {
    if (disabled) return;
    setFiltro('');
    setActiva(Math.max(0, opciones.findIndex((o) => o.valor === valor)));
    setAbierto(true);
  };

  useEffect(() => {
    if (!abierto) return;
    (conBusqueda ? busqueda.current : lista.current)?.focus();
  }, [abierto, conBusqueda]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-indice="${activa}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activa, abierto]);

  const elegir = (opcion: Opcion | undefined) => {
    if (!opcion || opcion.deshabilitada || !nativo.current) return;
    asignarComoUsuario(nativo.current, opcion.valor, 'change');
    cerrar();
    boton.current?.focus();
  };

  const alTeclearLista = (e: KeyboardEvent) => {
    const mover = (paso: number) => {
      e.preventDefault();
      setActiva((i) => Math.min(Math.max(i + paso, 0), visibles.length - 1));
    };
    if (e.key === 'ArrowDown') mover(1);
    else if (e.key === 'ArrowUp') mover(-1);
    else if (e.key === 'Home') mover(-visibles.length);
    else if (e.key === 'End') mover(visibles.length);
    else if (e.key === 'Enter') {
      e.preventDefault();
      elegir(visibles[activa]);
    } else if (!conBusqueda && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Búsqueda por letras, como en un <select> nativo.
      const ahora = Date.now();
      const t = tecleado.current;
      t.texto = (ahora < t.hasta ? t.texto : '') + sinTildes(e.key);
      t.hasta = ahora + 700;
      const i = visibles.findIndex((o) => sinTildes(o.etiqueta).startsWith(t.texto));
      if (i >= 0) setActiva(i);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      cerrar();
      if (e.key === 'Escape') boton.current?.focus();
    }
  };

  const alTeclearBoton = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      abrir();
    }
  };

  const actual = opciones.find((o) => o.valor === valor);
  const idActiva = visibles[activa] ? `${idLista}-${activa}` : undefined;

  return (
    <div ref={contenedor} className={`relative ${className}`}>
      <select ref={combinarRefs(nativo, ref)} tabIndex={-1} aria-hidden="true" className="sr-only" disabled={disabled} {...props}>
        {children}
      </select>
      <button
        ref={boton}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-invalid={invalido}
        aria-describedby={describe}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={alTeclearBoton}
        className={CLASES_DISPARADOR}
      >
        <span className={`min-w-0 flex-1 truncate ${actual ? '' : 'text-tinta-tenue'}`}>{actual?.etiqueta ?? 'Seleccionar'}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 flex-none text-tinta-tenue transition-transform duration-200 ${abierto ? 'rotate-180 text-primario' : ''}`}
        />
      </button>

      {abierto && (
        <div className={`${CLASES_PANEL} ${clasePosicion}`}>
          {conBusqueda && (
            <div className="border-b border-borde p-2">
              <label className="flex items-center gap-2 rounded-lg bg-superficie-2 px-2.5 py-2 text-sm">
                <Search aria-hidden="true" className="h-4 w-4 text-tinta-tenue" />
                <input
                  ref={busqueda}
                  value={filtro}
                  onChange={(e) => {
                    setFiltro(e.target.value);
                    setActiva(0);
                  }}
                  onKeyDown={alTeclearLista}
                  placeholder="Buscar…"
                  aria-label="Buscar opción"
                  aria-controls={idLista}
                  aria-activedescendant={idActiva}
                  className="w-full bg-transparent text-tinta outline-none placeholder:text-tinta-tenue"
                />
              </label>
            </div>
          )}
          <ul
            ref={lista}
            id={idLista}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={conBusqueda ? undefined : idActiva}
            onKeyDown={conBusqueda ? undefined : alTeclearLista}
            className="max-h-64 overflow-y-auto overscroll-contain p-1.5 outline-none"
          >
            {visibles.length === 0 && <li className="px-3 py-6 text-center text-sm text-tinta-tenue">Sin resultados</li>}
            {visibles.map((o, i) => {
              const elegida = o.valor === valor;
              return (
                <li
                  key={o.valor}
                  id={`${idLista}-${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={elegida}
                  aria-disabled={o.deshabilitada || undefined}
                  onPointerEnter={() => setActiva(i)}
                  onClick={() => elegir(o)}
                  style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                  className={`opcion-entrada flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                    i === activa ? 'bg-primario/10 text-tinta' : 'text-tinta-secundaria'
                  } ${elegida ? 'font-semibold text-primario' : ''} ${o.deshabilitada ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
                  {elegida && <Check aria-hidden="true" className="h-4 w-4 flex-none" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
});

/* ---------- Selector de fecha ---------- */

const DIAS_SEMANA = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const NOMBRE_MES = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' });
const FECHA_LEGIBLE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const FECHA_COMPLETA = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const aIso = (d: Date) => d.toISOString().slice(0, 10);
const deIso = (iso: string) => new Date(`${iso}T00:00:00Z`);
const esIsoValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(deIso(v).getTime());

function sumarDias(iso: string, dias: number): string {
  const d = deIso(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return aIso(d);
}

function sumarMeses(iso: string, meses: number): string {
  const d = deIso(iso);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return aIso(d);
}

/** 42 días (6 semanas, lunes primero) que cubren el mes de `iso`. */
function diasDelMes(iso: string): string[] {
  const d = deIso(iso);
  const primero = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const desfase = (primero.getUTCDay() + 6) % 7;
  const inicio = aIso(primero);
  return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i - desfase));
}

type PropsFecha = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const EntradaFecha = forwardRef<HTMLInputElement, PropsFecha>(function EntradaFecha(
  { className = '', id, disabled, 'aria-invalid': invalido, 'aria-describedby': describe, placeholder = 'Elegir fecha', ...props },
  ref,
) {
  const nativo = useRef<HTMLInputElement | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const rejilla = useRef<HTMLDivElement>(null);
  const [valor, setValor] = useState('');
  const [abierto, setAbierto] = useState(false);
  const hoy = fechaIsoBogota();
  const [enfocada, setEnfocada] = useState(hoy);
  const [direccion, setDireccion] = useState<'izq' | 'der' | null>(null);

  const leer = useCallback(() => setValor(nativo.current?.value ?? ''), []);
  useLayoutEffect(() => {
    const el = nativo.current;
    if (!el) return;
    leer();
    el.addEventListener('input', leer);
    const dejar = observarValor(el, leer);
    const dejarReset = alReiniciarFormulario(el, leer);
    return () => {
      el.removeEventListener('input', leer);
      dejar();
      dejarReset();
    };
  }, [leer]);
  useEffect(leer, [leer, props.value]);

  const cerrar = useCallback(() => setAbierto(false), []);
  const { contenedor, clasePosicion } = usePanel(abierto, cerrar);
  const elegida = esIsoValida(valor) ? valor : null;

  const abrir = () => {
    if (disabled) return;
    setEnfocada(elegida ?? hoy);
    setDireccion(null);
    setAbierto(true);
  };

  useEffect(() => {
    if (abierto) rejilla.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [abierto, enfocada]);

  const fijar = (iso: string) => {
    if (!nativo.current) return;
    asignarComoUsuario(nativo.current, iso, 'input');
    cerrar();
    boton.current?.focus();
  };

  const moverA = (iso: string) => {
    const cambiaMes = iso.slice(0, 7) !== enfocada.slice(0, 7);
    if (cambiaMes) setDireccion(iso > enfocada ? 'der' : 'izq');
    setEnfocada(iso);
  };

  const alTeclear = (e: KeyboardEvent) => {
    const atajos: Record<string, () => string> = {
      ArrowLeft: () => sumarDias(enfocada, -1),
      ArrowRight: () => sumarDias(enfocada, 1),
      ArrowUp: () => sumarDias(enfocada, -7),
      ArrowDown: () => sumarDias(enfocada, 7),
      PageUp: () => sumarMeses(enfocada, e.shiftKey ? -12 : -1),
      PageDown: () => sumarMeses(enfocada, e.shiftKey ? 12 : 1),
    };
    if (atajos[e.key]) {
      e.preventDefault();
      moverA(atajos[e.key]!());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
      boton.current?.focus();
    }
  };

  const mes = enfocada.slice(0, 7);
  const dias = diasDelMes(enfocada);
  const titulo = `${NOMBRE_MES.format(deIso(enfocada))} ${enfocada.slice(0, 4)}`;

  return (
    <div ref={contenedor} className={`relative ${className}`}>
      <input
        ref={combinarRefs(nativo, ref)}
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        disabled={disabled}
        {...props}
      />
      <button
        ref={boton}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-invalid={invalido}
        aria-describedby={describe}
        onClick={() => (abierto ? cerrar() : abrir())}
        className={CLASES_DISPARADOR}
      >
        <Calendar aria-hidden="true" className={`h-4 w-4 flex-none ${abierto || elegida ? 'text-primario' : 'text-tinta-tenue'}`} />
        <span className={`min-w-0 flex-1 truncate ${elegida ? '' : 'text-tinta-tenue'}`}>
          {elegida ? FECHA_LEGIBLE.format(deIso(elegida)) : placeholder}
        </span>
      </button>

      {abierto && (
        <div role="dialog" aria-label="Elegir fecha" className={`${CLASES_PANEL} ${clasePosicion} w-[19rem] p-3`} onKeyDown={alTeclear}>
          <div className="mb-2 flex items-center gap-1">
            <BotonCalendario etiqueta="Año anterior" alPulsar={() => moverA(sumarMeses(enfocada, -12))}>
              <ChevronsLeft className="h-4 w-4" />
            </BotonCalendario>
            <BotonCalendario etiqueta="Mes anterior" alPulsar={() => moverA(sumarMeses(enfocada, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </BotonCalendario>
            <p key={mes} className="flex-1 animate-aparecer text-center text-sm font-bold capitalize text-tinta" aria-live="polite">
              {titulo}
            </p>
            <BotonCalendario etiqueta="Mes siguiente" alPulsar={() => moverA(sumarMeses(enfocada, 1))}>
              <ChevronRight className="h-4 w-4" />
            </BotonCalendario>
            <BotonCalendario etiqueta="Año siguiente" alPulsar={() => moverA(sumarMeses(enfocada, 12))}>
              <ChevronsRight className="h-4 w-4" />
            </BotonCalendario>
          </div>

          <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-bold uppercase tracking-wide text-tinta-tenue">
            {DIAS_SEMANA.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div
            ref={rejilla}
            key={mes}
            role="grid"
            className={`grid grid-cols-7 gap-0.5 ${direccion === 'der' ? 'mes-desde-derecha' : direccion === 'izq' ? 'mes-desde-izquierda' : ''}`}
          >
            {dias.map((dia) => {
              const delMes = dia.slice(0, 7) === mes;
              const esElegida = dia === elegida;
              const esHoy = dia === hoy;
              return (
                <button
                  key={dia}
                  type="button"
                  role="gridcell"
                  tabIndex={dia === enfocada ? 0 : -1}
                  aria-selected={esElegida}
                  aria-label={FECHA_COMPLETA.format(deIso(dia))}
                  onClick={() => fijar(dia)}
                  onFocus={() => setEnfocada(dia)}
                  className={`relative grid h-9 place-items-center rounded-xl text-sm tabular-nums transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primario ${
                    esElegida
                      ? 'scale-105 bg-gradient-to-b from-primario to-primario-oscuro font-bold text-white shadow-[0_6px_14px_-6px_rgb(var(--c-primario)/.7)]'
                      : delMes
                        ? 'text-tinta hover:bg-primario/10'
                        : 'text-tinta-tenue/60 hover:bg-superficie-2'
                  } ${esHoy && !esElegida ? 'font-bold text-primario ring-1 ring-inset ring-primario/40' : ''}`}
                >
                  {Number(dia.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-borde pt-3">
            <button
              type="button"
              onClick={() => fijar('')}
              className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-tinta-tenue transition-colors hover:bg-superficie-2 hover:text-tinta"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => fijar(hoy)}
              className="rounded-lg bg-primario/10 px-3 py-1.5 text-sm font-semibold text-primario transition-colors hover:bg-primario/20"
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

function BotonCalendario({ etiqueta, alPulsar, children }: { etiqueta: string; alPulsar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={alPulsar}
      className="grid h-8 w-8 place-items-center rounded-lg text-tinta-secundaria transition-all hover:bg-superficie-2 hover:text-primario active:scale-90"
    >
      {children}
    </button>
  );
}
