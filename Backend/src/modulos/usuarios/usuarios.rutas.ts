import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { Prisma, Rol } from '../../generated/prisma/client.js';
import { ErrorHttp, validarCuerpo, validarQuery } from '../../lib/errores.js';
import { esquemaPaginacion, paginado } from '../../lib/paginacion.js';
import { prisma } from '../../lib/prisma.js';
import { autenticar, soloAdmin } from '../../middleware/auth.js';
import { aUsuario, SELECCION_USUARIO } from './usuarios.serializar.js';

// Misma regla que el seed y el formulario del frontend.
const contrasena = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(200)
  .regex(/[A-Za-z]/, 'Debe incluir letras')
  .regex(/\d/, 'Debe incluir números');

const nombre = z.string().trim().min(1, 'Ingrese el nombre').max(100);

const esquemaCrear = z.object({
  nombre,
  correo: z.email('Correo inválido').max(150).transform((c) => c.toLowerCase()),
  contrasena,
  rol: z.enum(Rol),
});

const esquemaEditar = z
  .object({ nombre: nombre.optional(), rol: z.enum(Rol).optional(), activo: z.boolean().optional(), contrasena: contrasena.optional() })
  .refine((c) => Object.values(c).some((v) => v !== undefined), 'No hay cambios');

const esquemaId = z.object({ id: z.coerce.number().int().positive() });

const CODIGO_UNICO_VIOLADO = 'P2002';
const CODIGO_NO_ENCONTRADO = 'P2025';

const soloAdmins = [autenticar, soloAdmin];

export const rutasUsuarios = Router();

rutasUsuarios.get('/usuarios', ...soloAdmins, validarQuery(esquemaPaginacion), async (_req, res) => {
  const { pagina, tamano } = res.locals.query as z.infer<typeof esquemaPaginacion>;
  const [datos, total] = await prisma.$transaction([
    prisma.usuario.findMany({
      select: SELECCION_USUARIO,
      orderBy: { idUsuario: 'asc' },
      skip: (pagina - 1) * tamano,
      take: tamano,
    }),
    prisma.usuario.count(),
  ]);
  res.json(paginado(datos.map(aUsuario), total, pagina, tamano));
});

rutasUsuarios.post('/usuarios', ...soloAdmins, validarCuerpo(esquemaCrear), async (req, res) => {
  const { contrasena: clave, ...datos } = req.body as z.infer<typeof esquemaCrear>;
  try {
    const usuario = await prisma.usuario.create({
      data: { ...datos, contrasenaHash: await bcrypt.hash(clave, env.BCRYPT_ROUNDS) },
      select: SELECCION_USUARIO,
    });
    req.log.info({ idUsuario: usuario.idUsuario }, 'Usuario creado');
    res.status(201).json(aUsuario(usuario));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_UNICO_VIOLADO) {
      throw new ErrorHttp(409, 'Ya existe un usuario con ese correo');
    }
    throw error;
  }
});

rutasUsuarios.patch('/usuarios/:id', ...soloAdmins, validarCuerpo(esquemaEditar), async (req, res) => {
  const { id } = esquemaId.parse(req.params);
  const { contrasena: clave, ...cambios } = req.body as z.infer<typeof esquemaEditar>;
  if (id === res.locals.usuario.idUsuario && (cambios.activo === false || (cambios.rol && cambios.rol !== Rol.ADMIN))) {
    throw new ErrorHttp(409, 'No puede desactivarse ni quitarse el rol de administrador a sí mismo');
  }
  try {
    const usuario = await prisma.usuario.update({
      where: { idUsuario: id },
      data: { ...cambios, ...(clave && { contrasenaHash: await bcrypt.hash(clave, env.BCRYPT_ROUNDS) }) },
      select: SELECCION_USUARIO,
    });
    req.log.info({ idUsuario: id, campos: Object.keys(req.body as object) }, 'Usuario actualizado');
    res.json(aUsuario(usuario));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === CODIGO_NO_ENCONTRADO) {
      throw new ErrorHttp(404, 'El usuario no existe');
    }
    throw error;
  }
});
