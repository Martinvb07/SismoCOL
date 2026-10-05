import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { esErrorApi, mensajeDeError } from '@/api/cliente';
import { apiModelos } from '@/api/endpoints';
import type { RespuestaPrediccion } from '@/api/tipos';
import { Alerta, Boton, Tarjeta } from '@/componentes/ui/Basicos';
import { AvisoAlcance, EstadoVacio } from '@/componentes/ui/Estados';
import { Campo, Entrada } from '@/componentes/ui/Formulario';
import { BarrasProbabilidad } from '@/graficas/BarrasProbabilidad';
import { MapaColombia } from '@/graficas/MapaColombia';
import { estiloNivelImpacto } from '@/lib/escalasColor';
import { aplicarErroresApi, numeroOpcional } from '@/lib/formularios';
import { esquemaPrediccion, LIMITES, type DatosPrediccion } from '@/lib/esquemas';
import { formatearNumero, formatearPorcentaje } from '@/lib/formato';

const CAMPOS = ['magnitud', 'profundidadKm', 'latitud', 'longitud'] as const;
const HTTP_SIN_MODELO = 503;
const ALTO_MAPA = 360;
const PASO_MAGNITUD = 0.1;
const PASO_COORDENADA = 0.0001;

/** Ejemplo inicial: un sismo intermedio en el Nido de Bucaramanga. */
const VALORES_INICIALES: DatosPrediccion = { magnitud: 5.5, profundidadKm: 140, latitud: 6.81, longitud: -73.11 };

function Resultado({ r }: { r: RespuestaPrediccion }) {
  const estilo = estiloNivelImpacto(r.nivelImpacto);
  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4" style={{ borderColor: estilo.borde, backgroundColor: estilo.fondo }}>
        <p className="text-sm text-tinta-secundaria">Nivel de impacto estimado</p>
        <p className="mt-1 text-2xl font-bold" style={{ color: estilo.texto }}>
          {estilo.etiqueta}
        </p>
        <p className="mt-1 text-sm text-tinta-secundaria">
          Probabilidad de la clase: <strong className="tabular-nums">{formatearPorcentaje(r.probabilidad)}</strong>
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-tinta">Probabilidad por clase</h3>
        <BarrasProbabilidad probabilidades={r.probabilidades} seleccionada={r.nivelImpacto} />
      </div>
      <p className="text-xs text-tinta-tenue">
        Modelo {r.modelo.version} · {r.modelo.algoritmo} · predicción n.º {formatearNumero(r.idPrediccion)}
      </p>
    </div>
  );
}

export default function PaginaPrediccion() {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<DatosPrediccion>({ resolver: zodResolver(esquemaPrediccion), defaultValues: VALORES_INICIALES });

  const prediccion = useMutation({
    mutationFn: apiModelos.predecir,
    onError: (error) => aplicarErroresApi(error, setError, CAMPOS),
  });

  const latitud = watch('latitud');
  const longitud = watch('longitud');
  const marcador = Number.isFinite(latitud) && Number.isFinite(longitud) ? { latitud, longitud } : null;

  const enviar = handleSubmit((datos) => prediccion.mutate(datos));
  const numero = { setValueAs: numeroOpcional };

  const errorSinModelo = esErrorApi(prediccion.error) && prediccion.error.estado === HTTP_SIN_MODELO;

  return (
    <>
      <Alerta tipo="aviso" titulo="Estimación exploratoria">
        El nivel de impacto lo estima un modelo de clasificación entrenado con pocos reportes de daño (~420 etiquetables). Es un
        resultado académico orientativo y no sustituye una evaluación de riesgo ni la información oficial.
      </Alerta>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Sismo hipotético" descripcion="Escribe los datos o haz clic en el mapa para elegir el punto">
          <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4" aria-label="Datos del sismo hipotético">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Magnitud"
                error={errors.magnitud?.message}
                ayuda={`Entre ${formatearNumero(LIMITES.magnitudPrediccion.min)} y ${formatearNumero(LIMITES.magnitudPrediccion.max)}`}
              >
                {(p) => (
                  <Entrada
                    {...p}
                    type="number"
                    inputMode="decimal"
                    step={PASO_MAGNITUD}
                    min={LIMITES.magnitudPrediccion.min}
                    max={LIMITES.magnitudPrediccion.max}
                    {...register('magnitud', numero)}
                  />
                )}
              </Campo>
              <Campo
                etiqueta="Profundidad (km)"
                error={errors.profundidadKm?.message}
                ayuda={`Entre ${formatearNumero(LIMITES.profundidad.min)} y ${formatearNumero(LIMITES.profundidad.max)} km`}
              >
                {(p) => (
                  <Entrada {...p} type="number" inputMode="decimal" min={LIMITES.profundidad.min} max={LIMITES.profundidad.max} {...register('profundidadKm', numero)} />
                )}
              </Campo>
              <Campo
                etiqueta="Latitud"
                error={errors.latitud?.message}
                ayuda={`Entre ${formatearNumero(LIMITES.latitud.min, 1)} y ${formatearNumero(LIMITES.latitud.max, 1)}`}
              >
                {(p) => (
                  <Entrada {...p} type="number" inputMode="decimal" step={PASO_COORDENADA} min={LIMITES.latitud.min} max={LIMITES.latitud.max} {...register('latitud', numero)} />
                )}
              </Campo>
              <Campo
                etiqueta="Longitud"
                error={errors.longitud?.message}
                ayuda={`Entre ${formatearNumero(LIMITES.longitud.min, 1)} y ${formatearNumero(LIMITES.longitud.max, 1)}`}
              >
                {(p) => (
                  <Entrada {...p} type="number" inputMode="decimal" step={PASO_COORDENADA} min={LIMITES.longitud.min} max={LIMITES.longitud.max} {...register('longitud', numero)} />
                )}
              </Campo>
            </div>
            <MapaColombia
              alto={ALTO_MAPA}
              mostrarLeyenda={false}
              marcador={marcador}
              etiqueta="Mapa para elegir la ubicación del sismo hipotético"
              alHacerClic={({ latitud: lat, longitud: lon }) => {
                setValue('latitud', lat, { shouldValidate: true });
                setValue('longitud', lon, { shouldValidate: true });
              }}
            />
            <Boton type="submit" cargando={prediccion.isPending}>
              Estimar impacto
            </Boton>
          </form>
        </Tarjeta>

        <Tarjeta titulo="Resultado">
          {prediccion.isError ? (
            <Alerta tipo="error" titulo={errorSinModelo ? 'No hay un modelo activo' : 'No se pudo estimar el impacto'}>
              {errorSinModelo ? 'Un administrador debe entrenar o activar un modelo de impacto.' : mensajeDeError(prediccion.error)}
            </Alerta>
          ) : prediccion.data ? (
            <Resultado r={prediccion.data} />
          ) : (
            <EstadoVacio titulo="Aún no hay estimación">Completa el formulario y pulsa «Estimar impacto».</EstadoVacio>
          )}
        </Tarjeta>
      </div>

      <AvisoAlcance />
    </>
  );
}
