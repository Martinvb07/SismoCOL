import type { Usuario } from '@/api/tipos';
import { CLAVE_SESION } from '@/config';

/**
 * Persistencia de la sesión en sessionStorage (se borra al cerrar la pestaña).
 * No depende de React para que el cliente HTTP pueda leer el token.
 */
export interface SesionGuardada {
  token: string;
  expiraEn: string;
  usuario: Usuario;
}

type Oyente = (sesion: SesionGuardada | null) => void;
const oyentes = new Set<Oyente>();

function esSesionValida(valor: unknown): valor is SesionGuardada {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return typeof v.token === 'string' && typeof v.expiraEn === 'string' && typeof v.usuario === 'object' && v.usuario !== null;
}

export function sesionVencida(sesion: SesionGuardada, ahora: number = Date.now()): boolean {
  const vence = Date.parse(sesion.expiraEn);
  return Number.isNaN(vence) || vence <= ahora;
}

export function leerSesion(): SesionGuardada | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_SESION);
    if (!crudo) return null;
    const valor: unknown = JSON.parse(crudo);
    if (!esSesionValida(valor) || sesionVencida(valor)) {
      sessionStorage.removeItem(CLAVE_SESION);
      return null;
    }
    return valor;
  } catch {
    return null;
  }
}

export function leerToken(): string | null {
  return leerSesion()?.token ?? null;
}

function notificar(sesion: SesionGuardada | null): void {
  oyentes.forEach((oyente) => oyente(sesion));
}

export function guardarSesion(sesion: SesionGuardada): void {
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
  } catch {
    // sessionStorage no disponible (modo privado estricto): la sesión vive solo en memoria
  }
  notificar(sesion);
}

export function borrarSesion(): void {
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    // sin almacenamiento disponible
  }
  notificar(null);
}

export function suscribirseSesion(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}
