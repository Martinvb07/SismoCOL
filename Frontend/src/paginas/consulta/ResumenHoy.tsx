import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ComponentType, CSSProperties, ReactNode, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { apiAmenaza, apiAnalisis, apiReplicas, claves } from '@/api/endpoints';
import { IconoAlerta, IconoAmenaza, IconoPronostico, IconoReplicas } from '@/componentes/ui/Iconos';
import { RUTAS } from '@/componentes/layout/navegacion';
import { formatearFechaLarga, formatearMagnitud, formatearNumero } from '@/lib/formato';
import { rutaReplicas } from '@/lib/replicas';
import { mesLargo, porcentajeSimple, unirLista, zonasMasAmenazadas } from '@/lib/resumenes';

/** Zona con la serie de todo el país (Analytics/sismocol/pronostico.py, ZONA_NACIONAL). */
const ZONA_NACIONAL = 'Colombia';

interface PropsTarjeta<T> {
  /** Posición (para la entrada en cascada). */
  indice: number;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
  /** Color de acento de la tarjeta. */
  acento: string;
  titulo: string;
  enlace: string;
  textoEnlace: string;
  consulta: UseQueryResult<T>;
  sinDatos: string;
  children: (datos: T) => { valor: ReactNode; texto: ReactNode } | null;
}

function TarjetaHoy<T>({ indice, icono: Icono, acento, titulo, enlace, textoEnlace, consulta, sinDatos, children }: PropsTarjeta<T>) {
  const contenido = consulta.data !== undefined ? children(consulta.data) : null;
  return (
    <Link
      to={enlace}
      className="tarjeta-hoy group focus:outline-none focus-visible:ring-2 focus-visible:ring-primario"
      style={{ '--i': indice, '--acento': acento } as CSSProperties}
    >
      <div>
        <div className="flex items-center gap-3">
          <span className="tarjeta-hoy-icono" aria-hidden="true">
            <Icono className="h-5 w-5" />
          </span>
          <h3 className="text-xs font-bold uppercase tracking-wide text-tinta-tenue">{titulo}</h3>
        </div>
        {consulta.isPending ? (
          <div className="mt-3 space-y-2" role="status" aria-label="Cargando">
            <div className="esqueleto h-7 w-1/2" />
            <div className="esqueleto h-3 w-full" />
            <div className="esqueleto h-3 w-4/5" />
          </div>
        ) : contenido ? (
          <>
            <p className="mt-3 text-2xl font-extrabold tracking-tight text-tinta">{contenido.valor}</p>
            <p className="mt-1 text-sm leading-relaxed text-tinta-secundaria">{contenido.texto}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-tinta-tenue">{sinDatos}</p>
        )}
      </div>
      <span className="text-sm font-semibold text-primario">
        {textoEnlace} <span className="tarjeta-hoy-flecha inline-block">→</span>
      </span>
    </Link>
  );
}

/** «¿Qué dice SismoCol hoy?»: cuatro resúmenes en palabras simples con enlace a su vista. */
export function ResumenHoy() {
  const advertencias = useQuery({ queryKey: [...claves.advertencias, ''], queryFn: () => apiAnalisis.advertencias({}) });
  const principales = useQuery({ queryKey: claves.replicas, queryFn: apiReplicas.principales });
  const periodos = useQuery({ queryKey: claves.periodosRetorno, queryFn: apiAmenaza.periodosRetorno, retry: false });
  const nacional = useQuery({ queryKey: claves.pronostico(ZONA_NACIONAL), queryFn: () => apiAnalisis.pronostico(ZONA_NACIONAL), retry: false });

  return (
    <section aria-labelledby="titulo-hoy" className="space-y-3">
      <h2 id="titulo-hoy" className="text-lg font-semibold text-tinta">
        ¿Qué dice SismoCol hoy?
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaHoy
          indice={0}
          icono={IconoAlerta}
          acento="#e2b007"
          titulo="Zonas con más sismos de lo normal"
          enlace={RUTAS.analisis}
          textoEnlace="Ver advertencias"
          consulta={advertencias}
          sinDatos="Todavía no hay análisis de actividad."
        >
          {(a) => {
            const activas = a.datos.filter((d) => d.nivel !== 'NORMAL');
            return {
              valor: activas.length === 0 ? 'Ninguna' : `${activas.length} ${activas.length === 1 ? 'zona' : 'zonas'}`,
              texto:
                activas.length === 0
                  ? `Ninguna zona tiene más sismos de lo normal (datos hasta el ${formatearFechaLarga(a.fechaCorte)}).`
                  : `${unirLista(activas.slice(0, 3).map((d) => d.zona))}${activas.length > 3 ? ' y otras' : ''}, con datos hasta el ${formatearFechaLarga(a.fechaCorte)}.`,
            };
          }}
        </TarjetaHoy>

        <TarjetaHoy
          indice={1}
          icono={IconoReplicas}
          acento="#d23c3c"
          titulo="Último sismo fuerte"
          enlace={principales.data?.[0] ? rutaReplicas(principales.data[0].idSismo) : RUTAS.replicas}
          textoEnlace="Ver sus réplicas"
          consulta={principales}
          sinDatos="No hay sismos de magnitud 6 o más recientes."
        >
          {(lista) => {
            const s = lista[0];
            if (!s) return null;
            const lugar = s.municipio ? `cerca de ${s.municipio} (${s.departamento ?? ''})` : 'fuera de un municipio';
            return {
              valor: formatearMagnitud(s.magnitud),
              texto: `El ${formatearFechaLarga(s.fechaHora)}, ${lugar}. Probabilidad de al menos una réplica de magnitud 4 o más en 7 días: ${porcentajeSimple(s.probabilidad7dM4)}.`,
            };
          }}
        </TarjetaHoy>

        <TarjetaHoy
          indice={2}
          icono={IconoAmenaza}
          acento="#e7792b"
          titulo="Zona con más probabilidad de un sismo fuerte"
          enlace={`${RUTAS.analisis}?pestana=amenaza`}
          textoEnlace="Ver amenaza"
          consulta={periodos}
          sinDatos="Todavía no hay cálculo de amenaza."
        >
          {(p) => {
            const top = zonasMasAmenazadas(p.zonas, 1)[0];
            if (!top) return null;
            return {
              valor: top.nombre,
              texto: `${porcentajeSimple(top.probabilidad)} de probabilidad de al menos un sismo de magnitud 6 o más en los próximos 10 años.`,
            };
          }}
        </TarjetaHoy>

        <TarjetaHoy
          indice={3}
          icono={IconoPronostico}
          acento="rgb(var(--c-primario))"
          titulo="Sismos esperados en todo el país"
          enlace={`${RUTAS.analisis}?pestana=pronostico`}
          textoEnlace="Ver pronóstico"
          consulta={nacional}
          sinDatos="Todavía no hay pronóstico nacional: se calcula con el próximo recálculo del análisis."
        >
          {(p) => {
            const mes = p.pronostico[0];
            if (!mes) return null;
            return {
              valor: `Unos ${formatearNumero(Math.round(mes.valor))}`,
              texto: `sismos de magnitud ${formatearNumero(p.mc, 1)} o mayor en ${mesLargo(mes.mes)}, el primer mes sin datos (lo más probable, entre ${formatearNumero(Math.round(mes.inferior80))} y ${formatearNumero(Math.round(mes.superior80))}).`,
            };
          }}
        </TarjetaHoy>
      </div>
    </section>
  );
}
