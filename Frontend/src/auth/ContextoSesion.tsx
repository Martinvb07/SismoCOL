import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { registrarManejadorNoAutorizado } from '@/api/cliente';
import { apiAuth } from '@/api/endpoints';
import type { CuerpoLogin } from '@/api/tipos';
import { borrarSesion, guardarSesion, leerSesion, suscribirseSesion, type SesionGuardada } from './almacenSesion';
import { ContextoSesion, RUTA_LOGIN, type EstadoNavegacionLogin, type ValorSesion } from './sesion';

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionGuardada | null>(() => leerSesion());
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const clienteConsultas = useQueryClient();

  useEffect(() => suscribirseSesion(setSesion), []);

  // Ante un 401 el cliente borra la sesión; aquí se redirige a /login conservando el destino.
  useEffect(() => {
    registrarManejadorNoAutorizado(() => {
      clienteConsultas.clear();
      if (ubicacion.pathname !== RUTA_LOGIN) {
        const estado: EstadoNavegacionLogin = { desde: ubicacion.pathname, motivo: 'expirada' };
        navegar(RUTA_LOGIN, { replace: true, state: estado });
      }
    });
    return () => registrarManejadorNoAutorizado(null);
  }, [navegar, ubicacion.pathname, clienteConsultas]);

  // Cierra la sesión cuando vence el token, aunque no haya peticiones.
  useEffect(() => {
    if (!sesion) return;
    const restante = Date.parse(sesion.expiraEn) - Date.now();
    const temporizador = setTimeout(() => borrarSesion(), Math.max(restante, 0));
    return () => clearTimeout(temporizador);
  }, [sesion]);

  const iniciarSesion = useCallback(async (credenciales: CuerpoLogin) => {
    const respuesta = await apiAuth.login(credenciales);
    guardarSesion({ token: respuesta.token, expiraEn: respuesta.expiraEn, usuario: respuesta.usuario });
    return respuesta.usuario;
  }, []);

  const cerrarSesion = useCallback(() => {
    borrarSesion();
    clienteConsultas.clear();
    navegar(RUTA_LOGIN, { replace: true });
  }, [clienteConsultas, navegar]);

  const valor = useMemo<ValorSesion>(
    () => ({
      usuario: sesion?.usuario ?? null,
      rol: sesion?.usuario.rol ?? null,
      autenticado: sesion !== null,
      iniciarSesion,
      cerrarSesion,
    }),
    [sesion, iniciarSesion, cerrarSesion],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}
