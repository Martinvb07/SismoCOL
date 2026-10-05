import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ProveedorSesion } from '@/auth/ContextoSesion';
import { RUTA_GEOJSON_DEPARTAMENTOS } from '@/config';

export function crearClientePrueba(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
}

export function renderConProveedores(ui: ReactElement, { ruta = '/' }: { ruta?: string } = {}) {
  const cliente = crearClientePrueba();
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProveedorSesion>{ui}</ProveedorSesion>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Sirve el GeoJSON real de /public en las pruebas. */
export const handlerGeojson = http.get(new URL(RUTA_GEOJSON_DEPARTAMENTOS, window.location.origin).toString(), () => {
  const ruta = resolve(process.cwd(), 'public/geo/colombia-departamentos.json');
  return new HttpResponse(readFileSync(ruta, 'utf8'), { headers: { 'Content-Type': 'application/json' } });
});
