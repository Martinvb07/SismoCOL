import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { mensajeDeError } from '@/api/cliente';
import { apiAnalisis, claves } from '@/api/endpoints';
import type { ConfiguracionAnalisis } from '@/api/tipos';
import { Alerta, Boton, Tarjeta } from '@/componentes/ui/Basicos';
import { ContenidoConsulta } from '@/componentes/ui/Estados';
import { Campo, Entrada } from '@/componentes/ui/Formulario';
import { aplicarErroresApi, numeroOpcional } from '@/lib/formularios';
import { esquemaConfiguracion, LIMITES, type DatosConfiguracion } from '@/lib/esquemas';
import { formatearFechaHora } from '@/lib/formato';

const CAMPOS = ['ventanaDias', 'periodoBaseMeses', 'umbralElevada', 'umbralAlta', 'minEventosZona'] as const;
const PASO_UMBRAL = 0.001;

function aFormulario(c: ConfiguracionAnalisis): DatosConfiguracion {
  return {
    ventanaDias: c.ventanaDias,
    periodoBaseMeses: c.periodoBaseMeses,
    umbralElevada: c.umbralElevada,
    umbralAlta: c.umbralAlta,
    minEventosZona: c.minEventosZona,
  };
}

/** Formulario controlado por la configuración vigente. */
export function FormularioConfiguracion({ configuracion }: { configuracion: ConfiguracionAnalisis }) {
  const clienteConsultas = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<DatosConfiguracion>({ resolver: zodResolver(esquemaConfiguracion), defaultValues: aFormulario(configuracion) });

  const guardar = useMutation({
    mutationFn: apiAnalisis.guardarConfiguracion,
    onSuccess: (nueva) => {
      clienteConsultas.setQueryData(claves.configuracion, nueva);
      reset(aFormulario(nueva));
    },
    onError: (error) => aplicarErroresApi(error, setError, CAMPOS),
  });

  const numero = { setValueAs: numeroOpcional };
  const enviar = handleSubmit((datos) => guardar.mutate(datos));

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4" aria-label="Parámetros del análisis">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo
          etiqueta="Ventana de observación (días)"
          error={errors.ventanaDias?.message}
          ayuda={`Días recientes que se comparan con el periodo base (${LIMITES.ventanaDias.min}–${LIMITES.ventanaDias.max}).`}
        >
          {(p) => <Entrada {...p} type="number" min={LIMITES.ventanaDias.min} max={LIMITES.ventanaDias.max} step={1} {...register('ventanaDias', numero)} />}
        </Campo>
        <Campo
          etiqueta="Periodo base (meses)"
          error={errors.periodoBaseMeses?.message}
          ayuda={`Meses usados para estimar la tasa habitual (${LIMITES.periodoBaseMeses.min}–${LIMITES.periodoBaseMeses.max}).`}
        >
          {(p) => (
            <Entrada {...p} type="number" min={LIMITES.periodoBaseMeses.min} max={LIMITES.periodoBaseMeses.max} step={1} {...register('periodoBaseMeses', numero)} />
          )}
        </Campo>
        <Campo
          etiqueta="Umbral de actividad elevada (p-valor)"
          error={errors.umbralElevada?.message}
          ayuda="Si p < umbral, la advertencia es ELEVADA. Entre 0 y 1."
        >
          {(p) => <Entrada {...p} type="number" min={0} max={1} step={PASO_UMBRAL} {...register('umbralElevada', numero)} />}
        </Campo>
        <Campo
          etiqueta="Umbral de actividad alta (p-valor)"
          error={errors.umbralAlta?.message}
          ayuda="Si p < umbral, la advertencia es ALTA. Debe ser menor que el umbral de actividad elevada."
        >
          {(p) => <Entrada {...p} type="number" min={0} max={1} step={PASO_UMBRAL} {...register('umbralAlta', numero)} />}
        </Campo>
        <Campo
          etiqueta="Mínimo de eventos por zona"
          error={errors.minEventosZona?.message}
          ayuda={`Zonas con menos eventos se agrupan en su región (${LIMITES.minEventosZona.min}–${LIMITES.minEventosZona.max}).`}
        >
          {(p) => (
            <Entrada {...p} type="number" min={LIMITES.minEventosZona.min} max={LIMITES.minEventosZona.max} step={1} {...register('minEventosZona', numero)} />
          )}
        </Campo>
      </div>
      {guardar.isError && <Alerta tipo="error">{mensajeDeError(guardar.error)}</Alerta>}
      {guardar.isSuccess && !isDirty && (
        <Alerta tipo="exito">Configuración guardada. Recalcula el análisis para aplicar los cambios.</Alerta>
      )}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" cargando={guardar.isPending} disabled={!isDirty}>
          Guardar cambios
        </Boton>
        <Boton variante="secundario" onClick={() => reset(aFormulario(configuracion))} disabled={!isDirty}>
          Descartar
        </Boton>
      </div>
    </form>
  );
}

export default function PaginaAdminConfiguracion() {
  const configuracion = useQuery({ queryKey: claves.configuracion, queryFn: apiAnalisis.configuracion });
  const recalcular = useMutation({ mutationFn: apiAnalisis.recalcular });

  return (
    <>
      <Tarjeta
        titulo="Parámetros del análisis"
        descripcion={
          configuracion.data ? `Última actualización: ${formatearFechaHora(configuracion.data.fechaActualizacion)}` : undefined
        }
      >
        <ContenidoConsulta consulta={configuracion}>
          {(c) => <FormularioConfiguracion configuracion={c} />}
        </ContenidoConsulta>
      </Tarjeta>
      <Tarjeta titulo="Recalcular" descripcion="Vuelve a calcular Mc, Gutenberg-Richter, tendencias, probabilidades y advertencias de todas las zonas.">
        <div className="space-y-3">
          <Boton onClick={() => recalcular.mutate()} cargando={recalcular.isPending}>
            Recalcular ahora
          </Boton>
          {recalcular.isError && <Alerta tipo="error">{mensajeDeError(recalcular.error)}</Alerta>}
          {recalcular.data && <Alerta tipo="exito">{recalcular.data.mensaje}</Alerta>}
        </div>
      </Tarjeta>
    </>
  );
}
