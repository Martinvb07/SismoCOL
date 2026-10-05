import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '@/api/cliente';
import { useSesion, type EstadoNavegacionLogin } from '@/auth/ContextoSesion';
import { RUTAS } from '@/componentes/layout/navegacion';
import { Alerta, Boton } from '@/componentes/ui/Basicos';
import { Campo, Entrada } from '@/componentes/ui/Formulario';
import { USAR_MOCKS } from '@/config';
import { esquemaLogin, type DatosLogin } from '@/lib/esquemas';

export function PaginaLogin() {
  const { autenticado, iniciarSesion } = useSesion();
  const navegar = useNavigate();
  const estado = (useLocation().state ?? {}) as EstadoNavegacionLogin;
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosLogin>({ resolver: zodResolver(esquemaLogin), defaultValues: { correo: '', contrasena: '' } });

  if (autenticado) return <Navigate to={estado.desde ?? RUTAS.consulta} replace />;

  const enviar = handleSubmit(async (datos) => {
    setErrorEnvio(null);
    try {
      await iniciarSesion(datos);
      navegar(estado.desde ?? RUTAS.consulta, { replace: true });
    } catch (error) {
      setErrorEnvio(mensajeDeError(error));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-lateral px-4 py-10">
      <main className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <p className="text-3xl font-bold tracking-tight">SismoCol</p>
          <p className="mt-1 text-sm text-white/80">Análisis y predicción de actividad sísmica en Colombia</p>
        </div>
        <section className="rounded-lg bg-white p-6 shadow-xl" aria-labelledby="titulo-login">
          <h1 id="titulo-login" className="mb-4 text-xl font-semibold text-tinta">
            Iniciar sesión
          </h1>
          {estado.motivo === 'expirada' && (
            <div className="mb-4">
              <Alerta tipo="aviso">Tu sesión expiró. Inicia sesión de nuevo.</Alerta>
            </div>
          )}
          <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
            <Campo etiqueta="Correo" error={errors.correo?.message}>
              {(p) => <Entrada {...p} type="email" autoComplete="username" {...register('correo')} />}
            </Campo>
            <Campo etiqueta="Contraseña" error={errors.contrasena?.message}>
              {(p) => <Entrada {...p} type="password" autoComplete="current-password" {...register('contrasena')} />}
            </Campo>
            {errorEnvio && <Alerta tipo="error">{errorEnvio}</Alerta>}
            <Boton type="submit" cargando={isSubmitting} className="w-full">
              Ingresar
            </Boton>
          </form>
          {USAR_MOCKS && (
            <div className="mt-4">
              <Alerta tipo="info" titulo="Modo de datos simulados">
                <p>
                  Usa <strong>admin@sismocol.local</strong> (administrador) o <strong>usuario@sismocol.local</strong> con cualquier
                  contraseña de 10 o más caracteres.
                </p>
              </Alerta>
            </div>
          )}
        </section>
        <p className="mt-6 text-center text-xs text-white/70">
          Universidad Cooperativa de Colombia · Analítica de Datos
        </p>
      </main>
    </div>
  );
}
