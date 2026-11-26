/*
 * Pruebas del modal base: el pie de acciones se renderiza dentro del diálogo y el
 * título queda como nombre accesible. Depende de Modal, Testing Library y vitest.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Modal } from './Modal.jsx';

describe('Modal', () => {
  it('renderiza el pie de acciones dentro del diálogo', () => {
    render(
      <Modal title="Confirmar alta" onClose={() => {}} footer={<button type="button">Aceptar</button>}>
        <p>Cuerpo</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Confirmar alta' });
    expect(within(dialog).getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
    expect(within(dialog).getByText('Cuerpo')).toBeInTheDocument();
  });
});
