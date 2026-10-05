import bcrypt from 'bcrypt';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ErrorHttp, validarCuerpo } from '../../lib/errores.js';
import { prisma } from '../../lib/prisma.js';
import { aUsuario, SELECCION_USUARIO } from '../usuarios/usuarios.serializar.js';
import { autenticar, firmarToken } from '../../middleware/auth.js';

const MS_POR_MINUTO = 60_000;
// Hash de una contraseña cualquiera: iguala el tiempo de respuesta cuando el correo no existe.
const HASH_SENUELO = bcrypt.hashSync('contrasena-senuelo-sismocol', env.BCRYPT_ROUNDS);

const esquemaLogin = z.object({
  correo: z.email('Correo inválido').max(150).transform((c) => c.toLowerCase()),
  contrasena: z.string().min(1, 'Ingrese la contraseña').max(200),
});

const limiteLogin = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MIN * MS_POR_MINUTO,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Intente más tarde.' },
});

export const rutasAuth = Router();

rutasAuth.post('/login', limiteLogin, validarCuerpo(esquemaLogin), async (req, res) => {
  const { correo, contrasena } = req.body as z.infer<typeof esquemaLogin>;
  const usuario = await prisma.usuario.findUnique({
    where: { correo },
    select: { ...SELECCION_USUARIO, contrasenaHash: true },
  });
  const valida = await bcrypt.compare(contrasena, usuario?.contrasenaHash ?? HASH_SENUELO);
  if (!usuario || !valida || !usuario.activo) {
    throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
  }
  const token = firmarToken(usuario);
  const { exp } = jwt.decode(token) as { exp: number };
  req.log.info({ idUsuario: usuario.idUsuario }, 'Inicio de sesión');
  res.json({ token, expiraEn: new Date(exp * 1000).toISOString(), usuario: aUsuario(usuario) });
});

rutasAuth.get('/yo', autenticar, async (_req, res) => {
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { idUsuario: res.locals.usuario.idUsuario },
    select: SELECCION_USUARIO,
  });
  res.json(aUsuario(usuario));
});
