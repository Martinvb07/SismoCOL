/**
 * Datos simulados de los pronósticos para desarrollo y pruebas (MSW).
 * No son resultados: los valores reales los calcula Analytics con el catálogo cargado.
 */
import type {
  DetalleReplicas,
  HorizonteReplicas,
  PronosticoReplicas,
  PuntoCurvaReplicas,
  ResumenPrincipal,
  SismoPrincipal,
} from '@/api/tipos';

const PRINCIPAL: SismoPrincipal = {
  idSismo: 9001,
  fechaHora: '2026-08-10T12:34:28.000Z',
  magnitud: 7.4,
  profundidadKm: 116.1,
  latitud: 4.8601,
  longitud: -76.2558,
  municipio: 'San José del Palmar',
  departamento: 'Chocó',
  fuente: 'SGC',
};

const PAR = { a: -2.2, b: 0.91, p: 1.08, c: 0.05, mc: 3.0, mm: 7.4 };

function integral(t1: number, t2: number): number {
  const q = 1 - PAR.p;
  return ((t2 + PAR.c) ** q - (t1 + PAR.c) ** q) / q;
}

function esperado(m: number, t1: number, t2: number): number {
  return 10 ** (PAR.a + PAR.b * (PAR.mm - m)) * integral(t1, t2);
}

function ventana(m: number, t1: number, t2: number, observado?: number) {
  const n = esperado(m, t1, t2);
  const ic: [number, number] = [Math.max(0, Math.floor(n - 2 * Math.sqrt(n))), Math.ceil(n + 2 * Math.sqrt(n) + 1)];
  return {
    magnitud: m,
    esperado: Number(n.toFixed(3)),
    probabilidad: Number((1 - Math.exp(-n)).toFixed(4)),
    ic95: ic,
    ...(observado !== undefined && { observado, dentroIc95: observado >= ic[0] && observado <= ic[1], logVerosimilitud: -2.1 }),
  };
}

function horizontes(t0: number, conObservado = false): HorizonteReplicas[] {
  return (
    [
      ['24h', 1],
      ['7d', 7],
      ['30d', 30],
    ] as const
  ).map(([horizonte, dias]) => ({
    horizonte,
    dias,
    ...(conObservado && { cobertura: 1 }),
    magnitudes: [4, 5, 6].map((m) => ventana(m, t0, t0 + dias, conObservado ? Math.round(esperado(m, t0, t0 + dias) * 0.8) : undefined)),
  }));
}

function curva(tDatos: number): PuntoCurvaReplicas[] {
  const puntos: PuntoCurvaReplicas[] = [];
  for (let i = 0; i < 40; i++) {
    const t = 0.01 * 10 ** ((i / 39) * Math.log10((tDatos + 30) / 0.01));
    const n = esperado(PAR.mc, 0, t);
    puntos.push({
      dias: Number(t.toFixed(4)),
      observado: t <= tDatos ? Math.round(n * 0.9) : null,
      esperado: Number(n.toFixed(2)),
      inferior: Math.max(0, Math.floor(n - 2 * Math.sqrt(n))),
      superior: Math.ceil(n + 2 * Math.sqrt(n) + 1),
    });
  }
  return puntos;
}

function pronostico(tipo: 'PRONOSTICO' | 'VALIDACION', horas: number, id: number): PronosticoReplicas {
  const t = horas / 24;
  return {
    idPronostico: id,
    tipo,
    horasAjuste: horas,
    inicioAjuste: PRINCIPAL.fechaHora,
    finAjuste: '2026-08-26T23:59:00.000Z',
    metodo: 'MAXIMA_VEROSIMILITUD',
    nReplicas: 64,
    mc: PAR.mc,
    a: PAR.a,
    b: PAR.b,
    p: PAR.p,
    c: PAR.c,
    parametros: {
      magnitudMinPrincipal: 6,
      ventanaKm: 79.3,
      ventanaDias: 945.6,
      fuentes: ['SGC'],
      datosHasta: '2026-08-26T23:59:00.000Z',
      finCatalogoSgc: '2026-08-26T23:59:00.000Z',
      nSecuencia: 120,
      modelo: 'Reasenberg y Jones (1989); Omori-Utsu por máxima verosimilitud',
      bEstimado: true,
      errorB: 0.12,
      avisos: [],
    },
    resultados:
      tipo === 'PRONOSTICO'
        ? { horizontes: horizontes(t), curva: curva(t) }
        : {
            horizontes: horizontes(t, true),
            horizontesGenerico: horizontes(t, true),
            curva: curva(16.5),
            resumen: { casos: 9, fraccionDentroIc95: 0.78, errorAbsolutoMedio: 1.2, logVerosimilitudTotal: -18.4 },
            resumenGenerico: { casos: 9, fraccionDentroIc95: 0.56, errorAbsolutoMedio: 3.4, logVerosimilitudTotal: -27.9 },
          },
    fechaCalculo: '2026-11-10T07:15:00.000Z',
  };
}

export const PRINCIPALES_REPLICAS: ResumenPrincipal[] = [
  {
    ...PRINCIPAL,
    metodo: 'MAXIMA_VEROSIMILITUD',
    nReplicas: 64,
    probabilidad7dM4: ventana(4, 16.5, 23.5).probabilidad,
    tieneValidacion: true,
    fechaCalculo: '2026-11-10T07:15:00.000Z',
  },
];

export function detalleReplicas(idSismo: number): DetalleReplicas | null {
  if (idSismo !== PRINCIPAL.idSismo) return null;
  return {
    principal: PRINCIPAL,
    pronostico: pronostico('PRONOSTICO', 16.5 * 24, 1),
    validacion: [24, 72, 168].map((h, i) => pronostico('VALIDACION', h, 2 + i)),
  };
}
