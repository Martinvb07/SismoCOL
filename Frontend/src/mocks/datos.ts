/**
 * Datos simulados verosímiles para desarrollar sin backend.
 * Se generan de forma determinista (semilla fija) para que las pantallas sean estables.
 */
import type {
  Advertencia,
  Carga,
  ConfiguracionAnalisis,
  Dispositivo,
  ModeloPredictivo,
  NivelImpacto,
  Simulacion,
  Sismo,
  Usuario,
} from '@/api/tipos';

export const FECHA_CORTE = '2026-08-10T12:34:28.000Z';
const INICIO_CATALOGO = Date.parse('2022-11-01T00:00:00.000Z');
const FIN_CATALOGO = Date.parse(FECHA_CORTE);
const SEMILLA = 20261005;
const TOTAL_SISMOS_SGC = 4200;

/** Generador pseudoaleatorio mulberry32 (determinista). */
export function crearAleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Municipio {
  nombre: string;
  lat: number;
  lon: number;
}

interface DefinicionZona {
  zona: string;
  departamento: string;
  region: string;
  peso: number;
  profundidad: [media: number, desviacion: number];
  municipios: Municipio[];
}

/** Centroides aproximados (DIVIPOLA) de municipios con sismicidad frecuente. */
const ZONAS: DefinicionZona[] = [
  {
    zona: 'Nido de Bucaramanga',
    departamento: 'Santander',
    region: 'Andina',
    peso: 49,
    profundidad: [145, 9],
    municipios: [
      { nombre: 'Los Santos', lat: 6.756, lon: -73.102 },
      { nombre: 'Piedecuesta', lat: 6.987, lon: -73.05 },
      { nombre: 'Bucaramanga', lat: 7.119, lon: -73.122 },
      { nombre: 'Zapatoca', lat: 6.815, lon: -73.268 },
      { nombre: 'Betulia', lat: 6.9, lon: -73.284 },
    ],
  },
  {
    zona: 'Santander',
    departamento: 'Santander',
    region: 'Andina',
    peso: 6,
    profundidad: [14, 8],
    municipios: [
      { nombre: 'Barrancabermeja', lat: 7.065, lon: -73.854 },
      { nombre: 'San Gil', lat: 6.555, lon: -73.134 },
      { nombre: 'El Carmen de Chucurí', lat: 6.698, lon: -73.511 },
    ],
  },
  {
    zona: 'Meta',
    departamento: 'Meta',
    region: 'Orinoquía',
    peso: 8,
    profundidad: [12, 6],
    municipios: [
      { nombre: 'Mesetas', lat: 3.384, lon: -74.044 },
      { nombre: 'Uribe', lat: 3.239, lon: -74.352 },
      { nombre: 'Villavicencio', lat: 4.142, lon: -73.626 },
      { nombre: 'Puerto Gaitán', lat: 4.314, lon: -72.082 },
    ],
  },
  {
    zona: 'Cundinamarca',
    departamento: 'Cundinamarca',
    region: 'Andina',
    peso: 4,
    profundidad: [10, 5],
    municipios: [
      { nombre: 'Paratebueno', lat: 4.375, lon: -73.214 },
      { nombre: 'Medina', lat: 4.506, lon: -73.35 },
      { nombre: 'Guaduas', lat: 5.069, lon: -74.598 },
    ],
  },
  {
    zona: 'Huila',
    departamento: 'Huila',
    region: 'Andina',
    peso: 5,
    profundidad: [18, 10],
    municipios: [
      { nombre: 'Neiva', lat: 2.927, lon: -75.282 },
      { nombre: 'La Plata', lat: 2.39, lon: -75.892 },
      { nombre: 'Algeciras', lat: 2.522, lon: -75.316 },
    ],
  },
  {
    zona: 'Antioquia',
    departamento: 'Antioquia',
    region: 'Andina',
    peso: 5,
    profundidad: [20, 12],
    municipios: [
      { nombre: 'Urrao', lat: 6.317, lon: -76.134 },
      { nombre: 'Dabeiba', lat: 7.0, lon: -76.26 },
      { nombre: 'Frontino', lat: 6.776, lon: -76.131 },
      { nombre: 'Medellín', lat: 6.244, lon: -75.581 },
    ],
  },
  {
    zona: 'Chocó',
    departamento: 'Chocó',
    region: 'Pacífica',
    peso: 6,
    profundidad: [35, 18],
    municipios: [
      { nombre: 'Bahía Solano', lat: 6.223, lon: -77.403 },
      { nombre: 'Nuquí', lat: 5.711, lon: -77.271 },
      { nombre: 'Juradó', lat: 7.104, lon: -77.762 },
      { nombre: 'Quibdó', lat: 5.694, lon: -76.661 },
    ],
  },
  {
    zona: 'Valle del Cauca',
    departamento: 'Valle del Cauca',
    region: 'Pacífica',
    peso: 4,
    profundidad: [60, 35],
    municipios: [
      { nombre: 'Buenaventura', lat: 3.882, lon: -77.031 },
      { nombre: 'Calima', lat: 3.934, lon: -76.484 },
      { nombre: 'Cali', lat: 3.452, lon: -76.532 },
    ],
  },
  {
    zona: 'Nariño',
    departamento: 'Nariño',
    region: 'Pacífica',
    peso: 4,
    profundidad: [40, 25],
    municipios: [
      { nombre: 'Tumaco', lat: 1.806, lon: -78.765 },
      { nombre: 'Pasto', lat: 1.214, lon: -77.281 },
      { nombre: 'Ipiales', lat: 0.828, lon: -77.64 },
    ],
  },
  {
    zona: 'Cauca',
    departamento: 'Cauca',
    region: 'Pacífica',
    peso: 3,
    profundidad: [25, 15],
    municipios: [
      { nombre: 'Popayán', lat: 2.444, lon: -76.614 },
      { nombre: 'Páez', lat: 2.65, lon: -75.97 },
      { nombre: 'Guapi', lat: 2.571, lon: -77.886 },
    ],
  },
  {
    zona: 'Norte de Santander',
    departamento: 'Norte de Santander',
    region: 'Andina',
    peso: 2,
    profundidad: [15, 8],
    municipios: [
      { nombre: 'Cúcuta', lat: 7.893, lon: -72.508 },
      { nombre: 'Tibú', lat: 8.639, lon: -72.734 },
    ],
  },
  {
    zona: 'Boyacá',
    departamento: 'Boyacá',
    region: 'Andina',
    peso: 2,
    profundidad: [12, 7],
    municipios: [
      { nombre: 'Labranzagrande', lat: 5.563, lon: -72.578 },
      { nombre: 'Chiscas', lat: 6.553, lon: -72.5 },
    ],
  },
  {
    zona: 'Tolima',
    departamento: 'Tolima',
    region: 'Andina',
    peso: 1,
    profundidad: [14, 8],
    municipios: [{ nombre: 'Planadas', lat: 3.197, lon: -75.645 }],
  },
  {
    zona: 'Casanare',
    departamento: 'Casanare',
    region: 'Orinoquía',
    peso: 0.4,
    profundidad: [10, 5],
    municipios: [{ nombre: 'Aguazul', lat: 5.173, lon: -72.555 }],
  },
  {
    zona: 'La Guajira',
    departamento: 'La Guajira',
    region: 'Caribe',
    peso: 0.3,
    profundidad: [20, 10],
    municipios: [{ nombre: 'Uribia', lat: 11.714, lon: -72.266 }],
  },
  {
    zona: 'Córdoba',
    departamento: 'Córdoba',
    region: 'Caribe',
    peso: 0.3,
    profundidad: [25, 10],
    municipios: [{ nombre: 'Tierralta', lat: 8.172, lon: -76.059 }],
  },
];

