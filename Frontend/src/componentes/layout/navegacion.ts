import type { ComponentType, SVGProps } from 'react';
import type { Rol } from '@/api/tipos';
import {
  IconoAjustes,
  IconoBaseDatos,
  IconoChip,
  IconoGrafica,
  IconoMapa,
  IconoObjetivo,
  IconoPanel,
  IconoUsuarios,
} from '@/componentes/ui/Iconos';

export interface ItemNavegacion {
  ruta: string;
  titulo: string;
  /** Subtítulo de la barra superior. */
  descripcion: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
  roles: readonly Rol[];
  seccion: 'principal' | 'administracion';
}

const TODOS: readonly Rol[] = ['ADMIN', 'USUARIO'];
const SOLO_ADMIN: readonly Rol[] = ['ADMIN'];

export const RUTAS = {
  consulta: '/consulta',
  analisis: '/analisis',
  prediccion: '/prediccion',
  simulacion: '/simulacion',
  adminPanel: '/admin',
  adminDatos: '/admin/datos',
  adminConfiguracion: '/admin/configuracion',
  adminUsuarios: '/admin/usuarios',
} as const;

export const ITEMS_NAVEGACION: readonly ItemNavegacion[] = [
  {
    ruta: RUTAS.consulta,
    titulo: 'Consulta de sismos',
    descripcion: 'Filtra el catálogo, míralo en el mapa y descárgalo en CSV',
    icono: IconoMapa,
    roles: TODOS,
    seccion: 'principal',
  },
  {
    ruta: RUTAS.analisis,
    titulo: 'Análisis y advertencias',
    descripcion: 'Frecuencia por zona, Gutenberg-Richter, tendencia y advertencias',
    icono: IconoGrafica,
    roles: TODOS,
    seccion: 'principal',
  },
  {
    ruta: RUTAS.prediccion,
    titulo: 'Predicción de impacto',
    descripcion: 'Nivel de impacto estimado de un sismo hipotético',
    icono: IconoObjetivo,
    roles: TODOS,
    seccion: 'principal',
  },
  {
    ruta: RUTAS.simulacion,
    titulo: 'Simulación',
    descripcion: 'Envía una magnitud al prototipo ESP32',
    icono: IconoChip,
    roles: TODOS,
    seccion: 'principal',
  },
  {
    ruta: RUTAS.adminPanel,
    titulo: 'Panel',
    descripcion: 'Resumen de datos, usuarios, modelo y dispositivo',
    icono: IconoPanel,
    roles: SOLO_ADMIN,
    seccion: 'administracion',
  },
  {
    ruta: RUTAS.adminDatos,
    titulo: 'Datos y modelo',
    descripcion: 'Carga de archivos, sincronización y entrenamiento',
    icono: IconoBaseDatos,
    roles: SOLO_ADMIN,
    seccion: 'administracion',
  },
  {
    ruta: RUTAS.adminConfiguracion,
    titulo: 'Configuración del análisis',
    descripcion: 'Ventanas, umbrales y mínimo de eventos por zona',
    icono: IconoAjustes,
    roles: SOLO_ADMIN,
    seccion: 'administracion',
  },
  {
    ruta: RUTAS.adminUsuarios,
    titulo: 'Usuarios',
    descripcion: 'Cuentas, roles y accesos',
    icono: IconoUsuarios,
    roles: SOLO_ADMIN,
    seccion: 'administracion',
  },
];

export function itemDeRuta(ruta: string): ItemNavegacion | undefined {
  return ITEMS_NAVEGACION.find((item) => item.ruta === ruta);
}

export function tituloDeRuta(ruta: string): string {
  return itemDeRuta(ruta)?.titulo ?? 'SismoCol';
}
