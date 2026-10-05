import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSesion } from '@/auth/sesion';
import { Insignia } from '@/componentes/ui/Basicos';
import { IconoCerrar, IconoMenu, IconoSalir } from '@/componentes/ui/Iconos';
import { ETIQUETAS_ROL } from '@/lib/etiquetas';
import { ITEMS_NAVEGACION, tituloDeRuta, type ItemNavegacion } from './navegacion';

const ID_MENU = 'menu-lateral';

function EnlaceMenu({ item }: { item: ItemNavegacion }) {
  const Icono = item.icono;
  return (
    <li>
      <NavLink
        to={item.ruta}
        end
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? 'bg-primario text-white' : 'text-white/80 hover:bg-lateral-claro hover:text-white'
          }`
        }
      >
        <Icono aria-hidden="true" />
        {item.titulo}
      </NavLink>
    </li>
  );
}

export function Layout() {
  const { usuario, rol, cerrarSesion } = useSesion();
  const ubicacion = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const visibles = ITEMS_NAVEGACION.filter((item) => rol && item.roles.includes(rol));
  const principales = visibles.filter((i) => i.seccion === 'principal');
  const administracion = visibles.filter((i) => i.seccion === 'administracion');
  const titulo = tituloDeRuta(ubicacion.pathname);

  // Cierra el menú (modo tableta) al navegar
  useEffect(() => setMenuAbierto(false), [ubicacion.pathname]);

  useEffect(() => {
    document.title = `${titulo} · SismoCol`;
  }, [titulo]);

  return (
    <div className="min-h-screen bg-fondo text-tinta">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>

      {menuAbierto && (
        <div className="fixed inset-0 z-30 bg-lateral/50 lg:hidden" aria-hidden="true" onClick={() => setMenuAbierto(false)} />
      )}

      <aside
        id={ID_MENU}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-lateral text-white transition-transform lg:translate-x-0 ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menú principal"
      >
        <div className="flex items-center justify-between border-b border-lateral-borde px-5 py-4">
          <div>
            <p className="text-lg font-bold tracking-tight">SismoCol</p>
            <p className="text-xs text-white/70">Actividad sísmica en Colombia</p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-white/80 hover:bg-lateral-claro lg:hidden"
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
          >
            <IconoCerrar />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {principales.map((item) => (
              <EnlaceMenu key={item.ruta} item={item} />
            ))}
          </ul>
          {administracion.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-white/60">Administración</p>
              <ul className="space-y-1">
                {administracion.map((item) => (
                  <EnlaceMenu key={item.ruta} item={item} />
                ))}
              </ul>
            </>
          )}
        </nav>
        <div className="border-t border-lateral-borde px-5 py-4 text-sm">
          <p className="truncate font-medium">{usuario?.nombre}</p>
          <p className="truncate text-xs text-white/70">{usuario?.correo}</p>
          <button
            type="button"
            onClick={cerrarSesion}
            className="mt-3 inline-flex items-center gap-2 rounded px-2 py-1 text-white/85 hover:bg-lateral-claro hover:text-white"
          >
            <IconoSalir /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-borde bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            className="rounded p-1.5 text-tinta hover:bg-fondo lg:hidden"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            aria-controls={ID_MENU}
            aria-expanded={menuAbierto}
          >
            <IconoMenu />
          </button>
          <h1 className="flex-1 truncate text-lg font-semibold">{titulo}</h1>
          {rol && <Insignia tono="marca">{ETIQUETAS_ROL[rol]}</Insignia>}
        </header>
        <main id="contenido" tabIndex={-1} className="mx-auto max-w-7xl space-y-4 p-4 focus:outline-none sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
