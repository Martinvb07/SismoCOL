import 'dotenv/config';
import { z } from 'zod';

const secreto = (nombre: string) =>
  z.string().min(32, `${nombre} debe tener al menos 32 caracteres`);

const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((valor) => valor.split(',').map((origen) => origen.trim()).filter(Boolean)),

  DATABASE_URL: z.string().startsWith('mysql://'),

  JWT_SECRET: secreto('JWT_SECRET'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'Formato esperado: 30m, 8h, 1d…').default('8h'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(15),

  ANALYTICS_URL: z.url(),
  ANALYTICS_TOKEN: secreto('ANALYTICS_TOKEN'),
  UPLOAD_MAX_MB: z.coerce.number().positive().max(100).default(25),

  MQTT_URL: z.string().regex(/^mqtts?:\/\//, 'Debe empezar por mqtt:// o mqtts://'),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_TOPIC_SIMULACION: z.string().min(1).default('sismos/simulacion'),
  MQTT_TOPIC_ESTADO: z.string().min(1).default('sismos/estado'),
  MQTT_TOPIC_LATIDO: z.string().min(1).default('sismos/latido'),
  MQTT_ACK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  MQTT_LATIDO_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

export type Env = z.infer<typeof esquemaEnv>;

function cargarEnv(): Env {
  const resultado = esquemaEnv.safeParse(process.env);
  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // console y no el logger: el logger depende de esta configuración.
    console.error(`Variables de entorno inválidas en Backend/.env:\n${detalle}`);
    process.exit(1);
  }
  return resultado.data;
}

export const env = cargarEnv();