/** Zonas con menos eventos que este umbral se agrupan en su región. */
export const MIN_EVENTOS_ZONA_MOCK = 50;

const INFO_REGIONES: Record<string, string> = {
  Andina: 'Región Andina',
  Pacífica: 'Región Pacífica',
  Orinoquía: 'Región Orinoquía',
  Caribe: 'Región Caribe',
};

export function regionDeZona(zona: string): string {
  const def = ZONAS.find((z) => z.zona === zona);
  return def ? (INFO_REGIONES[def.region] ?? def.region) : 'Región Andina';
}

function normal(aleatorio: () => number, media: number, desviacion: number): number {
  // Box-Muller
  const u = Math.max(aleatorio(), Number.EPSILON);
  const v = aleatorio();
  return media + desviacion * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function elegirPonderado<T extends { peso: number }>(aleatorio: () => number, items: T[]): T {
  const total = items.reduce((s, i) => s + i.peso, 0);
  let r = aleatorio() * total;
  for (const item of items) {
    r -= item.peso;
    if (r <= 0) return item;
  }
  return items[items.length - 1] as T;
}

const redondear = (v: number, decimales: number) => Number(v.toFixed(decimales));

function generarSismos(): Sismo[] {
  const aleatorio = crearAleatorio(SEMILLA);
  const B_VALUE = 1.0;
  const MAG_MINIMA = 1.0;
  const MAG_MAXIMA = 7.0;
  const lista: Sismo[] = [];

  for (let i = 0; i < TOTAL_SISMOS_SGC; i += 1) {
    const def = elegirPonderado(aleatorio, ZONAS);
    const municipio = def.municipios[Math.floor(aleatorio() * def.municipios.length)] as Municipio;
    // Gutenberg-Richter: M = Mmin − log10(U)/b
    const magnitud = Math.min(MAG_MAXIMA, MAG_MINIMA - Math.log10(Math.max(aleatorio(), 1e-9)) / B_VALUE);
    // Tasa levemente creciente en el tiempo
    const t = Math.sqrt(aleatorio());
    const fecha = new Date(INICIO_CATALOGO + t * (FIN_CATALOGO - INICIO_CATALOGO));
    const conEpicentro = magnitud >= 2.5 && aleatorio() < 0.45;
    const profundidad = Math.max(0, normal(aleatorio, def.profundidad[0], def.profundidad[1]));

    lista.push({
      idSismo: 0,
      fechaHora: fecha.toISOString(),
      latitud: conEpicentro ? redondear(municipio.lat + (aleatorio() - 0.5) * 0.4, 4) : municipio.lat,
      longitud: conEpicentro ? redondear(municipio.lon + (aleatorio() - 0.5) * 0.4, 4) : municipio.lon,
      precisionUbicacion: conEpicentro ? 'EPICENTRO' : 'CENTROIDE_MUNICIPIO',
      profundidadKm: redondear(profundidad, 1),
      magnitud: redondear(magnitud, 1),
      departamento: def.departamento,
      municipio: municipio.nombre,
      zona: def.zona,
      fuente: 'SGC',
      nivelImpacto: null,
      esReplica: aleatorio() < 0.08,
      esAnomalo: false,
      motivoAnomalia: null,
    });
  }

  // Eventos notables (aproximan sismos reales recientes)
  const notables: Array<Partial<Sismo> & Pick<Sismo, 'fechaHora' | 'magnitud' | 'profundidadKm' | 'municipio' | 'departamento' | 'zona' | 'latitud' | 'longitud'>> = [
    { fechaHora: '2023-08-17T17:04:00.000Z', magnitud: 6.1, profundidadKm: 13.2, municipio: 'Paratebueno', departamento: 'Cundinamarca', zona: 'Cundinamarca', latitud: 4.3742, longitud: -73.1916, nivelImpacto: 'MODERADO' },
    { fechaHora: '2023-03-10T21:28:00.000Z', magnitud: 5.6, profundidadKm: 146.0, municipio: 'Los Santos', departamento: 'Santander', zona: 'Nido de Bucaramanga', latitud: 6.8114, longitud: -73.1101 },
    { fechaHora: '2024-06-09T11:12:00.000Z', magnitud: 5.2, profundidadKm: 18.4, municipio: 'Bahía Solano', departamento: 'Chocó', zona: 'Chocó', latitud: 6.4012, longitud: -77.5523 },
    { fechaHora: '2025-06-08T13:08:00.000Z', magnitud: 6.3, profundidadKm: 10.0, municipio: 'Paratebueno', departamento: 'Cundinamarca', zona: 'Cundinamarca', latitud: 4.3511, longitud: -73.1602, nivelImpacto: 'MODERADO' },
    { fechaHora: '2026-02-14T04:41:00.000Z', magnitud: 4.8, profundidadKm: 151.3, municipio: 'Piedecuesta', departamento: 'Santander', zona: 'Nido de Bucaramanga', latitud: 6.9471, longitud: -73.0611 },
    { fechaHora: '2026-07-29T19:22:00.000Z', magnitud: 4.5, profundidadKm: 9.8, municipio: 'Mesetas', departamento: 'Meta', zona: 'Meta', latitud: 3.4012, longitud: -74.0221 },
  ];
  for (const n of notables) {
    lista.push({
      idSismo: 0,
      precisionUbicacion: 'EPICENTRO',
      fuente: 'SGC',
      nivelImpacto: null,
      esReplica: false,
      esAnomalo: false,
      motivoAnomalia: null,
      ...n,
    });
  }

  // Reportes de daño (UNGRD / DesInventar): ubicación en centroide municipal
  const reportes: Array<Pick<Sismo, 'fechaHora' | 'magnitud' | 'profundidadKm' | 'municipio' | 'departamento' | 'latitud' | 'longitud' | 'fuente' | 'nivelImpacto'>> = [
    { fechaHora: '1999-01-25T18:19:00.000Z', magnitud: 6.2, profundidadKm: 17, municipio: 'Armenia', departamento: 'Quindío', latitud: 4.534, longitud: -75.681, fuente: 'DESINVENTAR', nivelImpacto: 'ALTO' },
    { fechaHora: '2004-11-15T09:06:00.000Z', magnitud: 6.7, profundidadKm: 15, municipio: 'Bahía Solano', departamento: 'Chocó', latitud: 6.223, longitud: -77.403, fuente: 'DESINVENTAR', nivelImpacto: 'MODERADO' },
    { fechaHora: '2008-05-24T19:20:00.000Z', magnitud: 5.7, profundidadKm: 10, municipio: 'Quetame', departamento: 'Cundinamarca', latitud: 4.33, longitud: -73.863, fuente: 'DESINVENTAR', nivelImpacto: 'ALTO' },
    { fechaHora: '2015-03-10T20:55:00.000Z', magnitud: 6.4, profundidadKm: 155, municipio: 'Los Santos', departamento: 'Santander', latitud: 6.756, longitud: -73.102, fuente: 'DESINVENTAR', nivelImpacto: 'BAJO' },
    { fechaHora: '2019-12-24T19:03:00.000Z', magnitud: 6.0, profundidadKm: 13, municipio: 'Mesetas', departamento: 'Meta', latitud: 3.384, longitud: -74.044, fuente: 'UNGRD', nivelImpacto: 'MODERADO' },
    { fechaHora: '2021-04-02T08:15:00.000Z', magnitud: 4.9, profundidadKm: 22, municipio: 'Popayán', departamento: 'Cauca', latitud: 2.444, longitud: -76.614, fuente: 'UNGRD', nivelImpacto: 'BAJO' },
  ];
  for (const r of reportes) {
    lista.push({
      idSismo: 0,
      precisionUbicacion: 'CENTROIDE_MUNICIPIO',
      zona: r.departamento,
      esReplica: false,
      esAnomalo: false,
      motivoAnomalia: null,
      ...r,
    });
  }

  // Registros anómalos (se conservan marcados)
  const anomalos: Array<{ motivo: string; ajuste: Partial<Sismo> }> = [
    { motivo: 'profundidad negativa', ajuste: { profundidadKm: -2.3 } },
    { motivo: 'magnitud nula', ajuste: { magnitud: null } },
    { motivo: 'profundidad nula', ajuste: { profundidadKm: null } },
    { motivo: 'duplicado', ajuste: {} },
  ];
  const ANOMALOS_POR_MOTIVO = 12;
  anomalos.forEach(({ motivo, ajuste }, j) => {
    for (let k = 0; k < ANOMALOS_POR_MOTIVO; k += 1) {
      const base = lista[(j * 97 + k * 31) % TOTAL_SISMOS_SGC] as Sismo;
      lista.push({ ...base, ...ajuste, esAnomalo: true, motivoAnomalia: motivo });
    }
  });

  lista.sort((a, b) => Date.parse(a.fechaHora) - Date.parse(b.fechaHora));
  return lista.map((s, i) => ({ ...s, idSismo: i + 1 }));
}

export const SISMOS: Sismo[] = generarSismos();

export const DEPARTAMENTOS: string[] = [...new Set(SISMOS.map((s) => s.departamento).filter((d): d is string => d !== null))].sort(
  (a, b) => a.localeCompare(b, 'es'),
);

export function zonasDisponibles(minEventos: number) {
  const conteo = new Map<string, number>();
  for (const s of SISMOS) {
    if (s.zona && !s.esAnomalo && s.fuente === 'SGC') conteo.set(s.zona, (conteo.get(s.zona) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([zona, nEventos]) => ({
      zona,
      region: regionDeZona(zona),
      agrupadaEn: nEventos < minEventos ? regionDeZona(zona) : null,
      nEventos,
    }))
    .sort((a, b) => b.nEventos - a.nEventos);
}

/* ---------- Usuarios ---------- */

export const USUARIOS: Usuario[] = [
  { idUsuario: 1, nombre: 'Administrador SismoCol', correo: 'admin@sismocol.local', rol: 'ADMIN', activo: true, fechaCreacion: '2026-10-01T14:00:00.000Z' },
  { idUsuario: 2, nombre: 'Usuario de prueba', correo: 'usuario@sismocol.local', rol: 'USUARIO', activo: true, fechaCreacion: '2026-10-01T14:05:00.000Z' },
  { idUsuario: 3, nombre: 'Laura Gómez', correo: 'laura.gomez@ucc.edu.co', rol: 'USUARIO', activo: true, fechaCreacion: '2026-10-02T15:20:00.000Z' },
  { idUsuario: 4, nombre: 'Andrés Pérez', correo: 'andres.perez@ucc.edu.co', rol: 'USUARIO', activo: false, fechaCreacion: '2026-10-02T16:45:00.000Z' },
  { idUsuario: 5, nombre: 'Camila Rodríguez', correo: 'camila.rodriguez@ucc.edu.co', rol: 'ADMIN', activo: true, fechaCreacion: '2026-10-03T13:10:00.000Z' },
];

/* ---------- Modelos ---------- */

export const MODELOS: ModeloPredictivo[] = [
  { idModelo: 1, version: 'v1.0.0', algoritmo: 'Árbol de decisión', exactitud: 0.71, f1Macro: 0.52, activo: false, fechaEntrenamiento: '2026-10-03T16:00:00.000Z' },
  { idModelo: 2, version: 'v1.1.0', algoritmo: 'Random Forest', exactitud: 0.78, f1Macro: 0.61, activo: true, fechaEntrenamiento: '2026-10-04T18:30:00.000Z' },
];

export const CLASES_IMPACTO: NivelImpacto[] = ['SIN_AFECTACION', 'BAJO', 'MODERADO', 'ALTO'];

/* ---------- Dispositivo y simulaciones ---------- */

export const DISPOSITIVO: Dispositivo = {
  idDispositivo: 1,
  nombre: 'ESP32 Laboratorio',
  topicoMqtt: 'sismocol/esp32-lab/simulacion',
  estado: 'EN_LINEA',
  ultimaConexion: new Date().toISOString(),
};

export const SIMULACIONES: Simulacion[] = [
  { idSimulacion: 3, magnitudSimulada: 6.4, estadoEnvio: 'ENVIADA', fecha: '2026-10-05T15:12:00.000Z', dispositivo: { idDispositivo: 1, nombre: DISPOSITIVO.nombre } },
  { idSimulacion: 2, magnitudSimulada: 4.2, estadoEnvio: 'FALLIDA', fecha: '2026-10-05T14:50:00.000Z', dispositivo: { idDispositivo: 1, nombre: DISPOSITIVO.nombre } },
  { idSimulacion: 1, magnitudSimulada: 3.1, estadoEnvio: 'ENVIADA', fecha: '2026-10-04T20:03:00.000Z', dispositivo: { idDispositivo: 1, nombre: DISPOSITIVO.nombre } },
];

/* ---------- Cargas ---------- */

export const CARGAS: Carga[] = [
  { idCarga: 4, origen: 'API', fuente: 'USGS', nombreArchivo: 'usgs-fdsn-2026-10-05', registrosLeidos: 41, registrosValidos: 41, estado: 'PROCESADO', fechaCarga: '2026-10-05T07:00:00.000Z', usuario: null },
  { idCarga: 3, origen: 'API', fuente: 'UNGRD', nombreArchivo: 'datos.gov.co-2343-nuqp', registrosLeidos: 3, registrosValidos: 3, estado: 'PROCESADO', fechaCarga: '2026-10-05T07:00:00.000Z', usuario: null },
  { idCarga: 2, origen: 'ARCHIVO', fuente: 'DESINVENTAR', nombreArchivo: 'Sismos_Colombia_FINAL.xlsx', registrosLeidos: 1010, registrosValidos: 396, estado: 'PROCESADO', fechaCarga: '2026-10-04T15:30:00.000Z', usuario: { idUsuario: 1, nombre: 'Administrador SismoCol' } },
  { idCarga: 1, origen: 'ARCHIVO', fuente: 'SGC', nombreArchivo: 'Sismos_Colombia_FINAL.xlsx', registrosLeidos: 98884, registrosValidos: 98460, estado: 'PROCESADO', fechaCarga: '2026-10-04T15:30:00.000Z', usuario: { idUsuario: 1, nombre: 'Administrador SismoCol' } },
];

/* ---------- Configuración y advertencias ---------- */

export const CONFIGURACION: ConfiguracionAnalisis = {
  idConfig: 1,
  ventanaDias: 30,
  periodoBaseMeses: 36,
  umbralElevada: 0.05,
  umbralAlta: 0.01,
  minEventosZona: MIN_EVENTOS_ZONA_MOCK,
  fechaActualizacion: '2026-10-04T15:45:00.000Z',
};

const INICIO_VENTANA = '2026-07-11T05:00:00.000Z';
const FIN_VENTANA = '2026-08-10T05:00:00.000Z';
const EMISION = '2026-08-10T13:00:00.000Z';

export const ADVERTENCIAS: Advertencia[] = [
  { idAdvertencia: 1, zona: 'Meta', ventanaInicio: INICIO_VENTANA, ventanaFin: FIN_VENTANA, eventosObservados: 31, eventosEsperados: 14.2, pValor: 0.0002, nivel: 'ALTA', fechaEmision: EMISION },
  { idAdvertencia: 2, zona: 'Chocó', ventanaInicio: INICIO_VENTANA, ventanaFin: FIN_VENTANA, eventosObservados: 19, eventosEsperados: 12.1, pValor: 0.034, nivel: 'ELEVADA', fechaEmision: EMISION },
  { idAdvertencia: 3, zona: 'Nido de Bucaramanga', ventanaInicio: INICIO_VENTANA, ventanaFin: FIN_VENTANA, eventosObservados: 88, eventosEsperados: 91.4, pValor: 0.64, nivel: 'NORMAL', fechaEmision: EMISION },
  { idAdvertencia: 4, zona: 'Huila', ventanaInicio: INICIO_VENTANA, ventanaFin: FIN_VENTANA, eventosObservados: 9, eventosEsperados: 9.6, pValor: 0.52, nivel: 'NORMAL', fechaEmision: EMISION },
  { idAdvertencia: 5, zona: 'Antioquia', ventanaInicio: INICIO_VENTANA, ventanaFin: FIN_VENTANA, eventosObservados: 11, eventosEsperados: 9.1, pValor: 0.31, nivel: 'NORMAL', fechaEmision: EMISION },
];
