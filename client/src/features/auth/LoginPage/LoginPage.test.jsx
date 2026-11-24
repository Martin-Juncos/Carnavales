/*
 * Pruebas de integración de la pantalla de login: validación local, error de
 * credenciales, apertura del OTP de seis dígitos, pegado, auto-avance, cierre con Escape
 * y paso a la sesión. La API se simula con un cliente falso que devuelve la forma de cliente-api.js.
 * Depende de LoginPage, Testing Library y vitest.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage.jsx';

const credenciales = { email: 'ana@example.test', password: 'contraseña-de-prueba' };
const usuario = { name: 'Ana', email: credenciales.email };

const respuesta = (ok, status = ok ? 200 : 401, cuerpo = {}) => ({ ok, status, cuerpo });

function apiFalsa(sobrescritos = {}) {
  return {
    iniciarSesion: vi.fn(async () => respuesta(true, 200, { twoFactorRedirect: true })),
    pedirCodigo: vi.fn(async () => respuesta(true)),
    verificarCodigo: vi.fn(async () => respuesta(true)),
    obtenerSesion: vi.fn(async () => respuesta(true, 200, { user: usuario })),
    ...sobrescritos,
  };
}

function renderizar(api = apiFalsa(), props = {}) {
  render(<LoginPage api={api} onSesionIniciada={vi.fn()} onRecuperar={vi.fn()} {...props} />);
  return api;
}

async function fillCredentials(user, { email, password }) {
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('LoginPage', () => {
  it('valida el formato del email sin abrir ningún modal ni llamar a la API', async () => {
    const user = userEvent.setup();
    const api = renderizar();

    await fillCredentials(user, { email: 'correo-invalido', password: 'contraseña' });

    expect(await screen.findByText('Ingresá un email válido.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.iniciarSesion).not.toHaveBeenCalled();
  });

  it('abre el modal de error con credenciales incorrectas y lo cierra con Aceptar', async () => {
    const user = userEvent.setup();
    renderizar(apiFalsa({ iniciarSesion: vi.fn(async () => respuesta(false, 401)) }));

    await fillCredentials(user, credenciales);

    const dialog = await screen.findByRole('dialog', { name: 'Error' });
    expect(within(dialog).getByText('Email y/o contraseña incorrecto')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Olvidé mi contraseña' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Aceptar' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('abre el código de acceso con credenciales válidas y acepta 6 dígitos pegados', async () => {
    const user = userEvent.setup();
    const api = renderizar();

    await fillCredentials(user, credenciales);

    const dialog = await screen.findByRole('dialog', { name: 'Código de acceso' });
    const cells = within(dialog).getAllByRole('textbox');
    expect(cells).toHaveLength(6);

    await user.click(cells[0]);
    await user.paste('123456');
    expect(cells.map((cell) => cell.value)).toEqual(['1', '2', '3', '4', '5', '6']);

    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    expect(await within(dialog).findByText('Código verificado correctamente.')).toBeInTheDocument();
    expect(api.verificarCodigo).toHaveBeenCalledWith('123456');
  });

  it('avanza el foco automáticamente al completar cada casilla', async () => {
    const user = userEvent.setup();
    renderizar();

    await fillCredentials(user, credenciales);
    const dialog = await screen.findByRole('dialog', { name: 'Código de acceso' });
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
    renderizar();

    await fillCredentials(user, credenciales);
    await screen.findByRole('dialog', { name: 'Código de acceso' });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Ingresar' })).toHaveFocus();
  });

  it('con el código correcto consulta la sesión y avisa quién entró', async () => {
    const user = userEvent.setup();
    const onSesionIniciada = vi.fn();
    const api = renderizar(apiFalsa(), { onSesionIniciada });

    await fillCredentials(user, credenciales);
    const dialog = await screen.findByRole('dialog', { name: 'Código de acceso' });
    await user.click(within(dialog).getAllByRole('textbox')[0]);
    await user.paste('123456');
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(onSesionIniciada).toHaveBeenCalledWith(usuario);
    });
    expect(api.obtenerSesion).toHaveBeenCalled();
  });

  it('el enlace de olvido de contraseña avisa a la aplicación', async () => {
    const user = userEvent.setup();
    const onRecuperar = vi.fn();
    renderizar(apiFalsa(), { onRecuperar });

    await user.click(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }));

    expect(onRecuperar).toHaveBeenCalledTimes(1);
  });
});
