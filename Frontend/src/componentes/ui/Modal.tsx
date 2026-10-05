import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconoCerrar } from './Iconos';

interface Props {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
}

/** Diálogo modal accesible basado en <dialog>. */
export function Modal({ abierto, titulo, alCerrar, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) {
      if (typeof dialogo.showModal === 'function') dialogo.showModal();
      else dialogo.setAttribute('open', '');
    } else if (!abierto && dialogo.open) {
      if (typeof dialogo.close === 'function') dialogo.close();
      else dialogo.removeAttribute('open');
    }
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-borde p-0 shadow-xl backdrop:bg-lateral/60"
    >
      {abierto && (
        <div className="p-5">
          <header className="mb-4 flex items-center justify-between gap-4">
            <h2 id={idTitulo} className="text-lg font-semibold text-tinta">
              {titulo}
            </h2>
            <button
              type="button"
              onClick={alCerrar}
              className="rounded p-1 text-tinta-tenue hover:bg-fondo hover:text-tinta"
              aria-label="Cerrar"
            >
              <IconoCerrar />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
