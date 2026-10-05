/**
 * Handlers de MSW que respetan docs/api-contrato.md.
 * Mantienen estado en memoria mientras la pestaña esté abierta.
 */
import { delay, http, HttpResponse, type DefaultBodyType, type StrictRequest } from 'msw';
import type {
  Carga,
  CuerpoConfiguracion,
  CuerpoCrearUsuario,
  CuerpoEditarUsuario,
  CuerpoLogin,
  CuerpoPrediccion,
  DetalleError,
  Fuente,
  ModeloPredictivo,
  NivelImpacto,
  OrdenSismos,
  ResumenAdmin,
  Rol,
  Simulacion,
  Usuario,
} from '@/api/tipos';
import { FUENTES } from '@/api/tipos';
import { URL_API } from '@/config';
import { probabilidadPoisson } from '@/lib/analisis';
import { calcularEstadisticas, calcularFrecuencia, calcularGR, filtrarSismos } from './calculos';
import {
  ADVERTENCIAS,
  CARGAS,
  CLASES_IMPACTO,
  CONFIGURACION,
  DEPARTAMENTOS,
  DISPOSITIVO,
  FECHA_CORTE,
  MODELOS,
  SIMULACIONES,
  SISMOS,
  USUARIOS,
  zonasDisponibles,
} from './datos';

const ruta = (r: string) => `${URL_API}${r}`;

const LONGITUD_MINIMA_CONTRASENA = 10;
const DURACION_TOKEN_MS = 8 * 3600 * 1000;
const MAX_INTENTOS_FALLIDOS = 5;
const TAMANO_POR_DEFECTO = 25;
const TAMANO_MAXIMO = 100;
const MAX_FILAS_CSV = 100_000;
const TAMANO_MAXIMO_ARCHIVO = 25 * 1024 * 1024;
const LATENCIA_MS = 250;
const LATENCIA_ENTRENAMIENTO_MS = 4000;
const LATENCIA_ESP32_MS = 1500;
const PREFIJO_TOKEN = 'mock';

/* ---------- Estado en memoria ---------- */
const usuarios: Usuario[] = USUARIOS.map((u) => ({ ...u }));
const contrasenas = new Map<number, string>();
let modelos: ModeloPredictivo[] = MODELOS.map((m) => ({ ...m }));
const simulaciones: Simulacion[] = SIMULACIONES.map((s) => ({ ...s }));
const cargas: Carga[] = CARGAS.map((c) => ({ ...c }));
let configuracion = { ...CONFIGURACION };
let intentosFallidos = 0;
let siguienteIdPrediccion = 1;
const actividad: ResumenAdmin['actividadReciente'] = [
  { tipo: 'CARGA', descripcion: 'Sincronización automática USGS (41 registros)', fecha: '2026-10-05T07:00:00.000Z', usuario: null },
  { tipo: 'SIMULACION', descripcion: 'Simulación M 6,4 enviada al ESP32', fecha: '2026-10-05T15:12:00.000Z', usuario: 'Usuario de prueba' },
  { tipo: 'ENTRENAMIENTO', descripcion: 'Modelo v1.1.0 (Random Forest) entrenado', fecha: '2026-10-04T18:30:00.000Z', usuario: 'Administrador SismoCol' },
  { tipo: 'PREDICCION', descripcion: 'Predicción M 5,8 a 30 km: MODERADO', fecha: '2026-10-04T17:02:00.000Z', usuario: 'Laura Gómez' },
];

/* ---------- Utilidades ---------- */

function error(estado: number, mensaje: string, detalles: DetalleError[] = []) {
  return HttpResponse.json({ error: mensaje, detalles }, { status: estado });
}

function usuarioDelToken(request: StrictRequest<DefaultBodyType>): Usuario | null {
  const cabecera = request.headers.get('Authorization') ?? '';
  const [, token] = cabecera.split(' ');
  if (!token) return null;
  const [prefijo, id, expira] = token.split('.');
  if (prefijo !== PREFIJO_TOKEN || Number(expira) < Date.now()) return null;
  const usuario = usuarios.find((u) => u.idUsuario === Number(id));
  return usuario?.activo ? usuario : null;
}

