import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Rol } from '@/api/tipos';
import { RUTA_LOGIN, useSesion, type EstadoNavegacionLogin } from './ContextoSesion';

interface Props {
  /** Roles permitidos. Sin valor: cualquier usuario autenticado. */
  roles?: readonly Rol[];
}

export function RutaProtegida({ roles }: Props) {
  const { autenticado, rol } = useSesion();
  const ubicacion = useLocation();

  if (!autenticado) {
    const estado: EstadoNavegacionLogin = { desde: ubicacion.pathname };
    return <Navigate to={RUTA_LOGIN} replace state={estado} />;
  }
  if (roles && (!rol || !roles.includes(rol))) {
    return <Navigate to="/sin-permiso" replace />;
  }
  return <Outlet />;
}
