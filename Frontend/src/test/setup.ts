import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

// jsdom no implementa ResizeObserver: se simula con un ancho fijo
class ResizeObserverFalso {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(elemento: Element) {
    const ANCHO = 640;
    const ALTO = 320;
    this.callback(
      [{ target: elemento, contentRect: { width: ANCHO, height: ALTO } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverFalso as unknown as typeof ResizeObserver;
