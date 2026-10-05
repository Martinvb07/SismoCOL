import { describe, expect, it } from 'vitest';
import {
  categoriaMagnitud,
  colorMagnitud,
  COLORES_ESTADO,
  estiloMagnitud,
  estiloNivelAdvertencia,
  estiloNivelImpacto,
  LEYENDA_MAGNITUD,
} from './escalasColor';

describe('escala de color por magnitud', () => {
  it.each([
    [1.0, 'LEVE'],
    [3.9, 'LEVE'],
    [4.0, 'MODERADA'],
    [5.9, 'MODERADA'],
    [6.0, 'FUERTE'],
    [7.2, 'FUERTE'],
  ] as const)('M %s → %s', (magnitud, esperada) => {
    expect(categoriaMagnitud(magnitud)).toBe(esperada);
  });

  it('usa verde, amarillo y rojo con los mismos umbrales del ESP32', () => {
    expect(colorMagnitud(2.5)).toBe(COLORES_ESTADO.verde.relleno);
    expect(colorMagnitud(4)).toBe(COLORES_ESTADO.amarillo.relleno);
    expect(colorMagnitud(6)).toBe(COLORES_ESTADO.rojo.relleno);
  });

  it('devuelve un estilo neutro con etiqueta cuando no hay magnitud', () => {
    expect(estiloMagnitud(null).tono).toBe('neutro');
    expect(estiloMagnitud(undefined).etiqueta).toBe('Sin magnitud');
    expect(estiloMagnitud(Number.NaN).tono).toBe('neutro');
  });

  it('la leyenda va en orden ascendente y cada color lleva etiqueta', () => {
    expect(LEYENDA_MAGNITUD.map((e) => e.tono)).toEqual(['verde', 'amarillo', 'rojo']);
    LEYENDA_MAGNITUD.forEach((e) => expect(e.etiqueta).not.toBe(''));
  });
});

describe('escala por nivel de impacto y advertencia', () => {
  it('asigna tonos crecientes a los niveles de impacto', () => {
    expect(estiloNivelImpacto('SIN_AFECTACION').tono).toBe('verde');
    expect(estiloNivelImpacto('BAJO').tono).toBe('amarillo');
    expect(estiloNivelImpacto('MODERADO').tono).toBe('naranja');
    expect(estiloNivelImpacto('ALTO').tono).toBe('rojo');
    expect(estiloNivelImpacto(null).tono).toBe('neutro');
  });

  it('asigna verde, amarillo y rojo a las advertencias con etiqueta en español', () => {
    expect(estiloNivelAdvertencia('NORMAL')).toMatchObject({ tono: 'verde', etiqueta: 'Normal' });
    expect(estiloNivelAdvertencia('ELEVADA')).toMatchObject({ tono: 'amarillo', etiqueta: 'Elevada' });
    expect(estiloNivelAdvertencia('ALTA')).toMatchObject({ tono: 'rojo', etiqueta: 'Alta' });
  });
});
