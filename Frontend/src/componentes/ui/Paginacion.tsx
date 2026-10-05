import { formatearEntero } from '@/lib/formato';
import { Boton } from './Basicos';

interface Props {
  pagina: number;
  tamano: number;
  total: number;
  alCambiar: (pagina: number) => void;
  cargando?: boolean;
}

export function Paginacion({ pagina, tamano, total, alCambiar, cargando = false }: Props) {
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = Math.min(pagina * tamano, total);
  return (
    <nav aria-label="Paginación" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-tinta-secundaria">
      <p aria-live="polite">
        {formatearEntero(desde)}–{formatearEntero(hasta)} de {formatearEntero(total)}
      </p>
      <div className="flex items-center gap-2">
        <Boton variante="secundario" tamano="sm" disabled={pagina <= 1 || cargando} onClick={() => alCambiar(pagina - 1)}>
          Anterior
        </Boton>
        <span>
          Página {formatearEntero(pagina)} de {formatearEntero(totalPaginas)}
        </span>
        <Boton
          variante="secundario"
          tamano="sm"
          disabled={pagina >= totalPaginas || cargando}
          onClick={() => alCambiar(pagina + 1)}
        >
          Siguiente
        </Boton>
      </div>
    </nav>
  );
}
