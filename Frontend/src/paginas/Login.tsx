import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '@/api/cliente';
import { useSesion, type EstadoNavegacionLogin } from '@/auth/sesion';
import { RUTAS } from '@/componentes/layout/navegacion';
import { Alerta, Boton } from '@/componentes/ui/Basicos';
import { Campo, Entrada } from '@/componentes/ui/Formulario';
import { Logo } from '@/componentes/ui/Marca';
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
    <div className="login-fondo">
      <div className="login-ondas" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <svg className="login-sismografo" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0 80h260l14-10 10 22 12-50 14 86 12-70 10 40 10-18h120l8-6 8 12 8-30 10 52 8-38 8 20h220l12-14 10 30 14-62 12 96 12-80 10 46 10-16h290"
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <main className="relative w-full max-w-md animate-entrada">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo tamano={60} />
          <p className="mt-4 text-3xl font-extrabold tracking-tight text-tinta">
            Sismo<span className="text-primario">Col</span>
          </p>
          <p className="mt-1 text-sm text-tinta-tenue">Análisis y predicción de actividad sísmica en Colombia</p>
        </div>
        <section
          className="rounded-3xl border border-borde bg-superficie/85 p-6 shadow-elevada backdrop-blur-xl sm:p-8"
          aria-labelledby="titulo-login"
        >
          <h1 id="titulo-login" className="text-xl font-bold text-tinta">
            Iniciar sesión
          </h1>
          <p className="mb-5 mt-1 text-sm text-tinta-tenue">Ingresa con tu cuenta institucional.</p>
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
        <p className="mt-6 text-center text-xs text-tinta-tenue">Universidad Cooperativa de Colombia · Analítica de Datos</p>
      </main>
    </div>
  );
}
