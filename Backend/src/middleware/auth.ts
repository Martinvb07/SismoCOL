import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Rol } from '../generated/prisma/client.js';
import { ErrorHttp } from '../lib/errores.js';
import { prisma } from '../lib/prisma.js';

export interface UsuarioSesion {
  idUsuario: number;
  nombre: string;
  correo: string;
  rol: Rol;
}

declare module 'express-serve-static-core' {
  interface Locals {
    usuario: UsuarioSesion;
  }
}

const esquemaToken = z.object({ sub: z.coerce.number().int().positive(), rol: z.enum(Rol) });

export function firmarToken(usuario: { idUsuario: number; rol: Rol }): string {
  return jwt.sign({ rol: usuario.rol }, env.JWT_SECRET, {
    subject: String(usuario.idUsuario),
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/** Exige un JWT válido de un usuario activo; el usuario queda en res.locals.usuario. */
export const autenticar: RequestHandler = async (req, res, next) => {
  const cabecera = req.headers.authorization;
  if (!cabecera?.startsWith('Bearer ')) {
    next(new ErrorHttp(401, 'Sesión requerida'));
    return;
  }
  let idUsuario: number;
  try {
    const carga = jwt.verify(cabecera.slice('Bearer '.length), env.JWT_SECRET, { algorithms: ['HS256'] });
    idUsuario = esquemaToken.parse(carga).sub;
  } catch {
    next(new ErrorHttp(401, 'Sesión inválida o vencida'));
    return;
  }
  // Se consulta la base en cada petición para respetar desactivaciones y cambios de rol.
  const usuario = await prisma.usuario.findUnique({
    where: { idUsuario },
    select: { idUsuario: true, nombre: true, correo: true, rol: true, activo: true },
  });
  if (!usuario?.activo) {
    next(new ErrorHttp(401, 'Sesión inválida o vencida'));
    return;
  }
  const { activo: _activo, ...sesion } = usuario;
  res.locals.usuario = sesion;
  next();
};

export function requerirRol(...roles: Rol[]): RequestHandler {
  return (_req, res, next) => {
    if (!roles.includes(res.locals.usuario.rol)) {
      next(new ErrorHttp(403, 'No tiene permisos para esta acción'));
      return;
    }
    next();
  };
}

export const soloAdmin = requerirRol(Rol.ADMIN);
