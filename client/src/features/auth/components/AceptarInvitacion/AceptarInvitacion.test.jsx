/*
 * Pruebas de integración de la pantalla de registro por invitación:
 * enlace sin token, validaciones locales (nombre, longitud y confirmación),
 * visibilidad de contraseña, alta exitosa, errores de API y regreso al login.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AceptarInvitacion } from './AceptarInvitacion.jsx';

const respuesta = (ok, status = ok ? 201 : 400, cuerpo = {}) => ({ ok, status, cuerpo });

function apiFalsa(sobrescritos = {}) {
  return {
    consultarInvitacion: vi.fn(async () => respuesta(true, 200, { correo: 'ana@example.test' })),
    aceptarInvitacion: vi.fn(async () => respuesta(true, 201, { ok: true })),
    ...sobrescritos,
  };
}

describe('AceptarInvitacion', () => {
  it('muestra aviso de enlace inválido sin token y permite volver al inicio de sesión', async () => {
    const user = userEvent.setup();
    const api = apiFalsa();
    const onVolver = vi.fn();

    render(
      <AceptarInvitacion
        api={api}
        token={null}
        onCuentaCreada={vi.fn()}
        onVolver={onVolver}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Aceptar invitación' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('El enlace de invitación no es válido');
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver al inicio de sesión' }));
    expect(onVolver).toHaveBeenCalledTimes(1);
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('valida nombre, longitud mínima y coincidencia de contraseña sin llamar a la API', async () => {
    const user = userEvent.setup();
    const api = apiFalsa();

    render(<AceptarInvitacion api={api} token="tok-123" onCuentaCreada={vi.fn()} onVolver={vi.fn()} />);

    await screen.findByLabelText('Nombre y apellido');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText('Ingresá tu nombre y apellido.')).toBeInTheDocument();
    expect(screen.getByText('Ingresá una contraseña.')).toBeInTheDocument();
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Nombre y apellido'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Contraseña'), 'corta');
    await user.type(screen.getByLabelText('Repetir contraseña'), 'otra-clave');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(screen.getByText(/al menos 8 caracteres/)).toBeInTheDocument();
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('permite alternar la visibilidad de los campos de contraseña', async () => {
    const user = userEvent.setup();

    render(
      <AceptarInvitacion
        api={apiFalsa()}
        token="tok-123"
        onCuentaCreada={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    const campoContrasena = await screen.findByLabelText('Contraseña');
    expect(campoContrasena).toHaveAttribute('type', 'password');

    await user.click(screen.getAllByRole('button', { name: 'Mostrar contraseña' })[0]);
    expect(campoContrasena).toHaveAttribute('type', 'text');

    await user.click(screen.getAllByRole('button', { name: 'Ocultar contraseña' })[0]);
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
        onVolver={vi.fn()}
      />,
    );

    await user.type(await screen.findByLabelText('Nombre y apellido'), '  Ana Pérez  ');
    await user.type(screen.getByLabelText('Contraseña'), 'mi frase secreta 2027');
    await user.type(screen.getByLabelText('Repetir contraseña'), 'mi frase secreta 2027');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText(/Tu cuenta se creó correctamente/)).toBeInTheDocument();
    expect(api.aceptarInvitacion).toHaveBeenCalledWith('tok-valido', 'Ana Pérez', 'mi frase secreta 2027');
    expect(window.location.search).toBe('');
    await user.click(screen.getByRole('button', { name: 'Ir al inicio de sesión' }));
    expect(onCuentaCreada).toHaveBeenCalledTimes(1);
  });

  it('muestra el error de la API y limpia los campos de contraseña cuando el enlace falló', async () => {
    const user = userEvent.setup();
    const mensajeApi = 'El enlace no es válido o venció. Solicita una nueva invitación al administrador.';
    const api = apiFalsa({
      aceptarInvitacion: vi.fn(async () => respuesta(false, 500, { mensaje: mensajeApi })),
    });
    const onCuentaCreada = vi.fn();

    render(
      <AceptarInvitacion
        api={api}
        token="tok-vencido"
        onCuentaCreada={onCuentaCreada}
        onVolver={vi.fn()}
      />,
    );

    await user.type(await screen.findByLabelText('Nombre y apellido'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Contraseña'), 'clave-valida-123');
    await user.type(screen.getByLabelText('Repetir contraseña'), 'clave-valida-123');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(mensajeApi);
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Repetir contraseña')).toHaveValue('');
    expect(onCuentaCreada).not.toHaveBeenCalled();
  });

  it('el enlace para iniciar sesión vuelve al acceso', async () => {
    const user = userEvent.setup();
    const onVolver = vi.fn();

    render(
      <AceptarInvitacion
        api={apiFalsa()}
        token="tok-123"
        onCuentaCreada={vi.fn()}
        onVolver={onVolver}
      />,
    );

    await user.click(await screen.findByRole('link', { name: 'Volver al inicio de sesión' }));
    expect(onVolver).toHaveBeenCalledTimes(1);
  });
});
