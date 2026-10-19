import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

export const CLASES_CONTROL =
  'block w-full rounded-xl border border-borde bg-superficie px-3 py-2.5 text-sm text-tinta transition-[border-color,box-shadow] duration-200 placeholder:text-tinta-tenue hover:border-tinta-tenue/50 focus:border-primario focus:outline-none focus:ring-4 focus:ring-primario/15 disabled:bg-superficie-2 aria-[invalid=true]:border-peligro';

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
        <p id={idError} className="mt-1 text-xs font-medium text-peligro">
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
