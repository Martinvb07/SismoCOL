import { describe, expect, it } from 'vitest';
import type { Advertencia, PronosticoReplicas, ZonaPeriodoRetorno } from '@/api/tipos';
import { detalleReplicas, escenarioSimulado, pronosticoActividad, PERIODOS_RETORNO } from '@/mocks/pronosticos';
import { explicacionSemaforo, nivelSemaforo } from '@/umbralesSemaforo';
import {
  cadaCuanto,
  intensidadEnPalabras,
  porcentajeSimple,
  resumenAdvertencias,
  resumenAmenazaZona,
  resumenEscenario,
  resumenPronosticoZona,
  resumenReplicas,
  tituloCurvaReplicas,
  unirLista,
} from './resumenes';

const SIGLAS = /\b(MMI|IC|MAE|MAPE|SHAP|SARIMA|GR|Mc|Tr)\b/;

describe('semáforo', () => {
  it('clasifica con los umbrales del archivo de configuración', () => {
    expect(nivelSemaforo('replicas', 0.05)).toBe('BAJO');
    expect(nivelSemaforo('replicas', 0.1)).toBe('MODERADO');
    expect(nivelSemaforo('replicas', 0.35)).toBe('ALTO');
    expect(nivelSemaforo('actividadZona', 1.0)).toBe('BAJO');
    expect(nivelSemaforo('actividadZona', 1.2)).toBe('MODERADO');
    expect(nivelSemaforo('actividadZona', 1.4)).toBe('ALTO');
    expect(explicacionSemaforo('amenaza')).toMatch(/Bajo: menos de 10\u00a0%\. Moderado: desde 10\u00a0% hasta menos de 50\u00a0%\. Alto: 50\u00a0% o más\./);
  });
});

describe('frases en palabras simples', () => {
  it('réplicas: probabilidad de M ≥ 5 a 7 días y rango de M ≥ 4, sin siglas', () => {
    const p = detalleReplicas(9001)?.pronostico as PronosticoReplicas;
    const r = resumenReplicas(p);
    expect(r.texto).toMatch(/^En los próximos 7 días, contados desde el .+, hay .+ de probabilidad de al menos una réplica de magnitud 5 o mayor; lo más probable/);
    expect(r.texto).not.toMatch(SIGLAS);
    expect(['BAJO', 'MODERADO', 'ALTO']).toContain(r.nivel);
  });

  it('pronóstico por zona: valor del primer mes con su rango y comparación con el promedio', () => {
    const r = resumenPronosticoZona(pronosticoActividad('Antioquia'));
    expect(r.texto).toMatch(/^Para Antioquia se esperan unos \d+ sismos de magnitud 2,1 o mayor en agosto de 2026/);
    expect(r.texto).toMatch(/entre \d+ y \d+/);
    expect(r.texto).not.toMatch(SIGLAS);
    expect(resumenPronosticoZona(pronosticoActividad('Colombia')).texto).toMatch(/^En todo el país/);
  });

  it('amenaza: periodo de retorno en palabras y probabilidad a 10 años', () => {
    const choco = PERIODOS_RETORNO.zonas.find((z) => z.zona === 'Chocó') as ZonaPeriodoRetorno;
    expect(resumenAmenazaZona(choco).texto).toMatch(/^En Chocó se espera en promedio un sismo de magnitud 6 o más (cada \d+ años|.*al año)\./);
    const huila = PERIODOS_RETORNO.zonas.find((z) => z.agrupadaEn) as ZonaPeriodoRetorno;
    expect(resumenAmenazaZona(huila).texto).toMatch(/calculado con toda la región Andina/);
    expect(cadaCuanto(5.2)).toBe('cada 5 años');
    expect(cadaCuanto(0.4)).toBe('unas 3 veces al año');
  });

  it('escenario y advertencias', () => {
    const e = resumenEscenario(escenarioSimulado({ magnitud: 7, profundidadKm: 20, latitud: 5, longitud: -76 }));
    expect(e.texto).toMatch(/^Con un sismo así, 12 municipios sentirían la sacudida/);
    const adv = (zona: string, nivel: Advertencia['nivel']) => ({ zona, nivel }) as Advertencia;
    const r = resumenAdvertencias([adv('Meta', 'ALTA'), adv('Huila', 'ELEVADA'), adv('Cauca', 'NORMAL')], null, { nombre: 'Meta', tendencia: 'CRECIENTE' });
    expect(r.texto).toBe('2 zonas tienen más sismos de lo normal: Meta y Huila. En Meta, la cantidad de sismos por mes viene aumentando.');
    expect(r.nivel).toBe('ALTO');
    expect(resumenAdvertencias([], null).texto).toBe('ninguna zona tiene más sismos de lo normal.');
  });

  it('utilidades', () => {
    expect(porcentajeSimple(0.004)).toBe('menos de 1 %');
    expect(unirLista(['A', 'B', 'C'])).toBe('A, B y C');
    expect(intensidadEnPalabras(6.0)).toBe('se sentiría fuerte');
    expect(tituloCurvaReplicas([{ dias: 1, observado: 50, esperado: 10, inferior: 5, superior: 15 }])).toBe('Hubo más réplicas de las que el modelo esperaba');
  });
});
