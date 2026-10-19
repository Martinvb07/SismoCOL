import type { Prisma } from '../../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

/** Los decimales viajan como number y los opcionales como null (docs/api-contrato.md). */
export function aNumero(valor: Decimal | null): number | null {
  return valor === null ? null : valor.toNumber();
}

export const SELECCION_SISMO = {
  idSismo: true,
  fechaHora: true,
  latitud: true,
  longitud: true,
  precisionUbicacion: true,
  profundidadKm: true,
  magnitud: true,
  departamento: true,
  municipio: true,
  zona: true,
  fuente: true,
  nivelImpacto: true,
  esReplica: true,
  esAnomalo: true,
  motivoAnomalia: true,
} satisfies Prisma.RegistroSismicoSelect;

type SismoBd = Prisma.RegistroSismicoGetPayload<{ select: typeof SELECCION_SISMO }>;

export function aSismo(s: SismoBd) {
  return {
    ...s,
    fechaHora: s.fechaHora.toISOString(),
    latitud: aNumero(s.latitud),
    longitud: aNumero(s.longitud),
    profundidadKm: aNumero(s.profundidadKm),
    magnitud: aNumero(s.magnitud),
  };
}

export type Sismo = ReturnType<typeof aSismo>;