/** Devuelve el usuario o la respuesta de error 401/403. */
function autorizar(request: StrictRequest<DefaultBodyType>, rol?: Rol): Usuario | Response {
  const usuario = usuarioDelToken(request);
  if (!usuario) return error(401, 'Sesión inválida o vencida.');
  if (rol && usuario.rol !== rol) return error(403, 'No tienes permiso para realizar esta acción.');
  return usuario;
}

function paginacion(url: URL) {
  const pagina = Math.max(1, Number(url.searchParams.get('pagina') ?? 1) || 1);
  const tamano = Math.min(TAMANO_MAXIMO, Math.max(1, Number(url.searchParams.get('tamano') ?? TAMANO_POR_DEFECTO) || TAMANO_POR_DEFECTO));
  return { pagina, tamano };
}

function paginar<T>(lista: T[], url: URL) {
  const { pagina, tamano } = paginacion(url);
  return { datos: lista.slice((pagina - 1) * tamano, pagina * tamano), total: lista.length, pagina, tamano };
}

function rangoNumero(detalles: DetalleError[], campo: string, valor: unknown, min: number, max: number, mensaje: string) {
  if (typeof valor !== 'number' || Number.isNaN(valor) || valor < min || valor > max) detalles.push({ campo, mensaje });
}

function registrar(tipo: ResumenAdmin['actividadReciente'][number]['tipo'], descripcion: string, usuario: Usuario | null) {
  actividad.unshift({ tipo, descripcion, fecha: new Date().toISOString(), usuario: usuario?.nombre ?? null });
}

const formatoDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const BOM_UTF8 = String.fromCharCode(0xfeff);

