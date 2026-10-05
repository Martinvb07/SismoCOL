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
  { ruta: RUTAS.consulta, titulo: 'Consulta de sismos', icono: IconoMapa, roles: TODOS, seccion: 'principal' },
  { ruta: RUTAS.analisis, titulo: 'Análisis y advertencias', icono: IconoGrafica, roles: TODOS, seccion: 'principal' },
  { ruta: RUTAS.prediccion, titulo: 'Predicción de impacto', icono: IconoObjetivo, roles: TODOS, seccion: 'principal' },
  { ruta: RUTAS.simulacion, titulo: 'Simulación', icono: IconoChip, roles: TODOS, seccion: 'principal' },
  { ruta: RUTAS.adminPanel, titulo: 'Panel', icono: IconoPanel, roles: SOLO_ADMIN, seccion: 'administracion' },
  { ruta: RUTAS.adminDatos, titulo: 'Datos y modelo', icono: IconoBaseDatos, roles: SOLO_ADMIN, seccion: 'administracion' },
  {
    ruta: RUTAS.adminConfiguracion,
    titulo: 'Configuración del análisis',
    icono: IconoAjustes,
    roles: SOLO_ADMIN,
    seccion: 'administracion',
  },
  { ruta: RUTAS.adminUsuarios, titulo: 'Usuarios', icono: IconoUsuarios, roles: SOLO_ADMIN, seccion: 'administracion' },
];

export function tituloDeRuta(ruta: string): string {
  return ITEMS_NAVEGACION.find((item) => item.ruta === ruta)?.titulo ?? 'SismoCol';
}
