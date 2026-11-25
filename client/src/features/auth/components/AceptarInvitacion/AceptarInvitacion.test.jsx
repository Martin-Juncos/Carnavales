/*
 * Pruebas de integración de la pantalla de registro por invitación:
 * enlace sin token, validaciones locales (nombre, longitud y confirmación),
 * visibilidad de contraseña, alta exitosa, errores de API y regreso al login.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AceptarInvitacion } from './AceptarInvitacion.jsx';

const respuesta = (ok, status = ok ? 201 : 400, cuerpo = {}) => ({ ok, status, cuerpo });

function apiFalsa(sobrescritos = {}) {
  return {
    aceptarInvitacion: vi.fn(async () => respuesta(true, 201, { ok: true })),
    ...sobrescritos,
  };
}

describe('AceptarInvitacion', () => {
  it('muestra aviso de enlace inválido sin token y permite volver al inicio de sesión', async () => {
    const user = userEvent.setup();
    const api = apiFalsa();
    const onVolverAlInicio = vi.fn();

    render(
      <AceptarInvitacion
        api={api}
        token={null}
        onCuentaCreada={vi.fn()}
        onVolverAlInicio={onVolverAlInicio}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Portal oficial de votaciones' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Invitación no válida' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de invitación no es válido');
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ir al inicio de sesión' }));
    expect(onVolverAlInicio).toHaveBeenCalledTimes(1);
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('valida nombre, longitud mínima y coincidencia de contraseña sin llamar a la API', async () => {
    const user = userEvent.setup();
    const api = apiFalsa();

    render(
      <AceptarInvitacion
        api={api}
        token="tok-123"
        onCuentaCreada={vi.fn()}
        onVolverAlInicio={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Ingresá tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Confirmá tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Nombre'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-segura-2027');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'otra-clave');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveFocus();
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('permite alternar la visibilidad de los campos de contraseña', async () => {
    const user = userEvent.setup();

    render(
      <AceptarInvitacion
        api={apiFalsa()}
        token="tok-123"
        onCuentaCreada={vi.fn()}
        onVolverAlInicio={vi.fn()}
      />,
    );

    const campoContrasena = screen.getByLabelText('Contraseña');
    expect(campoContrasena).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(campoContrasena).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(campoContrasena).toHaveAttribute('type', 'password');
  });

  it('crea la cuenta con datos válidos, limpia el token de la URL y avisa a la aplicación', async () => {
    const user = userEvent.setup();
    const api = apiFalsa();
    const onCuentaCreada = vi.fn();
    window.history.replaceState(null, '', '/aceptar-invitacion?token=tok-valido');

    render(
      <AceptarInvitacion
        api={api}
        token="tok-valido"
        onCuentaCreada={onCuentaCreada}
        onVolverAlInicio={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Nombre'), '  Ana Pérez  ');
    await user.type(screen.getByLabelText('Contraseña'), 'mi frase secreta 2027');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'mi frase secreta 2027');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    await waitFor(() => {
      expect(onCuentaCreada).toHaveBeenCalledTimes(1);
    });
    expect(api.aceptarInvitacion).toHaveBeenCalledWith('tok-valido', 'Ana Pérez', 'mi frase secreta 2027');
    expect(window.location.search).toBe('');
  });

  it('muestra el error de la API y limpia los campos de contraseña cuando el enlace falló', async () => {
    const user = userEvent.setup();
    const mensajeApi = 'El enlace no es válido o venció. Solicita una nueva invitación al administrador.';
    const api = apiFalsa({
      aceptarInvitacion: vi.fn(async () => respuesta(false, 400, { mensaje: mensajeApi })),
    });
    const onCuentaCreada = vi.fn();

    render(
      <AceptarInvitacion
        api={api}
        token="tok-vencido"
        onCuentaCreada={onCuentaCreada}
        onVolverAlInicio={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Nombre'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-valida-123');
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'clave-valida-123');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensajeApi);
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveValue('');
    expect(onCuentaCreada).not.toHaveBeenCalled();
  });

  it('el enlace para iniciar sesión vuelve al acceso', async () => {
    const user = userEvent.setup();
    const onVolverAlInicio = vi.fn();

    render(
      <AceptarInvitacion
        api={apiFalsa()}
        token="tok-123"
        onCuentaCreada={vi.fn()}
        onVolverAlInicio={onVolverAlInicio}
      />,
    );

    await user.click(screen.getByRole('link', { name: '¿Ya tenés cuenta? Iniciar sesión' }));
    expect(onVolverAlInicio).toHaveBeenCalledTimes(1);
  });
});
