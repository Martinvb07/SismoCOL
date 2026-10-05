import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { guardarSesion, leerSesion } from '@/auth/almacenSesion';
import { URL_API } from '@/config';
import { construirQuery, ErrorApi, peticion, peticionArchivo, registrarManejadorNoAutorizado } from './cliente';
import type { Usuario } from './tipos';

const servidor = setupServer();
const UNA_HORA_MS = 3_600_000;

const usuario: Usuario = {
  idUsuario: 1,
  nombre: 'Admin',
  correo: 'admin@sismocol.local',
  rol: 'ADMIN',
  activo: true,
  fechaCreacion: '2026-10-01T00:00:00.000Z',
};

function iniciarSesionFalsa() {
  guardarSesion({ token: 'token-de-prueba', expiraEn: new Date(Date.now() + UNA_HORA_MS).toISOString(), usuario });
}

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  servidor.resetHandlers();
  registrarManejadorNoAutorizado(null);
});
afterAll(() => servidor.close());

describe('cliente API', () => {
  it('envía el token Bearer y devuelve el JSON tipado', async () => {
    iniciarSesionFalsa();
    let cabecera: string | null = null;
    servidor.use(
      http.get(`${URL_API}/api/auth/yo`, ({ request }) => {
        cabecera = request.headers.get('Authorization');
        return HttpResponse.json(usuario);
      }),
    );
    const respuesta = await peticion<Usuario>('/api/auth/yo');
    expect(respuesta.correo).toBe('admin@sismocol.local');
    expect(cabecera).toBe('Bearer token-de-prueba');
  });

  it('parsea { error, detalles } en un ErrorApi con el código HTTP', async () => {
    iniciarSesionFalsa();
    servidor.use(
      http.post(`${URL_API}/api/predicciones`, () =>
        HttpResponse.json(
          { error: 'Datos inválidos', detalles: [{ campo: 'magnitud', mensaje: 'Debe estar entre 2 y 9' }] },
          { status: 400 },
        ),
      ),
    );
    const promesa = peticion('/api/predicciones', { metodo: 'POST', cuerpo: { magnitud: 1 } });
    await expect(promesa).rejects.toBeInstanceOf(ErrorApi);
    const error = (await promesa.catch((e: unknown) => e)) as ErrorApi;
    expect(error.estado).toBe(400);
    expect(error.message).toBe('Datos inválidos');
    expect(error.detalleDe('magnitud')).toBe('Debe estar entre 2 y 9');
  });

  it('usa un mensaje por defecto cuando el cuerpo del error no es JSON', async () => {
    iniciarSesionFalsa();
    servidor.use(http.get(`${URL_API}/api/modelos`, () => new HttpResponse('Bad gateway', { status: 502 })));
    await expect(peticion('/api/modelos')).rejects.toMatchObject({ estado: 502, message: expect.stringContaining('servicio analítico') as string });
  });

  it('en 401 borra la sesión y llama al manejador de redirección', async () => {
    iniciarSesionFalsa();
    const manejador = vi.fn();
    registrarManejadorNoAutorizado(manejador);
    servidor.use(http.get(`${URL_API}/api/sismos`, () => HttpResponse.json({ error: 'Token vencido' }, { status: 401 })));
    await expect(peticion('/api/sismos')).rejects.toMatchObject({ estado: 401 });
    expect(leerSesion()).toBeNull();
    expect(manejador).toHaveBeenCalledOnce();
  });

  it('un 401 en el login (petición pública) no cierra sesión ni redirige', async () => {
    const manejador = vi.fn();
    registrarManejadorNoAutorizado(manejador);
    let cabecera: string | null = 'sin-leer';
    servidor.use(
      http.post(`${URL_API}/api/auth/login`, ({ request }) => {
        cabecera = request.headers.get('Authorization');
        return HttpResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401 });
      }),
    );
    await expect(peticion('/api/auth/login', { metodo: 'POST', cuerpo: {}, publica: true })).rejects.toMatchObject({
      estado: 401,
      message: 'Correo o contraseña incorrectos.',
    });
    expect(manejador).not.toHaveBeenCalled();
    expect(cabecera).toBeNull();
  });

  it('convierte un fallo de red en ErrorApi con estado 0', async () => {
    servidor.use(http.get(`${URL_API}/api/departamentos`, () => HttpResponse.error()));
    await expect(peticion('/api/departamentos')).rejects.toMatchObject({ estado: 0 });
  });

  it('descarga archivos como Blob', async () => {
    iniciarSesionFalsa();
    servidor.use(
      http.get(`${URL_API}/api/sismos/exportar`, () => new HttpResponse('idSismo\n1\n', { headers: { 'Content-Type': 'text/csv' } })),
    );
    const blob = await peticionArchivo('/api/sismos/exportar');
    expect(await blob.text()).toBe('idSismo\n1\n');
  });

  it('omite parámetros vacíos al construir la query', () => {
    expect(construirQuery({ a: 1, b: undefined, c: '', d: null, e: false, f: Number.NaN })).toBe('?a=1&e=false');
    expect(construirQuery({})).toBe('');
  });
});
