import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GLOSARIO } from '@/lib/glosario';
import { DetalleTecnico, Semaforo, Termino } from './Explicacion';

describe('componentes de explicación', () => {
  it('la ayuda (i) muestra la definición del glosario y se cierra con Escape', async () => {
    const usuario = userEvent.setup();
    render(<Termino termino="periodoRetorno">Periodo de retorno</Termino>);
    const boton = screen.getByRole('button', { name: '¿Qué significa Periodo de retorno?' });
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(GLOSARIO.periodoRetorno);
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    await usuario.keyboard('{Escape}');
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  it('el semáforo dice el nivel con texto, no solo con color', () => {
    render(<Semaforo nivel="MODERADO" titulo="Amenaza" explicacion="Criterio" />);
    expect(screen.getByText('Amenaza: moderado')).toBeInTheDocument();
  });

  it('el detalle técnico está cerrado por defecto', () => {
    const { container } = render(
      <DetalleTecnico>
        <p>tabla</p>
      </DetalleTecnico>,
    );
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Ver detalle técnico')).toBeInTheDocument();
  });
});
