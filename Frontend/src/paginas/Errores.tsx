import { Link } from 'react-router-dom';
import { RUTAS } from '@/componentes/layout/navegacion';
import { Tarjeta } from '@/componentes/ui/Basicos';

function Mensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Tarjeta titulo={titulo}>
      <p className="text-sm text-tinta-secundaria">{texto}</p>
      <Link to={RUTAS.consulta} className="mt-3 inline-block text-sm font-medium text-primario-oscuro underline">
        Ir a la consulta de sismos
      </Link>
    </Tarjeta>
  );
}

export function PaginaNoEncontrada() {
  return <Mensaje titulo="Página no encontrada" texto="La dirección que buscas no existe." />;
}

export function PaginaSinPermiso() {
  return <Mensaje titulo="Sin permiso" texto="Tu rol no tiene acceso a esta sección. Si crees que es un error, contacta a un administrador." />;
}
