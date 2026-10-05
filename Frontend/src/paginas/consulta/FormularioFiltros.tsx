import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { FUENTES, type FiltrosSismos } from '@/api/tipos';
import { Boton } from '@/componentes/ui/Basicos';
import { numeroOpcional } from '@/lib/formularios';
import { Campo, Entrada, Selector } from '@/componentes/ui/Formulario';
import { esquemaFiltros, LIMITES, type DatosFiltros } from '@/lib/esquemas';
import { ETIQUETAS_FUENTE } from '@/lib/etiquetas';

interface Props {
  departamentos: string[];
  cargandoDepartamentos: boolean;
  alAplicar: (filtros: FiltrosSismos) => void;
}

const VALORES_INICIALES: DatosFiltros = { incluirAnomalos: false };
const PASO_MAGNITUD = 0.1;

const vacioAIndefinido = (v: unknown) => (v === '' ? undefined : v);

/** Convierte los valores del formulario a filtros de la API (sin campos vacíos). */
function aFiltros(datos: DatosFiltros): FiltrosSismos {
  return {
    desde: datos.desde || undefined,
    hasta: datos.hasta || undefined,
    departamento: datos.departamento || undefined,
    fuente: (datos.fuente as FiltrosSismos['fuente']) || undefined,
    magMin: datos.magMin,
    magMax: datos.magMax,
    profMin: datos.profMin,
    profMax: datos.profMax,
    incluirAnomalos: datos.incluirAnomalos,
  };
}

export function FormularioFiltros({ departamentos, cargandoDepartamentos, alAplicar }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DatosFiltros>({ resolver: zodResolver(esquemaFiltros), defaultValues: VALORES_INICIALES });

  const aplicar = handleSubmit((datos) => alAplicar(aFiltros(datos)));
  const limpiar = () => {
    reset(VALORES_INICIALES);
    alAplicar(aFiltros(VALORES_INICIALES));
  };
  const numero = { setValueAs: numeroOpcional };
  const texto = { setValueAs: vacioAIndefinido };

  return (
    <form onSubmit={(e) => void aplicar(e)} noValidate aria-label="Filtros de sismos">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Campo etiqueta="Desde" error={errors.desde?.message}>
          {(p) => <Entrada {...p} type="date" {...register('desde', texto)} />}
        </Campo>
        <Campo etiqueta="Hasta" error={errors.hasta?.message}>
          {(p) => <Entrada {...p} type="date" {...register('hasta', texto)} />}
        </Campo>
        <Campo etiqueta="Departamento">
          {(p) => (
            <Selector {...p} disabled={cargandoDepartamentos} {...register('departamento', texto)}>
              <option value="">Todos</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Selector>
          )}
        </Campo>
        <Campo etiqueta="Fuente">
          {(p) => (
            <Selector {...p} {...register('fuente', texto)}>
              <option value="">Todas</option>
              {FUENTES.map((f) => (
                <option key={f} value={f}>
                  {ETIQUETAS_FUENTE[f]}
                </option>
              ))}
            </Selector>
          )}
        </Campo>
        <Campo etiqueta="Magnitud mínima" error={errors.magMin?.message}>
          {(p) => (
            <Entrada
              {...p}
              type="number"
              inputMode="decimal"
              step={PASO_MAGNITUD}
              min={LIMITES.magnitudFiltro.min}
              max={LIMITES.magnitudFiltro.max}
              {...register('magMin', numero)}
            />
          )}
        </Campo>
        <Campo etiqueta="Magnitud máxima" error={errors.magMax?.message}>
          {(p) => (
            <Entrada
              {...p}
              type="number"
              inputMode="decimal"
              step={PASO_MAGNITUD}
              min={LIMITES.magnitudFiltro.min}
              max={LIMITES.magnitudFiltro.max}
              {...register('magMax', numero)}
            />
          )}
        </Campo>
        <Campo etiqueta="Profundidad mínima (km)" error={errors.profMin?.message}>
          {(p) => <Entrada {...p} type="number" inputMode="decimal" min={0} {...register('profMin', numero)} />}
        </Campo>
        <Campo etiqueta="Profundidad máxima (km)" error={errors.profMax?.message}>
          {(p) => <Entrada {...p} type="number" inputMode="decimal" min={0} {...register('profMax', numero)} />}
        </Campo>
        <div className="flex items-end">
          <label className="flex items-center gap-2 py-2 text-sm text-tinta-secundaria">
            <input type="checkbox" className="h-4 w-4 accent-primario" {...register('incluirAnomalos')} />
            Incluir registros anómalos
          </label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Boton type="submit">Aplicar filtros</Boton>
        <Boton variante="secundario" onClick={limpiar}>
          Limpiar
        </Boton>
      </div>
    </form>
  );
}
