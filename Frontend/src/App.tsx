import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { esErrorApi } from './api/cliente';
import { ProveedorSesion, useSesion } from './auth/ContextoSesion';
import { RutaProtegida } from './auth/RutaProtegida';
import { Layout } from './componentes/layout/Layout';
import { RUTAS } from './componentes/layout/navegacion';
import { EstadoCargando } from './componentes/ui/Estados';
import { TIEMPO_FRESCO_CONSULTAS_MS } from './config';
import { PaginaLogin } from './paginas/Login';
import { PaginaNoEncontrada, PaginaSinPermiso } from './paginas/Errores';

const PaginaConsulta = lazy(() => import('./paginas/Consulta'));
const PaginaAnalisis = lazy(() => import('./paginas/Analisis'));
const PaginaPrediccion = lazy(() => import('./paginas/Prediccion'));
const PaginaSimulacion = lazy(() => import('./paginas/Simulacion'));
const PaginaAdminPanel = lazy(() => import('./paginas/admin/Panel'));
const PaginaAdminDatos = lazy(() => import('./paginas/admin/DatosModelo'));
const PaginaAdminConfiguracion = lazy(() => import('./paginas/admin/Configuracion'));
const PaginaAdminUsuarios = lazy(() => import('./paginas/admin/Usuarios'));

const MAX_REINTENTOS = 2;
const ESTADOS_SIN_REINTENTO = new Set([400, 401, 403, 404, 409, 422]);

export function crearClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: TIEMPO_FRESCO_CONSULTAS_MS,
        refetchOnWindowFocus: false,
        retry: (intentos, error) => !(esErrorApi(error) && ESTADOS_SIN_REINTENTO.has(error.estado)) && intentos < MAX_REINTENTOS,
      },
      mutations: { retry: false },
    },
  });
}

function Inicio() {
  const { autenticado } = useSesion();
  return <Navigate to={autenticado ? RUTAS.consulta : '/login'} replace />;
}

export function Rutas() {
  return (
    <Suspense fallback={<EstadoCargando texto="Cargando vista…" alto="h-screen" />}>
      <Routes>
        <Route path="/login" element={<PaginaLogin />} />
        <Route path="/" element={<Inicio />} />
        <Route element={<RutaProtegida />}>
          <Route element={<Layout />}>
            <Route path={RUTAS.consulta} element={<PaginaConsulta />} />
            <Route path={RUTAS.analisis} element={<PaginaAnalisis />} />
            <Route path={RUTAS.prediccion} element={<PaginaPrediccion />} />
            <Route path={RUTAS.simulacion} element={<PaginaSimulacion />} />
            <Route path="/sin-permiso" element={<PaginaSinPermiso />} />
            <Route element={<RutaProtegida roles={['ADMIN']} />}>
              <Route path={RUTAS.adminPanel} element={<PaginaAdminPanel />} />
              <Route path={RUTAS.adminDatos} element={<PaginaAdminDatos />} />
              <Route path={RUTAS.adminConfiguracion} element={<PaginaAdminConfiguracion />} />
              <Route path={RUTAS.adminUsuarios} element={<PaginaAdminUsuarios />} />
            </Route>
            <Route path="*" element={<PaginaNoEncontrada />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

const clienteConsultas = crearClienteConsultas();

export function App() {
  return (
    <QueryClientProvider client={clienteConsultas}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProveedorSesion>
          <Rutas />
        </ProveedorSesion>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
