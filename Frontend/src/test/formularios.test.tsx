import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfiguracionAnalisis, CuerpoConfiguracion, Usuario } from '@/api/tipos';
import { guardarSesion } from '@/auth/almacenSesion';
import { URL_API } from '@/config';
import { FormularioConfiguracion } from '@/paginas/admin/Configuracion';
import { PaginaLogin } from '@/paginas/Login';
import { crearClientePrueba, renderConProveedores } from './utilidades';

const servidor = setupServer();
beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => servidor.resetHandlers());
afterAll(() => servidor.close());

const CONFIGURACION: ConfiguracionAnalisis = {
  idConfig: 1,
  ventanaDias: 30,
  periodoBaseMeses: 36,
  umbralElevada: 0.05,
  umbralAlta: 0.01,
  minEventosZona: 50,
  fechaActualizacion: '2026-10-04T15:45:00.000Z',
};

describe('formulario de configuración del análisis', () => {
  beforeEach(() => {
    const admin: Usuario = { idUsuario: 1, nombre: 'Admin', correo: 'a@b.co', rol: 'ADMIN', activo: true, fechaCreacion: '2026-10-01T00:00:00Z' };
    guardarSesion({ token: 't', expiraEn: new Date(Date.now() + 3_600_000).toISOString(), usuario: admin });
  });

  function renderizar() {
    return render(
      <QueryClientProvider client={crearClientePrueba()}>
        <FormularioConfiguracion configuracion={CONFIGURACION} />
      </QueryClientProvider>,
    );
  }

  it('valida que el umbral de actividad alta sea menor que el de elevada', async () => {
    const usuario = userEvent.setup();
    renderizar();
    const alta = screen.getByLabelText('Umbral de actividad alta (p-valor)');
    await usuario.clear(alta);
    await usuario.type(alta, '0.2');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Debe ser menor que el umbral de actividad elevada')).toBeInTheDocument();
    expect(alta).toHaveAttribute('aria-invalid', 'true');
  });

  it('valida rangos y enteros del contrato', async () => {
    const usuario = userEvent.setup();
    renderizar();
    const ventana = screen.getByLabelText('Ventana de observación (días)');
    await usuario.clear(ventana);
    await usuario.type(ventana, '120');
    const minimo = screen.getByLabelText('Mínimo de eventos por zona');
    await usuario.clear(minimo);
    await usuario.type(minimo, '5');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Debe estar entre 1 y 90 días')).toBeInTheDocument();
    expect(screen.getByText('Debe estar entre 10 y 1000 eventos')).toBeInTheDocument();
  });

  it('envía los valores numéricos con PUT y muestra la confirmación', async () => {
    let cuerpo: CuerpoConfiguracion | null = null;
    servidor.use(
      http.put(`${URL_API}/api/analisis/configuracion`, async ({ request }) => {
        cuerpo = (await request.json()) as CuerpoConfiguracion;
        return HttpResponse.json({ ...CONFIGURACION, ...cuerpo, fechaActualizacion: new Date().toISOString() });
      }),
    );
    const usuario = userEvent.setup();
    renderizar();
    const ventana = screen.getByLabelText('Ventana de observación (días)');
    await usuario.clear(ventana);
    await usuario.type(ventana, '14');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/Configuración guardada/)).toBeInTheDocument();
    expect(cuerpo).toEqual({ ventanaDias: 14, periodoBaseMeses: 36, umbralElevada: 0.05, umbralAlta: 0.01, minEventosZona: 50 });
  });

  it('muestra en el campo los detalles de error que devuelve la API', async () => {
    servidor.use(
      http.put(`${URL_API}/api/analisis/configuracion`, () =>
        HttpResponse.json(
          { error: 'La configuración no es válida.', detalles: [{ campo: 'periodoBaseMeses', mensaje: 'Debe cubrir al menos la ventana' }] },
          { status: 400 },
        ),
      ),
    );
    const usuario = userEvent.setup();
    renderizar();
    const periodo = screen.getByLabelText('Periodo base (meses)');
    await usuario.clear(periodo);
    await usuario.type(periodo, '1');
    await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Debe cubrir al menos la ventana')).toBeInTheDocument();
  });
});

describe('formulario de inicio de sesión', () => {
  it('valida correo y longitud mínima de la contraseña', async () => {
    const usuario = userEvent.setup();
    renderConProveedores(<PaginaLogin />, { ruta: '/login' });
    await usuario.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await usuario.type(screen.getByLabelText('Contraseña'), 'corta');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Escribe un correo válido')).toBeInTheDocument();
    expect(screen.getByText('La contraseña tiene al menos 10 caracteres')).toBeInTheDocument();
  });

  it('muestra el error de credenciales que devuelve la API', async () => {
    servidor.use(http.post(`${URL_API}/api/auth/login`, () => HttpResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 })));
    const usuario = userEvent.setup();
    renderConProveedores(<PaginaLogin />, { ruta: '/login' });
    await usuario.type(screen.getByLabelText('Correo'), 'nadie@sismocol.local');
    await usuario.type(screen.getByLabelText('Contraseña'), 'una-clave-larga-1');
    await usuario.click(screen.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.'));
  });
});
