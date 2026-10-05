/**
 * Prueba de humo: con los mocks de MSW se inicia sesión y se recorren las pantallas.
 * Verifica que cada vista renderiza sus secciones principales sin errores.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Rutas } from '@/App';
import { AVISO_ALCANCE } from '@/config';
import { handlers } from '@/mocks/handlers';
import { handlerGeojson, renderConProveedores } from './utilidades';

const servidor = setupServer(...handlers, handlerGeojson);
beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

const ESPERA = { timeout: 15000 };
const CONTRASENA = 'clave-de-prueba-123';

async function iniciarSesion(correo: string) {
  const usuario = userEvent.setup();
  renderConProveedores(<Rutas />, { ruta: '/login' });
  await usuario.type(screen.getByLabelText('Correo'), correo);
  await usuario.type(screen.getByLabelText('Contraseña'), CONTRASENA);
  await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
  await screen.findByRole('heading', { level: 1, name: 'Consulta de sismos' }, ESPERA);
  return usuario;
}

async function irA(usuario: ReturnType<typeof userEvent.setup>, enlace: string) {
  const menu = screen.getByRole('complementary', { name: 'Menú principal' });
  await usuario.click(within(menu).getByRole('link', { name: enlace }));
  await screen.findByRole('heading', { level: 1, name: enlace }, ESPERA);
}

describe('pantallas con datos simulados', () => {
  it('USUARIO: consulta, análisis, predicción y simulación; sin administración', async () => {
    const usuario = await iniciarSesion('usuario@sismocol.local');
    expect(screen.getByText('Usuario', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();

    // Consulta
    expect(await screen.findByRole('heading', { name: 'Mapa de sismos' }, ESPERA)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Distribución de magnitudes' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Exportar CSV/ }, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /Sismos registrados/ }, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Mapa de Colombia con/ }, ESPERA)).toBeInTheDocument();

    // Análisis
    await irA(usuario, 'Análisis y advertencias');
    expect(screen.getAllByText(AVISO_ALCANCE).length).toBeGreaterThan(0);
    expect(await screen.findByText('τ de Kendall', {}, ESPERA)).toBeInTheDocument();
    expect(await screen.findByText(/log₁₀ N =/, {}, ESPERA)).toBeInTheDocument();
    expect((await screen.findAllByText(/Datos hasta/, {}, ESPERA)).length).toBeGreaterThan(0);
    expect(await screen.findByText('Nido de Bucaramanga', { selector: 'td' }, ESPERA)).toBeInTheDocument();

    // Predicción
    await irA(usuario, 'Predicción de impacto');
    await usuario.click(screen.getByRole('button', { name: 'Estimar impacto' }));
    expect(await screen.findByText('Nivel de impacto estimado', {}, ESPERA)).toBeInTheDocument();
    expect(screen.getByText(/Modelo v1\.1\.0/)).toBeInTheDocument();

    // Simulación
    await irA(usuario, 'Simulación');
    expect(await screen.findByText('En línea', {}, ESPERA)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Magnitud' })).toHaveAttribute('step', '0.1');

    // Ruta de administración bloqueada
    expect(screen.queryByRole('link', { name: 'Panel' })).not.toBeInTheDocument();
  }, 60_000);

  it('ADMIN: ve y abre las pantallas de administración', async () => {
    const usuario = await iniciarSesion('admin@sismocol.local');
    expect(screen.getByText('Administrador', { selector: 'span' })).toBeInTheDocument();

    await irA(usuario, 'Panel');
    expect(await screen.findByText('Modelo activo', {}, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Historial de cargas' }, ESPERA)).toBeInTheDocument();

    await irA(usuario, 'Datos y modelo');
    expect(screen.getByRole('button', { name: /Sincronizar ahora/ })).toBeInTheDocument();
    expect(await screen.findByText('v1.1.0', {}, ESPERA)).toBeInTheDocument();

    await irA(usuario, 'Configuración del análisis');
    expect(await screen.findByLabelText('Ventana de observación (días)', {}, ESPERA)).toHaveValue(30);

    await irA(usuario, 'Usuarios');
    expect(await screen.findByText('usuario@sismocol.local', {}, ESPERA)).toBeInTheDocument();
  }, 60_000);
});
