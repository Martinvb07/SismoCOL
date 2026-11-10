/**
 * Prueba de humo: con los mocks de MSW se inicia sesión y se recorren las pantallas.
 * Verifica que cada vista renderiza sus secciones principales sin errores.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Rutas } from '@/App';
import { AVISO_ALCANCE, AVISO_PRONOSTICO } from '@/config';
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
  // El título está en la barra superior; la vista termina de cargar después.
  await waitFor(() => expect(screen.queryByText('Cargando vista…')).not.toBeInTheDocument(), ESPERA);
}

describe('pantallas con datos simulados', () => {
  it('USUARIO: consulta, análisis, predicción y simulación; sin administración', async () => {
    const usuario = await iniciarSesion('usuario@sismocol.local');
    expect(screen.getByText('Usuario', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();

    // Consulta: «¿Qué dice SismoCol hoy?» con cuatro tarjetas que enlazan a su vista
    const hoy = await screen.findByRole('region', { name: '¿Qué dice SismoCol hoy?' }, ESPERA);
    expect(within(hoy).getAllByRole('link')).toHaveLength(4);
    expect(await within(hoy).findByText(/Probabilidad de al menos una réplica de magnitud 4 o más en 7 días/, {}, ESPERA)).toBeInTheDocument();
    expect(within(hoy).getByRole('link', { name: /Sismos esperados en todo el país/ })).toHaveAttribute('href', '/analisis?pestana=pronostico');

    expect(await screen.findByRole('heading', { name: 'Mapa de sismos' }, ESPERA)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Distribución de magnitudes' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Exportar CSV/ }, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /Sismos registrados/ }, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Mapa de Colombia con/ }, ESPERA)).toBeInTheDocument();

    // «Ver réplicas» desde la tabla abre Réplicas con ese sismo (?sismo=id)
    await usuario.click(within(screen.getByRole('table', { name: /Sismos registrados/ })).getByRole('button', { name: /Magnitud/ }));
    const verReplicas = await screen.findAllByRole('link', { name: /Ver réplicas del sismo/ }, ESPERA);
    expect(verReplicas.length).toBeGreaterThan(0);
    expect(verReplicas[0]).toHaveAttribute('href', expect.stringMatching(/^\/replicas\?sismo=\d+$/));

    // Análisis
    await irA(usuario, 'Análisis y advertencias');
    expect(screen.getAllByText(AVISO_ALCANCE).length).toBeGreaterThan(0);
    expect(await screen.findByRole('region', { name: 'En palabras simples' }, ESPERA)).toHaveTextContent(/más sismos de lo normal/);
    expect(screen.getByText('Ver detalle técnico')).toBeInTheDocument();
    expect(await screen.findByText('τ de Kendall', {}, ESPERA)).toBeInTheDocument();
    expect(await screen.findByText(/log₁₀ N =/, {}, ESPERA)).toBeInTheDocument();
    expect((await screen.findAllByText(/Datos hasta/, {}, ESPERA)).length).toBeGreaterThan(0);
    expect(await screen.findByText('Nido de Bucaramanga', { selector: 'td' }, ESPERA)).toBeInTheDocument();
    await usuario.click(screen.getByRole('tab', { name: 'Pronóstico' }));
    expect(await screen.findByText(/se esperan unos \d+ sismos de magnitud/, {}, ESPERA)).toBeInTheDocument();
    expect(screen.getByText(/^Actividad esperada:/)).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /backtesting por origen móvil/i }, ESPERA)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /pronóstico de 12 meses/ })).toBeInTheDocument();
    expect(screen.getAllByText(AVISO_PRONOSTICO).length).toBeGreaterThan(0);
    await usuario.click(screen.getByRole('tab', { name: 'Periodo de retorno y amenaza' }));
    expect(await screen.findByText(/se espera en promedio un sismo de magnitud 6 o más/, {}, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /Periodo de retorno y probabilidad/ }, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Mapa de amenaza/ }, ESPERA)).toBeInTheDocument();

    // Pronóstico de réplicas
    await irA(usuario, 'Pronóstico de réplicas');
    expect(screen.getAllByText(AVISO_PRONOSTICO).length).toBeGreaterThan(0);
    expect(await screen.findByText(/En los próximos 7 días, contados desde el/, {}, ESPERA)).toBeInTheDocument();
    expect(screen.getByText(/^Nivel de réplicas:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '¿Qué significa réplicas?' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /Probabilidad de al menos una réplica/ }, ESPERA)).toBeInTheDocument();
    expect((await screen.findAllByRole('img', { name: /Réplicas acumuladas/ }, ESPERA)).length).toBe(2);
    expect(screen.getByText('Modelo ajustado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ejecutar validación/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /M 7,4/ })).toHaveAttribute('aria-pressed', 'true');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));
    const encontrados = await screen.findByRole('table', { name: /Sismos encontrados/ }, ESPERA);
    const botones = within(encontrados).getAllByRole('button', { name: /Ver réplicas/ });
    await usuario.click(botones[0] as HTMLElement);
    expect(await screen.findByText(/Método: /i, {}, ESPERA)).toBeInTheDocument();

    // Predicción
    await irA(usuario, 'Predicción de impacto');
    await usuario.click(screen.getByRole('button', { name: 'Estimar impacto' }));
    expect(await screen.findByText('Nivel de impacto estimado', {}, ESPERA)).toBeInTheDocument();
    expect(screen.getByText(/Modelo v1\.1\.0/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Por qué este nivel/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'En palabras simples' })).toHaveTextContent(/Si ocurriera un sismo de magnitud/);
    expect(screen.getByText(/^Impacto:/)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Simular escenario' }));
    expect(await screen.findByRole('table', { name: /Municipios del escenario/ }, ESPERA)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Mapa del escenario con 12 municipios/ })).toBeInTheDocument();

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
    await usuario.click(screen.getByRole('button', { name: /Sincronizar catálogo histórico/ }));
    expect(await screen.findByText('USGS FDSN histórico M≥4.5 1973-2026', {}, ESPERA)).toBeInTheDocument();
    expect(await screen.findByText('v1.1.0', {}, ESPERA)).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: /Importancia global/ }, ESPERA)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Comparación de modelos/ })).toBeInTheDocument();

    await irA(usuario, 'Configuración del análisis');
    expect(await screen.findByLabelText('Ventana de observación (días)', {}, ESPERA)).toHaveValue(30);

    await irA(usuario, 'Usuarios');
    expect(await screen.findByText('usuario@sismocol.local', {}, ESPERA)).toBeInTheDocument();
  }, 60_000);
});
