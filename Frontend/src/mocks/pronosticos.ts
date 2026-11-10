/**
 * Datos simulados de los pronósticos para desarrollo y pruebas (MSW).
 * No son resultados: los valores reales los calcula Analytics con el catálogo cargado.
 */
import type {
  RespuestaReplicasSismo,
  Sismo,
  CabeceraAmenaza,
  MunicipioEscenario,
  ReporteEntrenamiento,
  RespuestaEscenario,
  DetalleReplicas,
  RespuestaMapaAmenaza,
  RespuestaPeriodosRetorno,
  ModeloPronostico,
  PronosticoActividad,
  PuntoPronostico,
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

/* ---------- Pronóstico de actividad por zona (simulado) ---------- */

function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function pronosticoActividad(zona: string): PronosticoActividad {
  const base = 20 + (zona.length % 7) * 10;
  const serie = Array.from({ length: 44 }, (_, i) => ({
    mes: sumarMeses('2022-12', i),
    eventos: Math.round(base + 6 * Math.sin((2 * Math.PI * i) / 12) + ((i * 7) % 5) - 2),
  }));
  const ultimo = serie[serie.length - 1]?.mes ?? '2026-07';
  const generar = (valor: number, ancho: number): PuntoPronostico[] =>
    Array.from({ length: 12 }, (_, i) => ({
      mes: sumarMeses(ultimo, i + 1),
      valor,
      inferior80: Math.max(0, valor - ancho),
      superior80: valor + ancho,
      inferior95: Math.max(0, valor - 1.6 * ancho),
      superior95: valor + 1.6 * ancho,
    }));
  const pronosticos: Record<ModeloPronostico, PuntoPronostico[]> = {
    SARIMA: generar(base, 6),
    INGENUO: generar(serie[serie.length - 1]?.eventos ?? base, 9),
    MEDIA_MOVIL_12: generar(base + 1, 7),
  };
  return {
    zona,
    modeloGanador: 'MEDIA_MOVIL_12',
    mc: 2.1,
    periodoInicio: '2022-12-01',
    periodoFin: '2026-07-31',
    nMeses: serie.length,
    parametros: {
      mc: 2.1,
      ordenSarima: [1, 0, 0],
      ordenEstacional: [0, 0, 0, 0],
      aic: 120.4,
      transformacion: 'log1p',
      horizonteMeses: 12,
      horizonteBacktest: 3,
      minMesesEntrenamiento: 24,
      catalogo: 'SGC',
      seleccionOrden: 'AIC con los primeros 24 meses',
    },
    serie,
    pronostico: pronosticos.MEDIA_MOVIL_12,
    pronosticos,
    backtesting: [
      { modelo: 'MEDIA_MOVIL_12', mae: 4.1, mape: 14.2, nPronosticos: 57, maePorHorizonte: { '1': 4.0, '2': 4.1, '3': 4.2 } },
      { modelo: 'SARIMA', mae: 4.4, mape: 15.0, nPronosticos: 57, maePorHorizonte: { '1': 4.2, '2': 4.4, '3': 4.6 } },
      { modelo: 'INGENUO', mae: 5.9, mape: 20.3, nPronosticos: 57, maePorHorizonte: { '1': 5.1, '2': 5.9, '3': 6.7 } },
    ],
    fechaCalculo: '2026-11-10T07:15:00.000Z',
  };
}

/* ---------- Periodo de retorno y amenaza (simulado) ---------- */

const CABECERA_AMENAZA: CabeceraAmenaza = {
  idCalculo: 1,
  catalogo: 'USGS_HIST',
  periodoInicio: '1973-01-05T00:39:48.000Z',
  periodoFin: '2026-11-07T17:17:38.000Z',
  parametros: {
    catalogo: 'USGS_HIST',
    magnitudMinCatalogo: 4.5,
    depuracion: 'Gardner-Knopoff (1974)',
    eventosCatalogo: 1000,
    eventosDepurados: 600,
    mc: 4.7,
    mcPorDecada: { '1990s': 4.7 },
    bRegional: 1.0,
    errorBRegional: 0.03,
    anios: 53.8,
    minEventosZona: 30,
    tamanoCeldaGrados: 0.5,
    distanciaCorrelacionKm: 50,
    magnitudMapa: 5,
    aniosMapa: 10,
    metodoMapa: 'Sismicidad suavizada con kernel gaussiano (Frankel 1995)',
  },
  fechaCalculo: '2026-11-10T07:15:00.000Z',
};

function zonaSimulada(zona: string, a: number, b: number, agrupadaEn: string | null = null) {
  return {
    zona,
    agrupadaEn,
    nEventos: 120,
    mc: 4.7,
    a,
    b,
    errorB: 0.08,
    magnitudMaximaObservada: 7.2,
    magnitudes: [5, 6, 7].map((m) => {
      const tasa = 10 ** (a - b * m);
      const prob = (t: number) => 1 - Math.exp(-tasa * t);
      return {
        magnitud: m,
        tasaAnual: tasa,
        periodoRetorno: 1 / tasa,
        periodoRetornoMin: 0.8 / tasa,
        periodoRetornoMax: 1.3 / tasa,
        extrapolado: m > 7.2,
        probabilidades: { dias30: prob(30 / 365.25), anios1: prob(1), anios5: prob(5), anios10: prob(10), anios50: prob(50) },
      };
    }),
  };
}

export const PERIODOS_RETORNO: RespuestaPeriodosRetorno = {
  ...CABECERA_AMENAZA,
  zonas: [zonaSimulada('Chocó', 5.4, 0.85), zonaSimulada('Nido de Bucaramanga', 6.6, 1.3), zonaSimulada('Huila', 5.8, 1.1, 'Región Andina')],
};

export const MAPA_AMENAZA: RespuestaMapaAmenaza = {
  ...CABECERA_AMENAZA,
  celdas: Array.from({ length: 36 * 32 }, (_, k) => {
    const latitud = -4.25 + Math.floor(k / 32) * 0.5;
    const longitud = -81.75 + (k % 32) * 0.5;
    const intensidad = Math.exp(-(((latitud - 6.5) / 3) ** 2) - ((longitud + 75.5) / 2) ** 2);
    const tasa = 0.12 * intensidad;
    return { latitud, longitud, eventos: Math.round(intensidad * 5), tasaM5: tasa, probabilidad10a: 1 - Math.exp(-tasa * 10) };
  }),
};

/* ---------- Modelo de impacto v2 (simulado) ---------- */

const POR_CLASE_SIMULADO = {
  SIN_AFECTACION: { precision: 0.85, recall: 0.82, f1: 0.83, soporte: 700 },
  BAJO: { precision: 0.52, recall: 0.55, f1: 0.53, soporte: 220 },
  MODERADO: { precision: 0.45, recall: 0.43, f1: 0.44, soporte: 80 },
  ALTO: { precision: 0.4, recall: 0.38, f1: 0.39, soporte: 40 },
};

export const REPORTE_MODELO_V2: ReporteEntrenamiento = {
  clases: ['SIN_AFECTACION', 'BAJO', 'MODERADO', 'ALTO'],
  matrizConfusion: [
    [574, 100, 20, 6],
    [80, 121, 15, 4],
    [10, 30, 34, 6],
    [2, 8, 15, 15],
  ],
  porClase: POR_CLASE_SIMULADO,
  validacion: 'Validación cruzada estratificada de 5 pliegues (predicciones fuera de pliegue)',
  comparacion: [
    { algoritmo: 'Random Forest (actual, 4 variables)', f1Macro: 0.5, exactitud: 0.66, brier: 0.48, porClase: POR_CLASE_SIMULADO },
    { algoritmo: 'Random Forest + variables nuevas', f1Macro: 0.55, exactitud: 0.7, brier: 0.44, porClase: POR_CLASE_SIMULADO },
    { algoritmo: 'LightGBM + variables nuevas', f1Macro: 0.56, exactitud: 0.71, brier: 0.43, porClase: POR_CLASE_SIMULADO },
    { algoritmo: 'Ordinal Frank-Hall (LightGBM)', f1Macro: 0.54, exactitud: 0.7, brier: 0.44, porClase: POR_CLASE_SIMULADO },
    { algoritmo: 'Baseline (clase mayoritaria)', f1Macro: 0.2, exactitud: 0.67, brier: 0.5, porClase: POR_CLASE_SIMULADO },
  ],
  elegido: 'LightGBM + variables nuevas',
  sinCalibrar: { f1Macro: 0.56, exactitud: 0.71, brier: 0.43, porClase: POR_CLASE_SIMULADO },
  calibracion: { metodo: 'isotonic', f1Macro: 0.56, exactitud: 0.72, brier: 0.4, porClase: POR_CLASE_SIMULADO },
  desplegado: 'calibrado',
  criterioDespliegue: 'Calibrado salvo que su F1 macro caiga más de 0.01 frente al modelo sin calibrar',
  confiabilidad: {
    sinCalibrar: { ALTO: [{ predicha: 0.1, observada: 0.05 }, { predicha: 0.5, observada: 0.3 }, { predicha: 0.8, observada: 0.6 }] },
    calibrado: { ALTO: [{ predicha: 0.1, observada: 0.09 }, { predicha: 0.5, observada: 0.47 }, { predicha: 0.8, observada: 0.77 }] },
  },
  shap: {
    metodo: 'TreeExplainer',
    salida: 'log-odds',
    muestra: 300,
    importancia: [
      { variable: 'mmi', etiqueta: 'Intensidad estimada (MMI)', media: 0.8, porClase: {} },
      { variable: 'log_poblacion', etiqueta: 'Población (log10)', media: 0.4, porClase: {} },
      { variable: 'magnitud', etiqueta: 'Magnitud', media: 0.3, porClase: {} },
    ],
  },
  activacion: {
    regla: 'Se activa solo si su F1 macro supera al del modelo vigente con los mismos pliegues',
    vigente: { version: 'v1.1.0', algoritmo: 'Random Forest', f1Macro: 0.5, f1MacroRegistrado: 0.6 },
    comparadoCon: 'mismos pliegues',
    f1MacroNuevo: 0.56,
    activado: true,
  },
  composicion: { REPORTE: { BAJO: 220, MODERADO: 80, ALTO: 40, SIN_AFECTACION: 20 }, CONTROL_MISMO_EVENTO: { SIN_AFECTACION: 340 } },
  ejemplos: 1040,
  reportes: 360,
  reportesConEpicentro: 210,
  avisosDatos: ['Densidad de población no incluida: el área municipal (MGN del DANE) no se pudo descargar.'],
};

export function escenarioSimulado(e: { magnitud: number; profundidadKm: number; latitud: number; longitud: number }): RespuestaEscenario {
  const municipios: MunicipioEscenario[] = Array.from({ length: 12 }, (_, i) => {
    const latitud = e.latitud + Math.cos(i) * 0.15 * (1 + (i % 4));
    const longitud = e.longitud + Math.sin(i) * 0.15 * (1 + (i % 4));
    const distancia = Math.hypot((latitud - e.latitud) * 111, (longitud - e.longitud) * 111, e.profundidadKm);
    const mmi = Math.max(3, 2 + 1.4 * e.magnitud - 1.4 * Math.log(Math.max(distancia, 10)));
    const nivel = mmi >= 7 ? 'ALTO' : mmi >= 6 ? 'MODERADO' : mmi >= 5 ? 'BAJO' : 'SIN_AFECTACION';
    return {
      codigo: String(10000 + i),
      municipio: `Municipio ${i + 1}`,
      departamento: 'Simulado',
      latitud,
      longitud,
      distanciaHipocentralKm: Number(distancia.toFixed(1)),
      intensidadMmi: Number(mmi.toFixed(2)),
      nivelImpacto: nivel,
      probabilidad: 0.6,
      probabilidades: { SIN_AFECTACION: 0.1, BAJO: 0.1, MODERADO: 0.2, ALTO: nivel === 'ALTO' ? 0.6 : 0.1 },
      poblacion: 10000 + i * 1000,
    };
  });
  return {
    entrada: e,
    criterio: 'Municipios con MMI estimada ≥ 3 a ≤ 300 km del epicentro',
    ecuacionIntensidad: 'Allen, Wald y Worden (2012), distancia hipocentral',
    modelo: { idModelo: 2, version: 'v1.1.0', algoritmo: 'LightGBM + variables nuevas' },
    modeloUsaDistancia: true,
    municipios,
  };
}

/** Pronóstico genérico simulado para un sismo cualquiera (sin réplicas registradas). */
export function replicasGenericas(s: Sismo): RespuestaReplicasSismo {
  const base = pronostico('PRONOSTICO', 24, 99);
  return {
    principal: {
      idSismo: s.idSismo,
      fechaHora: s.fechaHora,
      magnitud: s.magnitud ?? 4,
      profundidadKm: s.profundidadKm,
      latitud: s.latitud ?? 0,
      longitud: s.longitud ?? 0,
      municipio: s.municipio,
      departamento: s.departamento,
      fuente: s.fuente,
    },
    pronostico: { ...base, idPronostico: null, metodo: 'GENERICO', nReplicas: 0 },
    validacion: [],
    metodo: 'GENERICO',
    advertencia: 'Casi no hay réplicas registradas de este sismo, así que el cálculo usa valores típicos de otras regiones del mundo.',
    origen: 'CALCULADO',
  };
}
