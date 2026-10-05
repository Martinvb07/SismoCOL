import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { USAR_MOCKS } from './config';
import './index.css';

async function iniciarMocks(): Promise<void> {
  if (!USAR_MOCKS) return;
  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
  console.info('[SismoCol] Usando datos simulados (MSW). Cambia VITE_USAR_MOCKS para llamar a la API real.');
}

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró el elemento #root');

void iniciarMocks().finally(() => {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
