import { Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSesion } from '@/auth/sesion';
import { Insignia } from '@/componentes/ui/Basicos';
import { EstadoCargando } from '@/componentes/ui/Estados';
import {
  IconoCalendario,
  IconoCerrar,
  IconoContraer,
  IconoLuna,
  IconoMenu,
  IconoSalir,
  IconoSol,
} from '@/componentes/ui/Iconos';
import { Logo } from '@/componentes/ui/Marca';
import { ETIQUETAS_ROL } from '@/lib/etiquetas';
import { ITEMS_NAVEGACION, itemDeRuta, RUTAS, type ItemNavegacion } from './navegacion';
import { useLateralMini, useTema } from './preferencias';

const ID_CAJON = 'menu-cajon';
const GRUPOS: Array<[ItemNavegacion['seccion'], string]> = [
  ['principal', 'Explorar'],
  ['administracion', 'Administración'],
];
const HOY = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });

function iniciales(nombre: string | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

/** Lista de secciones con un resaltado que se desliza hasta la activa. */
function Navegacion({ alElegir }: { alElegir?: () => void }) {
  const { rol } = useSesion();
  const { pathname } = useLocation();
  const caja = useRef<HTMLElement>(null);
  const [pildora, setPildora] = useState<{ y: number; alto: number; lista: boolean } | null>(null);
  const visibles = ITEMS_NAVEGACION.filter((item) => rol && item.roles.includes(rol));

  useLayoutEffect(() => {
    const elemento = caja.current;
    if (!elemento) return;
    const medir = () => {
      const activo = elemento.querySelector<HTMLElement>('a.activo');
      // La primera medición no anima: la píldora aparece ya en su sitio.
      setPildora((p) => (activo ? { y: activo.offsetTop, alto: activo.offsetHeight, lista: !!p } : null));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [pathname, visibles.length]);

  let indice = 0;
  return (
    <nav className="lateral-nav" ref={caja} aria-label="Secciones">
      {pildora && (
        <span
          aria-hidden="true"
          className={`lateral-pildora ${pildora.lista ? '' : 'quieta'}`}
          style={{ transform: `translateY(${pildora.y}px)`, height: pildora.alto }}
        />
      )}
      {GRUPOS.map(([seccion, etiqueta]) => {
        const items = visibles.filter((i) => i.seccion === seccion);
        if (items.length === 0) return null;
        return (
          <div key={seccion} className="grid gap-0.5">
            <small className="lateral-grupo">{etiqueta}</small>
            {items.map((item) => {
              const Icono = item.icono;
              return (
                <NavLink
                  key={item.ruta}
                  to={item.ruta}
                  end
                  title={item.titulo}
                  onClick={alElegir}
                  style={{ '--i': indice++ } as CSSProperties}
                  className={({ isActive }) => `lateral-enlace ${isActive ? 'activo' : ''}`}
                >
                  <Icono aria-hidden="true" />
                  <span className="lateral-etiqueta">{item.titulo}</span>
                </NavLink>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function Perfil() {
  const { usuario, rol } = useSesion();
  return (
    <div className="lateral-perfil" title={usuario?.nombre}>
      <span className="avatar" aria-hidden="true">
        {iniciales(usuario?.nombre)}
      </span>
      <div className="lateral-quien">
        <b>{usuario?.nombre}</b>
        <small>{rol === 'ADMIN' ? 'Administrador' : 'Usuario'}</small>
      </div>
    </div>
  );
}

function PieLateral({ mini, alContraer }: { mini?: boolean; alContraer?: () => void }) {
  const { cerrarSesion } = useSesion();
  const [tema, alternarTema] = useTema();
  const oscuro = tema === 'oscuro';
  return (
    <div className="lateral-pie">
      <button type="button" className="lateral-accion" onClick={alternarTema} title={oscuro ? 'Tema claro' : 'Tema oscuro'}>
        <span className="icono-tema inline-flex" key={tema} aria-hidden="true">
          {oscuro ? <IconoSol /> : <IconoLuna />}
        </span>
        <span className="lateral-etiqueta">{oscuro ? 'Tema claro' : 'Tema oscuro'}</span>
      </button>
      <button type="button" className="lateral-accion peligro" onClick={cerrarSesion} title="Cerrar sesión">
        <IconoSalir aria-hidden="true" />
        <span className="lateral-etiqueta">Cerrar sesión</span>
      </button>
      {alContraer && (
        <button
          type="button"
          className="lateral-accion"
          onClick={alContraer}
          aria-expanded={!mini}
          title={mini ? 'Expandir menú' : 'Contraer menú'}
        >
          <IconoContraer abierto={!mini} aria-hidden="true" />
          <span className="lateral-etiqueta">Contraer menú</span>
        </button>
      )}
    </div>
  );
}

function MarcaLateral({ alCerrar }: { alCerrar?: () => void }) {
  return (
    <div className="lateral-logo">
      <NavLink to={RUTAS.consulta} className="lateral-marca flex min-w-0 flex-1 items-center gap-3" onClick={alCerrar}>
        <Logo />
        <span className="lateral-nombre">
          Sismo<span>Col</span>
        </span>
      </NavLink>
      {alCerrar && (
        <button type="button" className="boton-icono" onClick={alCerrar} aria-label="Cerrar menú">
          <IconoCerrar />
        </button>
      )}
    </div>
  );
}

export function Layout() {
  const { rol } = useSesion();
  const { pathname } = useLocation();
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const [mini, alternarMini] = useLateralMini();

  const item = itemDeRuta(pathname);
  const titulo = item?.titulo ?? 'SismoCol';

  // Cierra el cajón (celular y tableta) al navegar
  useEffect(() => setCajonAbierto(false), [pathname]);

  useEffect(() => {
    document.title = `${titulo} · SismoCol`;
  }, [titulo]);

  useEffect(() => {
    if (!cajonAbierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setCajonAbierto(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [cajonAbierto]);

  return (
    <div className="armazon text-tinta">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-superficie focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>

      <aside className="lateral" aria-label="Menú principal">
        <MarcaLateral />
        <Perfil />
        <Navegacion />
        <PieLateral mini={mini} alContraer={alternarMini} />
      </aside>

      {cajonAbierto && (
        <>
          <div className="cajon-velo lg:hidden" aria-hidden="true" onClick={() => setCajonAbierto(false)} />
          <aside id={ID_CAJON} className="cajon lg:hidden" aria-label="Menú de secciones">
            <MarcaLateral alCerrar={() => setCajonAbierto(false)} />
            <Perfil />
            <Navegacion alElegir={() => setCajonAbierto(false)} />
            <PieLateral />
          </aside>
        </>
      )}

      <div className="armazon-principal">
        <header className="barra-superior">
          <button
            type="button"
            className="boton-icono lg:hidden"
            onClick={() => setCajonAbierto(true)}
            aria-label="Abrir menú"
            aria-controls={ID_CAJON}
            aria-expanded={cajonAbierto}
          >
            <IconoMenu />
          </button>
          <div className="barra-titulo" key={pathname}>
            <h1>{titulo}</h1>
            {item && <p>{item.descripcion}</p>}
          </div>
          <span className="chip hidden xl:inline-flex">
            <IconoCalendario className="text-primario" aria-hidden="true" />
            <span className="first-letter:uppercase">{HOY.format(new Date())}</span>
          </span>
          <span className="chip hidden md:inline-flex" title="Datos del catálogo sísmico">
            <span className="chip-vivo" aria-hidden="true" />
            En línea
          </span>
          {rol && <Insignia tono="marca">{ETIQUETAS_ROL[rol]}</Insignia>}
        </header>
        <main id="contenido" tabIndex={-1} className="w-full flex-1 focus:outline-none">
          <div key={pathname} className="pagina-entrada mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-8">
            {/* El lateral se queda mientras carga cada vista */}
            <Suspense fallback={<EstadoCargando texto="Cargando vista…" alto="h-64" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <footer className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 pb-8 text-xs text-tinta-tenue sm:px-8">
          <Logo tamano={20} />
          <span>SismoCol · Universidad Cooperativa de Colombia · No predice sismos ni reemplaza los boletines del SGC</span>
        </footer>
      </div>
    </div>
  );
}
