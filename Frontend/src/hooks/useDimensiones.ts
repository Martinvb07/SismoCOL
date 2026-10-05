import { useEffect, useRef, useState, type RefObject } from 'react';

export interface Dimensiones {
  ancho: number;
  alto: number;
}

/**
 * Observa el tamaño de un contenedor con ResizeObserver.
 * Devuelve el ref a asignar y el ancho/alto actuales (0 hasta la primera medición).
 */
export function useDimensiones<T extends HTMLElement = HTMLDivElement>(): [RefObject<T>, Dimensiones] {
  const ref = useRef<T>(null);
  const [dimensiones, setDimensiones] = useState<Dimensiones>({ ancho: 0, alto: 0 });

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    const actualizar = (ancho: number, alto: number) => {
      setDimensiones((previas) =>
        previas.ancho === Math.round(ancho) && previas.alto === Math.round(alto)
          ? previas
          : { ancho: Math.round(ancho), alto: Math.round(alto) },
      );
    };

    const rect = elemento.getBoundingClientRect();
    actualizar(rect.width, rect.height);

    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (entrada) actualizar(entrada.contentRect.width, entrada.contentRect.height);
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return [ref, dimensiones];
}
