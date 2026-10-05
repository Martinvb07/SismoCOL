import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { esErrorApi, mensajeDeError } from '@/api/cliente';
import { apiAdmin } from '@/api/endpoints';
import { ROLES, type Usuario } from '@/api/tipos';
import { Alerta, Boton } from '@/componentes/ui/Basicos';
import { Campo, Entrada, Selector } from '@/componentes/ui/Formulario';
import { aplicarErroresApi } from '@/lib/formularios';
import {
  esquemaCambiarContrasena,
  esquemaCrearUsuario,
  esquemaEditarUsuario,
  LONGITUD_MINIMA_CONTRASENA,
  type DatosCambiarContrasena,
  type DatosCrearUsuario,
  type DatosEditarUsuario,
} from '@/lib/esquemas';
import { ETIQUETAS_ROL } from '@/lib/etiquetas';

const HTTP_CONFLICTO = 409;
const AYUDA_CONTRASENA = `Mínimo ${LONGITUD_MINIMA_CONTRASENA} caracteres, con letras y números.`;

interface PropsFormulario {
  alTerminar: () => void;
  alCancelar: () => void;
}

function useInvalidarUsuarios() {
  const clienteConsultas = useQueryClient();
  return () => {
    void clienteConsultas.invalidateQueries({ queryKey: ['usuarios'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['admin'] });
  };
}

function OpcionesRol() {
  return (
    <>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ETIQUETAS_ROL[r]}
        </option>
      ))}
    </>
  );
}

function Acciones({ cargando, texto, alCancelar }: { cargando: boolean; texto: string; alCancelar: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Boton variante="secundario" onClick={alCancelar}>
        Cancelar
      </Boton>
      <Boton type="submit" cargando={cargando}>
        {texto}
      </Boton>
    </div>
  );
}

export function FormularioCrearUsuario({ alTerminar, alCancelar }: PropsFormulario) {
  const invalidar = useInvalidarUsuarios();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DatosCrearUsuario>({
    resolver: zodResolver(esquemaCrearUsuario),
    defaultValues: { nombre: '', correo: '', contrasena: '', rol: 'USUARIO' },
  });
  const crear = useMutation({
    mutationFn: apiAdmin.crearUsuario,
    onSuccess: () => {
      invalidar();
      alTerminar();
    },
    onError: (error) => {
      const aplicado = aplicarErroresApi(error, setError, ['nombre', 'correo', 'contrasena', 'rol']);
      if (!aplicado && esErrorApi(error) && error.estado === HTTP_CONFLICTO) {
        setError('correo', { message: 'Ya existe un usuario con ese correo' });
      }
    },
  });
  const enviar = handleSubmit((d) => crear.mutate({ ...d, correo: d.correo.toLowerCase() }));

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-3" aria-label="Nuevo usuario">
      <Campo etiqueta="Nombre" error={errors.nombre?.message}>
        {(p) => <Entrada {...p} autoComplete="name" {...register('nombre')} />}
      </Campo>
      <Campo etiqueta="Correo" error={errors.correo?.message}>
        {(p) => <Entrada {...p} type="email" autoComplete="off" {...register('correo')} />}
      </Campo>
      <Campo etiqueta="Contraseña" error={errors.contrasena?.message} ayuda={AYUDA_CONTRASENA}>
        {(p) => <Entrada {...p} type="password" autoComplete="new-password" {...register('contrasena')} />}
      </Campo>
      <Campo etiqueta="Rol" error={errors.rol?.message}>
        {(p) => (
          <Selector {...p} {...register('rol')}>
            <OpcionesRol />
          </Selector>
        )}
      </Campo>
      {crear.isError && !Object.keys(errors).length && <Alerta tipo="error">{mensajeDeError(crear.error)}</Alerta>}
      <Acciones cargando={crear.isPending} texto="Crear usuario" alCancelar={alCancelar} />
    </form>
  );
}

export function FormularioEditarUsuario({ usuario, esPropio, alTerminar, alCancelar }: PropsFormulario & { usuario: Usuario; esPropio: boolean }) {
  const invalidar = useInvalidarUsuarios();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DatosEditarUsuario>({
    resolver: zodResolver(esquemaEditarUsuario),
    defaultValues: { nombre: usuario.nombre, rol: usuario.rol },
  });
  const editar = useMutation({
    mutationFn: (d: DatosEditarUsuario) => apiAdmin.editarUsuario(usuario.idUsuario, d),
    onSuccess: () => {
      invalidar();
      alTerminar();
    },
    onError: (error) => aplicarErroresApi(error, setError, ['nombre', 'rol']),
  });
  const enviar = handleSubmit((d) => editar.mutate(d));

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-3" aria-label="Editar usuario">
      <p className="text-sm text-tinta-secundaria">{usuario.correo}</p>
      <Campo etiqueta="Nombre" error={errors.nombre?.message}>
        {(p) => <Entrada {...p} {...register('nombre')} />}
      </Campo>
      <Campo etiqueta="Rol" error={errors.rol?.message} ayuda={esPropio ? 'No puedes quitarte el rol de administrador.' : undefined}>
        {(p) => (
          <Selector {...p} disabled={esPropio} {...register('rol')}>
            <OpcionesRol />
          </Selector>
        )}
      </Campo>
      {editar.isError && <Alerta tipo="error">{mensajeDeError(editar.error)}</Alerta>}
      <Acciones cargando={editar.isPending} texto="Guardar" alCancelar={alCancelar} />
    </form>
  );
}

export function FormularioContrasena({ usuario, alTerminar, alCancelar }: PropsFormulario & { usuario: Usuario }) {
  const invalidar = useInvalidarUsuarios();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DatosCambiarContrasena>({
    resolver: zodResolver(esquemaCambiarContrasena),
    defaultValues: { contrasena: '', confirmacion: '' },
  });
  const cambiar = useMutation({
    mutationFn: (d: DatosCambiarContrasena) => apiAdmin.editarUsuario(usuario.idUsuario, { contrasena: d.contrasena }),
    onSuccess: () => {
      invalidar();
      alTerminar();
    },
    onError: (error) => aplicarErroresApi(error, setError, ['contrasena']),
  });
  const enviar = handleSubmit((d) => cambiar.mutate(d));

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-3" aria-label="Cambiar contraseña">
      <p className="text-sm text-tinta-secundaria">
        {usuario.nombre} · {usuario.correo}
      </p>
      <Campo etiqueta="Nueva contraseña" error={errors.contrasena?.message} ayuda={AYUDA_CONTRASENA}>
        {(p) => <Entrada {...p} type="password" autoComplete="new-password" {...register('contrasena')} />}
      </Campo>
      <Campo etiqueta="Confirmar contraseña" error={errors.confirmacion?.message}>
        {(p) => <Entrada {...p} type="password" autoComplete="new-password" {...register('confirmacion')} />}
      </Campo>
      {cambiar.isError && <Alerta tipo="error">{mensajeDeError(cambiar.error)}</Alerta>}
      <Acciones cargando={cambiar.isPending} texto="Cambiar contraseña" alCancelar={alCancelar} />
    </form>
  );
}
