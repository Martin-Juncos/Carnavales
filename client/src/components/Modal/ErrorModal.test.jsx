/*
 * Pruebas del modal de error reutilizable: el enlace de recuperación es opcional y
 * Aceptar cierra el diálogo. Depende de ErrorModal, Testing Library y vitest.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorModal } from './ErrorModal.jsx';

describe('ErrorModal', () => {
  it('muestra por defecto el enlace de recuperación de contraseña', () => {
    render(<ErrorModal message="Algo salió mal" onClose={() => {}} />);

    expect(screen.getByRole('link', { name: 'Olvidé mi contraseña' })).toHaveAttribute(
      'href',
      '#recuperar-contrasena',
    );
  });

  it('no muestra enlace de recuperación cuando recoveryLabel es null', () => {
    render(<ErrorModal message="No se pudo guardar" recoveryLabel={null} onClose={() => {}} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
  });

  it('Aceptar notifica el cierre', () => {
    const onClose = vi.fn();
    render(<ErrorModal message="Error" recoveryLabel={null} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
