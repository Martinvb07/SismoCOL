import type { Rol } from '../../generated/prisma/client.js';

export const SELECCION_USUARIO = {
  idUsuario: true,
  nombre: true,
  correo: true,
  rol: true,
  activo: true,
  fechaCreacion: true,
} as const;

interface UsuarioBd {
  idUsuario: number;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  fechaCreacion: Date;
}

/** Forma pública de Usuario (docs/api-contrato.md); nunca expone el hash. */
export function aUsuario(u: UsuarioBd) {
  return {
    idUsuario: u.idUsuario,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol,
    activo: u.activo,
    fechaCreacion: u.fechaCreacion.toISOString(),
  };
}
