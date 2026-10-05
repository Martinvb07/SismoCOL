import { describe, expect, it } from 'vitest';
import { log10NTotal, nTotalEsperado, probabilidadPoisson, rectaGutenbergRichter, senalesPorMagnitud, valorSen } from './analisis';

describe('recta de Gutenberg-Richter', () => {
  // a anual = 3, b = 1, catálogo de 4 años
  const gr = { a: 3, b: 1, anios: 4, mc: 2 };

  it('convierte el a anual a conteos totales sumando log10(años)', () => {
    expect(log10NTotal(gr.a, gr.b, gr.anios, 2)).toBeCloseTo(3 + Math.log10(4) - 2, 10);
    // N_anual(≥2) = 10^(3−2) = 10 → en 4 años, 40
    expect(nTotalEsperado(gr.a, gr.b, gr.anios, 2)).toBeCloseTo(40, 8);
  });

  it('con un solo año coincide con la recta anual', () => {
    expect(nTotalEsperado(3, 1, 1, 2)).toBeCloseTo(10, 8);
  });

  it('dibuja desde Mc hasta la magnitud máxima con pendiente −b', () => {
    const [inicio, fin] = rectaGutenbergRichter(gr, 5);
    expect(inicio.magnitud).toBe(2);
    expect(fin.magnitud).toBe(5);
    expect(inicio.n).toBeCloseTo(40, 8);
    expect(fin.n).toBeCloseTo(0.04, 8);
    const pendiente = (Math.log10(fin.n) - Math.log10(inicio.n)) / (fin.magnitud - inicio.magnitud);
    expect(pendiente).toBeCloseTo(-gr.b, 10);
  });

  it('no dibuja hacia atrás si la magnitud máxima es menor que Mc', () => {
    const [inicio, fin] = rectaGutenbergRichter(gr, 1.5);
    expect(fin.magnitud).toBe(inicio.magnitud);
  });
});

describe('probabilidad de Poisson', () => {
  it('P = 1 − exp(−10^(a−bM)·t)', () => {
    expect(probabilidadPoisson(3, 1, 4, 1)).toBeCloseTo(1 - Math.exp(-0.1), 10);
    expect(probabilidadPoisson(3, 1, 4, 10)).toBeCloseTo(1 - Math.exp(-1), 10);
  });
});

describe('recta de Sen', () => {
  it('evalúa intercepto + pendiente·t con t = índice de mes', () => {
    expect(valorSen({ interceptoSen: 10, pendienteSen: 0.5 }, 0)).toBe(10);
    expect(valorSen({ interceptoSen: 10, pendienteSen: 0.5 }, 12)).toBe(16);
  });
});

describe('señales del ESP32', () => {
  it.each([
    [2.0, { verde: true, amarillo: false, rojo: false, vibracion: false, buzzer: false }],
    [4.0, { verde: true, amarillo: true, rojo: false, vibracion: true, buzzer: false }],
    [5.9, { verde: true, amarillo: true, rojo: false, vibracion: true, buzzer: false }],
    [6.0, { verde: true, amarillo: true, rojo: true, vibracion: true, buzzer: true }],
  ])('M %s', (magnitud, esperado) => {
    expect(senalesPorMagnitud(magnitud)).toEqual(esperado);
  });
});
