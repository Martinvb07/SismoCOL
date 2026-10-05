import { createContext, useContext } from 'react';
import type { CuerpoLogin, Rol, Usuario } from '@/api/tipos';

export interface ValorSesion {
  usuario: Usuario | null;
  rol: Rol | null;
  autenticado: boolean;
  iniciarSesion: (credenciales: CuerpoLogin) => Promise<Usuario>;
  cerrarSesion: () => void;
}

export const ContextoSesion = createContext<ValorSesion | null>(null);

export const RUTA_LOGIN = '/login';

/** Estado que se pasa a /login al redirigir. */
export interface EstadoNavegacionLogin {
  desde?: string;
  motivo?: 'expirada';
}

export function useSesion(): ValorSesion {
  const valor = useContext(ContextoSesion);
  if (!valor) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return valor;
}
