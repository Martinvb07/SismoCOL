import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { mensajeDeError } from '@/api/cliente';
import { apiAdmin, claves } from '@/api/endpoints';
import type { Usuario } from '@/api/tipos';
import { useSesion } from '@/auth/sesion';
import { Alerta, Boton, Insignia, Tarjeta } from '@/componentes/ui/Basicos';
import { ContenidoConsulta, EstadoVacio } from '@/componentes/ui/Estados';
import { Modal } from '@/componentes/ui/Modal';
import { Paginacion } from '@/componentes/ui/Paginacion';
import { TAMANO_PAGINA_POR_DEFECTO } from '@/config';
import { ETIQUETAS_ROL } from '@/lib/etiquetas';
import { formatearFecha } from '@/lib/formato';
import { FormularioContrasena, FormularioCrearUsuario, FormularioEditarUsuario } from './usuarios/Formularios';

type Dialogo = { tipo: 'crear' } | { tipo: 'editar'; usuario: Usuario } | { tipo: 'contrasena'; usuario: Usuario } | null;

export default function PaginaAdminUsuarios() {
  const { usuario: actual } = useSesion();
  const clienteConsultas = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const paginacion = { pagina, tamano: TAMANO_PAGINA_POR_DEFECTO };

  const usuarios = useQuery({
    queryKey: claves.usuarios(paginacion),
    queryFn: () => apiAdmin.usuarios(paginacion),
    placeholderData: keepPreviousData,
  });

  const cambiarEstado = useMutation({
    mutationFn: (u: Usuario) => apiAdmin.editarUsuario(u.idUsuario, { activo: !u.activo }),
    onSuccess: (u) => {
      setMensaje(`${u.nombre} quedó ${u.activo ? 'activo' : 'inactivo'}.`);
      void clienteConsultas.invalidateQueries({ queryKey: ['usuarios'] });
      void clienteConsultas.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const cerrar = () => setDialogo(null);
  const terminar = (texto: string) => () => {
    setMensaje(texto);
    cerrar();
  };

  return (
    <Tarjeta
      titulo="Usuarios"
      acciones={
        <Boton
          onClick={() => {
            setMensaje(null);
            setDialogo({ tipo: 'crear' });
          }}
        >
          Nuevo usuario
        </Boton>
      }
    >
      <div className="mb-3 space-y-2" aria-live="polite">
        {mensaje && <Alerta tipo="exito">{mensaje}</Alerta>}
        {cambiarEstado.isError && <Alerta tipo="error">{mensajeDeError(cambiarEstado.error)}</Alerta>}
      </div>

      <ContenidoConsulta consulta={usuarios} esVacio={(d) => d.total === 0} vacio={<EstadoVacio titulo="No hay usuarios" />}>
        {(d) => (
          <>
            <div className="overflow-x-auto">
              <table className="tabla min-w-[52rem]">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Correo</th>
                    <th scope="col">Rol</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Creado</th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.datos.map((u) => {
                    const esPropio = u.idUsuario === actual?.idUsuario;
                    return (
                      <tr key={u.idUsuario}>
                        <td className="font-medium">
                          {u.nombre} {esPropio && <Insignia>Tú</Insignia>}
                        </td>
                        <td>{u.correo}</td>
                        <td>
                          <Insignia tono={u.rol === 'ADMIN' ? 'marca' : 'neutro'}>{ETIQUETAS_ROL[u.rol]}</Insignia>
                        </td>
                        <td>{u.activo ? 'Activo' : <span className="text-tinta-tenue">Inactivo</span>}</td>
                        <td className="whitespace-nowrap">{formatearFecha(u.fechaCreacion)}</td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Boton variante="fantasma" tamano="sm" onClick={() => setDialogo({ tipo: 'editar', usuario: u })} aria-label={`Editar a ${u.nombre}`}>
                              Editar
                            </Boton>
                            <Boton
                              variante="fantasma"
                              tamano="sm"
                              onClick={() => setDialogo({ tipo: 'contrasena', usuario: u })}
                              aria-label={`Cambiar la contraseña de ${u.nombre}`}
                            >
                              Contraseña
                            </Boton>
                            <Boton
                              variante={u.activo ? 'secundario' : 'primario'}
                              tamano="sm"
                              disabled={esPropio || cambiarEstado.isPending}
                              title={esPropio ? 'No puedes desactivarte a ti mismo' : undefined}
                              cargando={cambiarEstado.isPending && cambiarEstado.variables.idUsuario === u.idUsuario}
                              onClick={() => {
                                setMensaje(null);
                                cambiarEstado.mutate(u);
                              }}
                            >
                              {u.activo ? 'Desactivar' : 'Activar'}
                            </Boton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={d.pagina} tamano={d.tamano} total={d.total} alCambiar={setPagina} cargando={usuarios.isFetching} />
          </>
        )}
      </ContenidoConsulta>

      <Modal abierto={dialogo?.tipo === 'crear'} titulo="Nuevo usuario" alCerrar={cerrar}>
        <FormularioCrearUsuario alTerminar={terminar('Usuario creado.')} alCancelar={cerrar} />
      </Modal>
      <Modal abierto={dialogo?.tipo === 'editar'} titulo="Editar usuario" alCerrar={cerrar}>
        {dialogo?.tipo === 'editar' && (
          <FormularioEditarUsuario
            usuario={dialogo.usuario}
            esPropio={dialogo.usuario.idUsuario === actual?.idUsuario}
            alTerminar={terminar('Usuario actualizado.')}
            alCancelar={cerrar}
          />
        )}
      </Modal>
      <Modal abierto={dialogo?.tipo === 'contrasena'} titulo="Cambiar contraseña" alCerrar={cerrar}>
        {dialogo?.tipo === 'contrasena' && (
          <FormularioContrasena usuario={dialogo.usuario} alTerminar={terminar('Contraseña actualizada.')} alCancelar={cerrar} />
        )}
      </Modal>
    </Tarjeta>
  );
}