function csvEscapar(valor: string | number | boolean | null): string {
  if (valor === null) return '';
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/* ---------- Handlers ---------- */

export const handlers = [
  /* Autenticación */
  http.post(ruta('/api/auth/login'), async ({ request }) => {
    await delay(LATENCIA_MS);
    if (intentosFallidos >= MAX_INTENTOS_FALLIDOS) {
      intentosFallidos = 0;
      return error(429, 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
    }
    const cuerpo = (await request.json()) as Partial<CuerpoLogin>;
    const usuario = usuarios.find((u) => u.correo === cuerpo.correo?.trim().toLowerCase());
    const contrasena = cuerpo.contrasena ?? '';
    const valida = usuario
      ? (contrasenas.get(usuario.idUsuario) ?? null) === null
        ? contrasena.length >= LONGITUD_MINIMA_CONTRASENA
        : contrasenas.get(usuario.idUsuario) === contrasena
      : false;
    if (!usuario || !valida || !usuario.activo) {
      intentosFallidos += 1;
      return error(401, 'Correo o contraseña incorrectos.');
    }
    intentosFallidos = 0;
    const expira = Date.now() + DURACION_TOKEN_MS;
    return HttpResponse.json({
      token: `${PREFIJO_TOKEN}.${usuario.idUsuario}.${expira}`,
      expiraEn: new Date(expira).toISOString(),
      usuario,
    });
  }),

  http.get(ruta('/api/auth/yo'), ({ request }) => {
    const u = autorizar(request);
    return u instanceof Response ? u : HttpResponse.json(u);
  }),

  /* Sismos */
  http.get(ruta('/api/sismos/exportar'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const lista = filtrarSismos(new URL(request.url).searchParams).slice(0, MAX_FILAS_CSV);
    const columnas = [
      'idSismo', 'fechaHora', 'latitud', 'longitud', 'precisionUbicacion', 'profundidadKm', 'magnitud',
      'departamento', 'municipio', 'zona', 'fuente', 'nivelImpacto', 'esReplica', 'esAnomalo', 'motivoAnomalia',
    ] as const;
    const filas = lista.map((s) => columnas.map((c) => csvEscapar(s[c])).join(','));
    const csv = `${BOM_UTF8}${columnas.join(',')}\n${filas.join('\n')}\n`;
    return new HttpResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sismos.csv"',
      },
    });
  }),

  http.get(ruta('/api/sismos'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const url = new URL(request.url);
    const orden = (url.searchParams.get('orden') ?? 'fecha_desc') as OrdenSismos;
    const lista = filtrarSismos(url.searchParams);
    const comparadores: Record<OrdenSismos, (a: (typeof SISMOS)[number], b: (typeof SISMOS)[number]) => number> = {
      fecha_desc: (a, b) => b.fechaHora.localeCompare(a.fechaHora),
      fecha_asc: (a, b) => a.fechaHora.localeCompare(b.fechaHora),
      magnitud_desc: (a, b) => (b.magnitud ?? -1) - (a.magnitud ?? -1),
      magnitud_asc: (a, b) => (a.magnitud ?? 99) - (b.magnitud ?? 99),
    };
    const comparador = comparadores[orden];
    if (!comparador) return error(400, 'Parámetros inválidos.', [{ campo: 'orden', mensaje: 'Orden no admitido' }]);
    return HttpResponse.json(paginar([...lista].sort(comparador), url));
  }),

  http.get(ruta('/api/departamentos'), ({ request }) => {
    const u = autorizar(request);
    return u instanceof Response ? u : HttpResponse.json(DEPARTAMENTOS);
  }),

  http.get(ruta('/api/estadisticas'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    return HttpResponse.json(calcularEstadisticas(filtrarSismos(new URL(request.url).searchParams)));
  }),

  /* Análisis */
  http.get(ruta('/api/analisis/zonas'), ({ request }) => {
    const u = autorizar(request);
    return u instanceof Response ? u : HttpResponse.json(zonasDisponibles(configuracion.minEventosZona));
  }),

  http.get(ruta('/api/analisis/frecuencia'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const zona = new URL(request.url).searchParams.get('zona');
    const info = zonasDisponibles(configuracion.minEventosZona).find((z) => z.zona === zona);
    if (!info) return error(404, 'La zona no existe.');
    return HttpResponse.json(calcularFrecuencia(info.zona, info.agrupadaEn));
  }),

  http.get(ruta('/api/analisis/gutenberg-richter'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const zona = new URL(request.url).searchParams.get('zona');
    const info = zonasDisponibles(configuracion.minEventosZona).find((z) => z.zona === zona);
    if (!info) return error(404, 'La zona no existe.');
    return HttpResponse.json(calcularGR(info.zona, info.agrupadaEn));
  }),

  http.get(ruta('/api/analisis/probabilidades'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const MAGNITUDES = [4, 5, 6] as const;
    const zonas = zonasDisponibles(configuracion.minEventosZona).map((z) => {
      const gr = calcularGR(z.zona, z.agrupadaEn);
      return {
        zona: z.zona,
        agrupadaEn: z.agrupadaEn,
        probabilidades: MAGNITUDES.map((magnitud) => ({
          magnitud,
          anios1: probabilidadPoisson(gr.a, gr.b, magnitud, 1),
          anios10: probabilidadPoisson(gr.a, gr.b, magnitud, 10),
        })),
      };
    });
    return HttpResponse.json({ fechaCorte: FECHA_CORTE, fechaCalculo: configuracion.fechaActualizacion, zonas });
  }),

  http.get(ruta('/api/advertencias'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const params = new URL(request.url).searchParams;
    const zona = params.get('zona');
    const nivel = params.get('nivel');
    const datos = ADVERTENCIAS.filter((a) => (!zona || a.zona === zona) && (!nivel || a.nivel === nivel));
    return HttpResponse.json({ fechaCorte: FECHA_CORTE, datos });
  }),

  http.get(ruta('/api/analisis/configuracion'), ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    return u instanceof Response ? u : HttpResponse.json(configuracion);
  }),

  http.put(ruta('/api/analisis/configuracion'), async ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const c = (await request.json()) as Partial<CuerpoConfiguracion>;
    const detalles: DetalleError[] = [];
    rangoNumero(detalles, 'ventanaDias', c.ventanaDias, 1, 90, 'Debe estar entre 1 y 90');
    rangoNumero(detalles, 'periodoBaseMeses', c.periodoBaseMeses, 1, 120, 'Debe estar entre 1 y 120');
    rangoNumero(detalles, 'umbralElevada', c.umbralElevada, 0, 1, 'Debe estar entre 0 y 1');
    rangoNumero(detalles, 'umbralAlta', c.umbralAlta, 0, 1, 'Debe estar entre 0 y 1');
    rangoNumero(detalles, 'minEventosZona', c.minEventosZona, 10, 1000, 'Debe estar entre 10 y 1000');
    if (typeof c.umbralAlta === 'number' && typeof c.umbralElevada === 'number' && c.umbralAlta >= c.umbralElevada) {
      detalles.push({ campo: 'umbralAlta', mensaje: 'Debe ser menor que el umbral de actividad elevada' });
    }
    if (detalles.length) return error(400, 'La configuración no es válida.', detalles);
    configuracion = { ...configuracion, ...(c as CuerpoConfiguracion), fechaActualizacion: new Date().toISOString() };
    return HttpResponse.json(configuracion);
  }),

  http.post(ruta('/api/analisis/recalcular'), async ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    return HttpResponse.json({ mensaje: 'El recálculo se inició. Los resultados se actualizarán en unos minutos.' }, { status: 202 });
  }),

  /* Modelo de impacto */
  http.post(ruta('/api/predicciones'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS * 2);
    const c = (await request.json()) as Partial<CuerpoPrediccion>;
    const detalles: DetalleError[] = [];
    rangoNumero(detalles, 'magnitud', c.magnitud, 2, 9, 'Debe estar entre 2 y 9');
    rangoNumero(detalles, 'profundidadKm', c.profundidadKm, 0, 700, 'Debe estar entre 0 y 700 km');
    rangoNumero(detalles, 'latitud', c.latitud, -4.3, 13.5, 'Debe estar entre −4,3 y 13,5');
    rangoNumero(detalles, 'longitud', c.longitud, -82, -66.8, 'Debe estar entre −82 y −66,8');
    if (detalles.length) return error(400, 'Los datos de la predicción no son válidos.', detalles);
    const activo = modelos.find((m) => m.activo);
    if (!activo) return error(503, 'No hay un modelo de impacto activo.');

    // Heurística verosímil: el impacto crece con la magnitud y decrece con la profundidad
    const intensidad = (c.magnitud as number) - 1.2 * Math.log10(1 + (c.profundidadKm as number) / 10);
    const centros: Record<NivelImpacto, number> = { SIN_AFECTACION: 3.2, BAJO: 4.4, MODERADO: 5.4, ALTO: 6.3 };
    const pesos = CLASES_IMPACTO.map((n) => Math.exp(-((intensidad - centros[n]) ** 2) / 0.9));
    const suma = pesos.reduce((a, b) => a + b, 0) || 1;
    const probabilidades = Object.fromEntries(CLASES_IMPACTO.map((n, i) => [n, Number(((pesos[i] as number) / suma).toFixed(4))])) as Record<NivelImpacto, number>;
    const nivelImpacto = CLASES_IMPACTO.reduce((mejor, n) => (probabilidades[n] > probabilidades[mejor] ? n : mejor), CLASES_IMPACTO[0] as NivelImpacto);
    registrar('PREDICCION', `Predicción M ${formatoDecimal.format(c.magnitud as number)}: ${nivelImpacto}`, u);
    return HttpResponse.json({
      idPrediccion: siguienteIdPrediccion++,
      nivelImpacto,
      probabilidad: probabilidades[nivelImpacto],
      probabilidades,
      modelo: { idModelo: activo.idModelo, version: activo.version, algoritmo: activo.algoritmo },
    });
  }),

  http.get(ruta('/api/modelos'), ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    return u instanceof Response ? u : HttpResponse.json([...modelos].sort((a, b) => b.idModelo - a.idModelo));
  }),

  http.post(ruta('/api/modelos/entrenar'), async ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_ENTRENAMIENTO_MS);
    const id = Math.max(...modelos.map((m) => m.idModelo), 0) + 1;
    const modelo: ModeloPredictivo = {
      idModelo: id,
      version: `v1.${id}.0`,
      algoritmo: 'Random Forest',
      exactitud: 0.79,
      f1Macro: 0.63,
      activo: false,
      fechaEntrenamiento: new Date().toISOString(),
    };
    modelos = [...modelos, modelo];
    registrar('ENTRENAMIENTO', `Modelo ${modelo.version} (${modelo.algoritmo}) entrenado`, u);
    return HttpResponse.json(
      {
        modelo,
        reporte: {
          clases: CLASES_IMPACTO,
          matrizConfusion: [
            [58, 9, 2, 0],
            [11, 21, 6, 1],
            [3, 7, 14, 3],
            [0, 1, 3, 6],
          ],
          porClase: {
            SIN_AFECTACION: { precision: 0.81, recall: 0.84, f1: 0.82, soporte: 69 },
            BAJO: { precision: 0.55, recall: 0.54, f1: 0.54, soporte: 39 },
            MODERADO: { precision: 0.56, recall: 0.52, f1: 0.54, soporte: 27 },
            ALTO: { precision: 0.6, recall: 0.6, f1: 0.6, soporte: 10 },
          },
          comparacion: [
            { algoritmo: 'Árbol de decisión', f1Macro: 0.52 },
            { algoritmo: 'Random Forest', f1Macro: 0.63 },
            { algoritmo: 'Regresión logística multinomial', f1Macro: 0.57 },
            { algoritmo: 'Baseline (clase mayoritaria)', f1Macro: 0.18 },
          ],
        },
      },
      { status: 201 },
    );
  }),

  http.patch(ruta('/api/modelos/:id/activar'), async ({ request, params }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const id = Number(params.id);
    if (!modelos.some((m) => m.idModelo === id)) return error(404, 'El modelo no existe.');
    modelos = modelos.map((m) => ({ ...m, activo: m.idModelo === id }));
    return HttpResponse.json(modelos.find((m) => m.idModelo === id));
  }),

  /* Simulación */
  http.post(ruta('/api/simulaciones'), async ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    const c = (await request.json()) as { magnitud?: unknown };
    const detalles: DetalleError[] = [];
    rangoNumero(detalles, 'magnitud', c.magnitud, 2, 8, 'Debe estar entre 2 y 8');
    if (detalles.length) return error(400, 'La magnitud no es válida.', detalles);
    await delay(LATENCIA_ESP32_MS);
    const enLinea = DISPOSITIVO.estado === 'EN_LINEA';
    const simulacion: Simulacion = {
      idSimulacion: Math.max(...simulaciones.map((s) => s.idSimulacion), 0) + 1,
      magnitudSimulada: Number((c.magnitud as number).toFixed(1)),
      estadoEnvio: enLinea ? 'ENVIADA' : 'FALLIDA',
      fecha: new Date().toISOString(),
      dispositivo: { idDispositivo: DISPOSITIVO.idDispositivo, nombre: DISPOSITIVO.nombre },
    };
    simulaciones.unshift(simulacion);
    if (enLinea) DISPOSITIVO.ultimaConexion = simulacion.fecha;
    registrar('SIMULACION', `Simulación M ${formatoDecimal.format(simulacion.magnitudSimulada)} ${enLinea ? 'enviada' : 'fallida'}`, u);
    return HttpResponse.json(simulacion, { status: 201 });
  }),

  http.get(ruta('/api/simulaciones'), ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    const limite = Number(new URL(request.url).searchParams.get('limite') ?? 10) || 10;
    return HttpResponse.json(simulaciones.slice(0, limite));
  }),

  http.get(ruta('/api/dispositivos/estado'), ({ request }) => {
    const u = autorizar(request);
    if (u instanceof Response) return u;
    // El ESP32 envía latidos: la última conexión se mantiene reciente mientras está en línea
    if (DISPOSITIVO.estado === 'EN_LINEA') DISPOSITIVO.ultimaConexion = new Date().toISOString();
    return HttpResponse.json([{ ...DISPOSITIVO }]);
  }),

  /* Administración */
  http.post(ruta('/api/cargas'), async ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS * 4);
    const datos = await request.formData();
    const archivo = datos.get('archivo');
    const fuenteForm = datos.get('fuente');
    if (!(archivo instanceof File)) return error(400, 'Falta el archivo.', [{ campo: 'archivo', mensaje: 'Selecciona un archivo' }]);
    if (!/\.(csv|xlsx)$/i.test(archivo.name)) {
      return error(422, 'El archivo fue rechazado.', [{ campo: 'archivo', mensaje: 'Solo se admiten archivos CSV o XLSX' }]);
    }
    if (archivo.size > TAMANO_MAXIMO_ARCHIVO) {
      return error(422, 'El archivo fue rechazado.', [{ campo: 'archivo', mensaje: 'El archivo supera 25 MB' }]);
    }
    if (archivo.size === 0) {
      return error(422, 'El archivo fue rechazado.', [{ campo: 'archivo', mensaje: 'El archivo está vacío' }]);
    }
    const fuentes: Fuente[] =
      typeof fuenteForm === 'string' && (FUENTES as readonly string[]).includes(fuenteForm)
        ? [fuenteForm as Fuente]
        : ['SGC', 'DESINVENTAR', 'UNGRD'];
    const reportesBase = {
      SGC: { leidos: 98884, validos: 98460, nuevos: 1240, existentes: 97220, porMotivo: { 'profundidad negativa': 366, duplicado: 53, 'fuera de Colombia': 5 }, conEpicentro: 3110, conCentroide: 95350, conAfectacion: 0 },
      DESINVENTAR: { leidos: 1010, validos: 396, nuevos: 0, existentes: 396, porMotivo: { 'profundidad nula': 584, 'magnitud nula': 486 }, conEpicentro: 0, conCentroide: 396, conAfectacion: 396 },
      UNGRD: { leidos: 38, validos: 38, nuevos: 2, existentes: 36, porMotivo: {}, conEpicentro: 0, conCentroide: 38, conAfectacion: 38 },
      USGS: { leidos: 41, validos: 41, nuevos: 41, existentes: 0, porMotivo: {}, conEpicentro: 41, conCentroide: 0, conAfectacion: 0 },
    } satisfies Record<Fuente, unknown>;
    const porFuente = fuentes.map((f) => ({ fuente: f, ...reportesBase[f] }));
    const ahora = new Date().toISOString();
    const nuevas: Carga[] = porFuente.map((r, i) => ({
      idCarga: Math.max(...cargas.map((c) => c.idCarga), 0) + 1 + i,
      origen: 'ARCHIVO',
      fuente: r.fuente,
      nombreArchivo: archivo.name,
      registrosLeidos: r.leidos,
      registrosValidos: r.validos,
      estado: 'PROCESADO',
      fechaCarga: ahora,
      usuario: { idUsuario: u.idUsuario, nombre: u.nombre },
    }));
    cargas.unshift(...nuevas);
    registrar('CARGA', `Archivo ${archivo.name} cargado`, u);
    const leidos = porFuente.reduce((a, r) => a + r.leidos, 0);
    const validos = porFuente.reduce((a, r) => a + r.validos, 0);
    return HttpResponse.json(
      {
        cargas: nuevas,
        reporte: {
          leidos,
          validos,
          rechazadosSinFecha: 0,
          mapeo: {
            id_evento: 'ID_Evento',
            fecha: 'Fecha',
            profundidad_km: 'Profundidad_km',
            magnitud: 'Magnitud',
            departamento: 'Departamento',
            municipio: 'Municipio',
            fuente: 'Fuente_Dataset',
            fallecidos: 'Muertos',
            heridos: 'Heridos',
            viviendas_destruidas: 'Viviendas_Destruidas',
          },
          columnasIgnoradas: ['Observaciones', 'Unnamed: 14'],
          porFuente,
          avisos: ['No se pudo consultar USGS para epicentros (ConnectionError); se usaron centroides municipales.'],
        },
      },
      { status: 201 },
    );
  }),

  http.get(ruta('/api/cargas'), ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    return u instanceof Response ? u : HttpResponse.json(paginar(cargas, new URL(request.url)));
  }),

  http.post(ruta('/api/sincronizaciones'), async ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS * 6);
    const id = Math.max(...cargas.map((c) => c.idCarga), 0) + 1;
    const nueva: Carga = {
      idCarga: id,
      origen: 'API',
      fuente: 'UNGRD',
      nombreArchivo: 'datos.gov.co-2343-nuqp',
      registrosLeidos: 2,
      registrosValidos: 2,
      estado: 'PROCESADO',
      fechaCarga: new Date().toISOString(),
      usuario: { idUsuario: u.idUsuario, nombre: u.nombre },
    };
    cargas.unshift(nueva);
    registrar('CARGA', 'Sincronización manual UNGRD (2 registros)', u);
    // Sincronización parcial: USGS no respondió
    return HttpResponse.json({ cargas: [nueva], errores: ['USGS: ConnectionError'] }, { status: 201 });
  }),

  http.get(ruta('/api/usuarios'), ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    return u instanceof Response ? u : HttpResponse.json(paginar(usuarios, new URL(request.url)));
  }),

  http.post(ruta('/api/usuarios'), async ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const c = (await request.json()) as Partial<CuerpoCrearUsuario>;
    const detalles: DetalleError[] = [];
    if (!c.nombre?.trim()) detalles.push({ campo: 'nombre', mensaje: 'El nombre es obligatorio' });
    if (!c.correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.correo)) detalles.push({ campo: 'correo', mensaje: 'Correo inválido' });
    if (!c.contrasena || c.contrasena.length < LONGITUD_MINIMA_CONTRASENA || !/[a-zA-Z]/.test(c.contrasena) || !/\d/.test(c.contrasena)) {
      detalles.push({ campo: 'contrasena', mensaje: 'Mínimo 10 caracteres con letras y números' });
    }
    if (c.rol !== 'ADMIN' && c.rol !== 'USUARIO') detalles.push({ campo: 'rol', mensaje: 'Rol inválido' });
    if (detalles.length) return error(400, 'Los datos del usuario no son válidos.', detalles);
    const correo = (c.correo as string).toLowerCase();
    if (usuarios.some((x) => x.correo === correo)) {
      return error(409, 'Ya existe un usuario con ese correo.', [{ campo: 'correo', mensaje: 'El correo ya está registrado' }]);
    }
    const nuevo: Usuario = {
      idUsuario: Math.max(...usuarios.map((x) => x.idUsuario)) + 1,
      nombre: (c.nombre as string).trim(),
      correo,
      rol: c.rol as Rol,
      activo: true,
      fechaCreacion: new Date().toISOString(),
    };
    usuarios.push(nuevo);
    contrasenas.set(nuevo.idUsuario, c.contrasena as string);
    return HttpResponse.json(nuevo, { status: 201 });
  }),

  http.patch(ruta('/api/usuarios/:id'), async ({ request, params }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    await delay(LATENCIA_MS);
    const id = Number(params.id);
    const usuario = usuarios.find((x) => x.idUsuario === id);
    if (!usuario) return error(404, 'El usuario no existe.');
    const c = (await request.json()) as CuerpoEditarUsuario;
    if (id === u.idUsuario && (c.activo === false || (c.rol && c.rol !== 'ADMIN'))) {
      return error(409, 'No puedes desactivarte ni quitarte el rol de administrador.');
    }
    if (c.contrasena !== undefined) {
      if (c.contrasena.length < LONGITUD_MINIMA_CONTRASENA || !/[a-zA-Z]/.test(c.contrasena) || !/\d/.test(c.contrasena)) {
        return error(400, 'La contraseña no es válida.', [{ campo: 'contrasena', mensaje: 'Mínimo 10 caracteres con letras y números' }]);
      }
      contrasenas.set(id, c.contrasena);
    }
    if (c.nombre !== undefined) usuario.nombre = c.nombre.trim();
    if (c.rol !== undefined) usuario.rol = c.rol;
    if (c.activo !== undefined) usuario.activo = c.activo;
    return HttpResponse.json(usuario);
  }),

  http.get(ruta('/api/admin/resumen'), ({ request }) => {
    const u = autorizar(request, 'ADMIN');
    if (u instanceof Response) return u;
    const activo = modelos.find((m) => m.activo) ?? null;
    const resumen: ResumenAdmin = {
      registros: SISMOS.length,
      registrosValidos: SISMOS.filter((s) => !s.esAnomalo).length,
      usuarios: usuarios.length,
      usuariosActivos: usuarios.filter((x) => x.activo).length,
      modeloActivo: activo
        ? { idModelo: activo.idModelo, version: activo.version, algoritmo: activo.algoritmo, f1Macro: activo.f1Macro }
        : null,
      dispositivo: { estado: DISPOSITIVO.estado, ultimaConexion: DISPOSITIVO.ultimaConexion },
      ultimaCarga: cargas[0] ?? null,
      actividadReciente: actividad.slice(0, 8),
    };
    return HttpResponse.json(resumen);
  }),
];
