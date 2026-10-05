import { z } from 'zod';
import { FUENTES, ROLES } from '@/api/tipos';

/** Esquemas Zod de los formularios. Los rangos salen de docs/api-contrato.md. */

export const LONGITUD_MINIMA_CONTRASENA = 10;

export const LIMITES = {
  magnitudPrediccion: { min: 2, max: 9 },
  profundidad: { min: 0, max: 700 },
  latitud: { min: -4.3, max: 13.5 },
  longitud: { min: -82, max: -66.8 },
  magnitudSimulacion: { min: 2, max: 8, paso: 0.1 },
  magnitudFiltro: { min: 0, max: 10 },
  ventanaDias: { min: 1, max: 90 },
  periodoBaseMeses: { min: 1, max: 120 },
  umbral: { min: 0, max: 1 },
  minEventosZona: { min: 10, max: 1000 },
} as const;

const fmt = (n: number) => String(n).replace('.', ',').replace('-', '−');

function numeroEnRango(min: number, max: number, unidad = '') {
  const sufijo = unidad ? ` ${unidad}` : '';
  return z
    .number({ error: 'Escribe un número' })
    .min(min, `Debe estar entre ${fmt(min)} y ${fmt(max)}${sufijo}`)
    .max(max, `Debe estar entre ${fmt(min)} y ${fmt(max)}${sufijo}`);
}

const entero = (min: number, max: number, unidad = '') =>
  numeroEnRango(min, max, unidad).int('Debe ser un número entero');

const contrasenaSegura = z
  .string()
  .min(LONGITUD_MINIMA_CONTRASENA, `Mínimo ${LONGITUD_MINIMA_CONTRASENA} caracteres`)
  .regex(/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/, 'Debe incluir letras')
  .regex(/\d/, 'Debe incluir números');

/* ---------- Login ---------- */
export const esquemaLogin = z.object({
  correo: z.string().trim().min(1, 'Escribe tu correo').email('Escribe un correo válido'),
  contrasena: z.string().min(LONGITUD_MINIMA_CONTRASENA, `La contraseña tiene al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`),
});
export type DatosLogin = z.infer<typeof esquemaLogin>;

/* ---------- Filtros de sismos ---------- */
export const esquemaFiltros = z
  .object({
    desde: z.string().optional(),
    hasta: z.string().optional(),
    departamento: z.string().optional(),
    fuente: z.enum(FUENTES as [string, ...string[]]).optional(),
    magMin: numeroEnRango(LIMITES.magnitudFiltro.min, LIMITES.magnitudFiltro.max).optional(),
    magMax: numeroEnRango(LIMITES.magnitudFiltro.min, LIMITES.magnitudFiltro.max).optional(),
    profMin: numeroEnRango(LIMITES.profundidad.min, LIMITES.profundidad.max, 'km').optional(),
    profMax: numeroEnRango(LIMITES.profundidad.min, LIMITES.profundidad.max, 'km').optional(),
    incluirAnomalos: z.boolean(),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    path: ['hasta'],
    message: 'Debe ser posterior a la fecha inicial',
  })
  .refine((f) => f.magMin === undefined || f.magMax === undefined || f.magMin <= f.magMax, {
    path: ['magMax'],
    message: 'Debe ser mayor o igual a la mínima',
  })
  .refine((f) => f.profMin === undefined || f.profMax === undefined || f.profMin <= f.profMax, {
    path: ['profMax'],
    message: 'Debe ser mayor o igual a la mínima',
  });
export type DatosFiltros = z.infer<typeof esquemaFiltros>;

/* ---------- Predicción ---------- */
export const esquemaPrediccion = z.object({
  magnitud: numeroEnRango(LIMITES.magnitudPrediccion.min, LIMITES.magnitudPrediccion.max),
  profundidadKm: numeroEnRango(LIMITES.profundidad.min, LIMITES.profundidad.max, 'km'),
  latitud: numeroEnRango(LIMITES.latitud.min, LIMITES.latitud.max),
  longitud: numeroEnRango(LIMITES.longitud.min, LIMITES.longitud.max),
});
export type DatosPrediccion = z.infer<typeof esquemaPrediccion>;

/* ---------- Configuración del análisis ---------- */
export const esquemaConfiguracion = z
  .object({
    ventanaDias: entero(LIMITES.ventanaDias.min, LIMITES.ventanaDias.max, 'días'),
    periodoBaseMeses: entero(LIMITES.periodoBaseMeses.min, LIMITES.periodoBaseMeses.max, 'meses'),
    umbralElevada: numeroEnRango(LIMITES.umbral.min, LIMITES.umbral.max),
    umbralAlta: numeroEnRango(LIMITES.umbral.min, LIMITES.umbral.max),
    minEventosZona: entero(LIMITES.minEventosZona.min, LIMITES.minEventosZona.max, 'eventos'),
  })
  .refine((c) => c.umbralAlta < c.umbralElevada, {
    path: ['umbralAlta'],
    message: 'Debe ser menor que el umbral de actividad elevada',
  });
export type DatosConfiguracion = z.infer<typeof esquemaConfiguracion>;

/* ---------- Usuarios ---------- */
const rol = z.enum(ROLES as ['ADMIN', 'USUARIO'], { error: 'Elige un rol' });
const nombre = z.string().trim().min(1, 'Escribe el nombre').max(100, 'Máximo 100 caracteres');

export const esquemaCrearUsuario = z.object({
  nombre,
  correo: z.string().trim().min(1, 'Escribe el correo').email('Escribe un correo válido'),
  contrasena: contrasenaSegura,
  rol,
});
export type DatosCrearUsuario = z.infer<typeof esquemaCrearUsuario>;

export const esquemaEditarUsuario = z.object({ nombre, rol });
export type DatosEditarUsuario = z.infer<typeof esquemaEditarUsuario>;

export const esquemaCambiarContrasena = z
  .object({ contrasena: contrasenaSegura, confirmacion: z.string() })
  .refine((d) => d.contrasena === d.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' });
export type DatosCambiarContrasena = z.infer<typeof esquemaCambiarContrasena>;
