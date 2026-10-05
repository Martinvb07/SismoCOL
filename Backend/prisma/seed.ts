/* Datos iniciales. Es idempotente: se puede correr varias veces sin duplicar.
   Las contraseñas solo se fijan al crear el usuario; si ya existe, no se tocan. */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { PrismaClient, Rol } from '../src/generated/prisma/client.js';

const contrasenaSegura = z
  .string()
  .min(10, 'mínimo 10 caracteres')
  .regex(/[A-Za-z]/, 'debe incluir letras')
  .regex(/\d/, 'debe incluir números');

const esquemaSeed = z.object({
  DATABASE_URL: z.string().startsWith('mysql://'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  MQTT_TOPIC_SIMULACION: z.string().min(1).default('sismos/simulacion'),
  SEED_ADMIN_NOMBRE: z.string().min(1).max(100),
  SEED_ADMIN_CORREO: z.email().max(150),
  SEED_ADMIN_CONTRASENA: contrasenaSegura,
  SEED_USUARIO_NOMBRE: z.string().min(1).max(100),
  SEED_USUARIO_CORREO: z.email().max(150),
  SEED_USUARIO_CONTRASENA: contrasenaSegura,
  SEED_ESP32_NOMBRE: z.string().min(1).max(80),
});

const resultado = esquemaSeed.safeParse(process.env);
if (!resultado.success) {
  const detalle = resultado.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`Variables del seed inválidas en Backend/.env:\n${detalle}`);
  process.exit(1);
}
const cfg = resultado.data;

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(cfg.DATABASE_URL) });

async function asegurarUsuario(nombre: string, correo: string, contrasena: string, rol: Rol) {
  const correoNormalizado = correo.toLowerCase();
  const existente = await prisma.usuario.findUnique({ where: { correo: correoNormalizado } });
  if (existente) return existente;
  return prisma.usuario.create({
    data: {
      nombre,
      correo: correoNormalizado,
      contrasenaHash: await bcrypt.hash(contrasena, cfg.BCRYPT_ROUNDS),
      rol,
    },
  });
}

async function main() {
  const admin = await asegurarUsuario(
    cfg.SEED_ADMIN_NOMBRE,
    cfg.SEED_ADMIN_CORREO,
    cfg.SEED_ADMIN_CONTRASENA,
    Rol.ADMIN,
  );
  await asegurarUsuario(
    cfg.SEED_USUARIO_NOMBRE,
    cfg.SEED_USUARIO_CORREO,
    cfg.SEED_USUARIO_CONTRASENA,
    Rol.USUARIO,
  );

  await prisma.dispositivoEsp32.upsert({
    where: { topicoMqtt: cfg.MQTT_TOPIC_SIMULACION },
    update: {},
    create: { nombre: cfg.SEED_ESP32_NOMBRE, topicoMqtt: cfg.MQTT_TOPIC_SIMULACION },
  });

  // Los valores por defecto de la configuración están en el schema.
  if ((await prisma.configuracionAnalisis.count()) === 0) {
    await prisma.configuracionAnalisis.create({ data: { idUsuario: admin.idUsuario } });
  }

  const [usuarios, dispositivos, configuraciones] = await Promise.all([
    prisma.usuario.count(),
    prisma.dispositivoEsp32.count(),
    prisma.configuracionAnalisis.count(),
  ]);
  console.log(
    `Seed listo — usuarios: ${usuarios}, dispositivos: ${dispositivos}, configuraciones: ${configuraciones}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed fallido:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
