import mqtt, { type MqttClient } from 'mqtt';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

/*
 * Mensajes (ver Firmware/esp32/README.md):
 * - API → ESP32, en el tópico del dispositivo:  { idSimulacion, magnitud, duracionMs }
 * - ESP32 → API, en MQTT_TOPIC_ESTADO (ACK):     { idSimulacion, estado: "RECIBIDA" }
 * - ESP32 → API, en MQTT_TOPIC_LATIDO cada 10 s: { topico, rssi?, uptimeS? }
 *   y como último deseo (LWT) al desconectarse: { topico, conectado: false }
 */

export const DURACION_SENAL_MS = 5000;
const RECONEXION_MS = 5000;

const esquemaAck = z.object({ idSimulacion: z.number().int().positive(), estado: z.string().optional() });
const esquemaLatido = z.object({ topico: z.string().min(1).optional(), conectado: z.boolean().optional() });

const esperando = new Map<number, () => void>();
let cliente: MqttClient | null = null;
let avisoDesconexion = false;

async function registrarLatido(topico: string, conectado: boolean): Promise<void> {
  await prisma.dispositivoEsp32.updateMany({
    where: { topicoMqtt: topico },
    data: conectado ? { estado: 'EN_LINEA', ultimaConexion: new Date() } : { estado: 'DESCONECTADO' },
  });
}

function alRecibir(topico: string, carga: Buffer): void {
  let json: unknown;
  try {
    json = JSON.parse(carga.toString('utf8'));
  } catch {
    logger.warn({ topico }, 'MQTT: mensaje que no es JSON');
    return;
  }
  if (topico === env.MQTT_TOPIC_ESTADO) {
    const ack = esquemaAck.safeParse(json);
    if (ack.success) esperando.get(ack.data.idSimulacion)?.();
    return;
  }
  if (topico === env.MQTT_TOPIC_LATIDO) {
    const latido = esquemaLatido.safeParse(json);
    if (!latido.success) return;
    registrarLatido(latido.data.topico ?? env.MQTT_TOPIC_SIMULACION, latido.data.conectado !== false).catch((error: unknown) =>
      logger.error({ err: error }, 'MQTT: no se pudo registrar el latido'),
    );
  }
}

/** Conecta al broker. Si no está disponible, la API sigue y las simulaciones quedan FALLIDA. */
export function iniciarMqtt(): void {
  cliente = mqtt.connect(env.MQTT_URL, {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    clientId: `sismocol-api-${process.pid}`,
    reconnectPeriod: RECONEXION_MS,
    connectTimeout: RECONEXION_MS,
  });
  cliente.on('connect', () => {
    avisoDesconexion = false;
    logger.info({ url: env.MQTT_URL }, 'MQTT conectado');
    cliente?.subscribe([env.MQTT_TOPIC_ESTADO, env.MQTT_TOPIC_LATIDO], { qos: 1 });
  });
  cliente.on('message', alRecibir);
  // Reintenta cada 5 s; avisa una vez por desconexión para no llenar el log.
  cliente.on('error', (error) => {
    if (avisoDesconexion) return;
    avisoDesconexion = true;
    logger.warn({ err: error.message, url: env.MQTT_URL }, 'MQTT no disponible; las simulaciones quedarán FALLIDA hasta que conecte');
  });
}

export function detenerMqtt(): void {
  cliente?.end(true);
  cliente = null;
}

/** Publica la simulación y espera el ACK del ESP32. true si llegó a tiempo. */
export async function enviarSimulacion(topico: string, idSimulacion: number, magnitud: number): Promise<boolean> {
  const conexion = cliente;
  if (!conexion?.connected) return false;
  let plazo: NodeJS.Timeout | undefined;
  const ack = new Promise<boolean>((resolver) => {
    plazo = setTimeout(() => resolver(false), env.MQTT_ACK_TIMEOUT_MS);
    esperando.set(idSimulacion, () => resolver(true));
  });
  try {
    await conexion.publishAsync(topico, JSON.stringify({ idSimulacion, magnitud, duracionMs: DURACION_SENAL_MS }), { qos: 1 });
    return await ack;
  } catch (error) {
    logger.warn({ err: error }, 'MQTT: no se pudo publicar la simulación');
    return false;
  } finally {
    clearTimeout(plazo);
    esperando.delete(idSimulacion);
  }
}
