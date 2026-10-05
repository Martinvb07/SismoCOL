import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const CLASES_CONTROL =
  'block w-full rounded-md border border-borde bg-white px-3 py-2 text-sm text-tinta placeholder:text-tinta-tenue focus:border-primario focus:outline-none focus:ring-2 focus:ring-primario/40 disabled:bg-fondo aria-[invalid=true]:border-[#d23c3c]';

interface PropsCampo {
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}

/** Envuelve un control con label, ayuda y mensaje de error accesibles. */
export function Campo({ etiqueta, error, ayuda, children, className = '' }: PropsCampo) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descritoPor = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-tinta-secundaria">
        {etiqueta}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': descritoPor })}
      {ayuda && !error && (
        <p id={idAyuda} className="mt-1 text-xs text-tinta-tenue">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="mt-1 text-xs font-medium text-[#b42828]">
          {error}
        </p>
      )}
    </div>
  );
}

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada(
  { className = '', ...props },
  ref,
) {
  return <input ref={ref} className={`${CLASES_CONTROL} ${className}`} {...props} />;
});

export const Selector = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selector(
  { className = '', children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={`${CLASES_CONTROL} ${className}`} {...props}>
      {children}
    </select>
  );
});

/** Convierte el valor de un input numérico vacío en undefined (para Zod opcional). */
export function numeroOpcional(valor: unknown): number | undefined {
  if (valor === '' || valor === null || valor === undefined) return undefined;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
}
