import { useCallback, useState } from 'react';

/* Preferencias de este navegador. index.html las aplica antes de pintar. */

const CLAVE_TEMA = 'sismocol.tema';
const CLAVE_LATERAL = 'sismocol.lateral';

export type Tema = 'claro' | 'oscuro';

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: la preferencia dura solo esta visita */
  }
}

export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => (document.documentElement.dataset.tema === 'oscuro' ? 'oscuro' : 'claro'));
  const alternar = useCallback(() => {
    setTema((actual) => {
      const siguiente: Tema = actual === 'oscuro' ? 'claro' : 'oscuro';
      document.documentElement.dataset.tema = siguiente;
      guardar(CLAVE_TEMA, siguiente);
      return siguiente;
    });
  }, []);
  return [tema, alternar];
}

/** Lateral contraído (solo íconos). */
export function useLateralMini(): [boolean, () => void] {
  const [mini, setMini] = useState(() => document.documentElement.dataset.lateral === 'mini');
  const alternar = useCallback(() => {
    setMini((actual) => {
      const siguiente = !actual;
      if (siguiente) document.documentElement.dataset.lateral = 'mini';
      else delete document.documentElement.dataset.lateral;
      guardar(CLAVE_LATERAL, siguiente ? 'mini' : 'completo');
      return siguiente;
    });
  }, []);
  return [mini, alternar];
}
