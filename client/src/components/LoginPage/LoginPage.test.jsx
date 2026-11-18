/*
 * Pruebas de integración de la pantalla de login: validación local, error de
 * credenciales, apertura del OTP, pegado, auto-avance y cierre con Escape.
 * Depende de LoginPage, Testing Library y las utilidades demo de lib/auth.js.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LoginPage } from './LoginPage.jsx';
import { DEMO_CREDENTIALS } from '../../lib/auth.js';

async function fillCredentials(user, { email, password }) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('LoginPage', () => {
  it('valida el formato del email sin abrir ningún modal', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCredentials(user, {
      email: 'correo-invalido',
      password: 'carnaval2027',
    });

    expect(
      await screen.findByText('Ingresá un email válido.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre el modal de error con credenciales incorrectas y lo cierra con Aceptar', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCredentials(user, {
      email: DEMO_CREDENTIALS.email,
      password: 'no-es-la-clave',
    });

    const dialog = await screen.findByRole('dialog', { name: 'Error' });
    expect(
      within(dialog).getByText('Email y/o contraseña incorrecto'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Olvidé mi contraseña' }),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('abre el código de acceso con credenciales válidas y acepta 5 dígitos pegados', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCredentials(user, DEMO_CREDENTIALS);

    const dialog = await screen.findByRole('dialog', {
      name: 'Código de acceso',
    });
    const cells = within(dialog).getAllByRole('textbox');
    expect(cells).toHaveLength(5);

    await user.click(cells[0]);
    await user.paste('12345');
    expect(cells.map((cell) => cell.value)).toEqual(['1', '2', '3', '4', '5']);

    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(
      await within(dialog).findByText('Código verificado correctamente.'),
    ).toBeInTheDocument();
  });

  it('avanza el foco automáticamente al completar cada casilla', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCredentials(user, DEMO_CREDENTIALS);
    const dialog = await screen.findByRole('dialog', {
      name: 'Código de acceso',
    });
    const cells = within(dialog).getAllByRole('textbox');

    await user.type(cells[0], '1');
    expect(cells[0]).toHaveValue('1');
    expect(cells[1]).toHaveFocus();

    await user.type(cells[1], '2');
    expect(cells[1]).toHaveValue('2');
    expect(cells[2]).toHaveFocus();
  });

  it('cierra el modal de código con Escape y restaura el foco', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await fillCredentials(user, DEMO_CREDENTIALS);
    await screen.findByRole('dialog', { name: 'Código de acceso' });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Ingresar' })).toHaveFocus();
  });
});
