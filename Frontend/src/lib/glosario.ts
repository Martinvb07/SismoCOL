/** Glosario de términos técnicos: una frase simple por término (ícono de ayuda «i»). */
export const GLOSARIO = {
  magnitud: 'Medida de la energía liberada por un sismo. Cada punto más equivale a unas 32 veces más energía.',
  replica: 'Sismo más pequeño que ocurre después de uno grande y cerca de él. Son más frecuentes en las primeras horas y días.',
  periodoRetorno: 'Tiempo promedio entre dos sismos de cierta magnitud en una zona. No dice cuándo ocurrirá el próximo.',
  valorB: 'Número que indica cuántos sismos pequeños hay por cada grande. Si es alto, predominan los sismos pequeños.',
  intervalo: 'Rango donde se espera que caiga el valor real; con un intervalo del 95 %, el valor queda dentro 95 de cada 100 veces.',
  mmi: 'Intensidad de Mercalli: qué tan fuerte se siente la sacudida en un lugar, de I (no se siente) a XII (destrucción total).',
  shap: 'Método que muestra cuánto empujó cada dato (magnitud, distancia, población…) hacia el resultado de la predicción.',
  probabilidad: 'Qué tan posible es que algo ocurra: 0 % es imposible y 100 % es seguro.',
  completitud: 'Magnitud a partir de la cual el catálogo registra prácticamente todos los sismos; por debajo faltan algunos.',
  pValor: 'Qué tan raro sería lo observado si todo fuera normal. Si es muy pequeño, lo observado es inusual.',
  tendencia: 'Si el número de sismos por mes viene subiendo, bajando o se mantiene, según una prueba estadística.',
  backtesting: 'Prueba del modelo con datos pasados: se pronostica como si no se supiera lo que pasó y se compara con lo real.',
  errorMedio: 'Diferencia promedio entre lo pronosticado y lo que ocurrió: cuanto más pequeña, mejor el pronóstico.',
  amenaza: 'Probabilidad de que un lugar sienta un sismo de cierta magnitud en un periodo de tiempo.',
  confiabilidad: 'Compara las probabilidades que da el modelo con lo que pasó: si dice 30 %, debería ocurrir unas 30 de cada 100 veces.',
  advertencia: 'Aviso de que en una zona está temblando más de lo habitual. No significa que vaya a ocurrir un sismo fuerte.',
  impacto: 'Nivel de daños esperado en un municipio: sin afectación, bajo, moderado o alto.',
} as const;

export type TerminoGlosario = keyof typeof GLOSARIO;
