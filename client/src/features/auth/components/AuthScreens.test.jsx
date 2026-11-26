/*
 * Pruebas de las pantallas de invitación y recuperación.
 * Verifican validación local, errores junto al campo, confirmación y que no se
 * llame a la API cuando el formulario no es válido. Dependen de Testing Library.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AceptarInvitacion } from './AceptarInvitacion/AceptarInvitacion.jsx';
import { RecuperarContrasena } from './RecuperarContrasena/RecuperarContrasena.jsx';
import { RestablecerContrasena } from './RestablecerContrasena/RestablecerContrasena.jsx';

const respuesta = (ok, status = ok ? 200 : 400, cuerpo = {}) => ({ ok, status, cuerpo });

describe('AceptarInvitacion', () => {
  it('precarga el nombre, valida la confirmación y no llama a la API si hay errores', async () => {
    const user = userEvent.setup();
    const api = {
      consultarInvitacion: vi.fn(async () =>
        respuesta(true, 200, { correo: 'ana@example.test', nombre: 'Ana Pérez' }),
      ),
      aceptarInvitacion: vi.fn(async () => respuesta(true, 201, { estado: 'cuenta_creada' })),
    };

    render(<AceptarInvitacion api={api} token="tok-1" onCuentaCreada={vi.fn()} onVolver={vi.fn()} />);

    expect(await screen.findByDisplayValue('Ana Pérez')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga');
    await user.type(screen.getByLabelText('Repetir contraseña'), 'otra-contraseña');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('muestra la confirmación y avisa cuando la cuenta se crea', async () => {
    const user = userEvent.setup();
    const onCuentaCreada = vi.fn();
    const api = {
      consultarInvitacion: vi.fn(async () => respuesta(true, 200, { correo: 'ana@example.test', nombre: '' })),
      aceptarInvitacion: vi.fn(async () => respuesta(true, 201, { estado: 'cuenta_creada' })),
    };

    render(<AceptarInvitacion api={api} token="tok-1" onCuentaCreada={onCuentaCreada} onVolver={vi.fn()} />);

    await user.type(await screen.findByLabelText('Nombre y apellido'), 'Ana Pérez');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga');
    await user.type(screen.getByLabelText('Repetir contraseña'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText(/Tu cuenta se creó correctamente/)).toBeInTheDocument();
    expect(api.aceptarInvitacion).toHaveBeenCalledWith('tok-1', 'Ana Pérez', 'contraseña-larga');
    expect(screen.getByRole('button', { name: 'Ir al inicio de sesión' })).toBeInTheDocument();
  });

  it('explica que un enlace inválido no permite continuar', async () => {
    const api = {
      consultarInvitacion: vi.fn(async () => respuesta(false, 400, { error: 'invitacion_invalida' })),
      aceptarInvitacion: vi.fn(),
    };

    render(<AceptarInvitacion api={api} token="tok-invalido" onCuentaCreada={vi.fn()} onVolver={vi.fn()} />);

    expect(await screen.findByText(/El enlace de invitación no es válido o venció/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
  });
});

describe('RecuperarContrasena', () => {
  it('valida el correo sin revelar si está registrado', async () => {
    const user = userEvent.setup();
    const api = { pedirRecuperacion: vi.fn(async () => respuesta(true, 200, { status: true })) };
    const onVolver = vi.fn();

    render(<RecuperarContrasena api={api} onVolver={onVolver} />);

    await user.type(screen.getByLabelText('Correo electrónico'), 'correo-invalido');
    await user.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));
    expect(await screen.findByText('Ingresá un correo electrónico válido.')).toBeInTheDocument();
    expect(api.pedirRecuperacion).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Correo electrónico'));
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@example.test');
    await user.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));

    expect(await screen.findByText('Revisá tu correo')).toBeInTheDocument();
    expect(screen.getByText(/Si el correo está registrado/)).toBeInTheDocument();
    expect(api.pedirRecuperacion).toHaveBeenCalledWith(
      'ana@example.test',
      `${window.location.origin}/restablecer-contrasena`,
    );
  });
});

describe('RestablecerContrasena', () => {
  it('verifica el enlace antes de mostrar el formulario y permite pedir otro', async () => {
    const api = {
      validarRecuperacion: vi.fn(async () => respuesta(false, 400, { error: 'token_invalido' })),
      restablecerContrasena: vi.fn(),
    };

    render(
      <RestablecerContrasena
        api={api}
        token="vencido"
        onListo={vi.fn()}
        onSolicitarNueva={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(await screen.findByText(/El enlace de recuperación no es válido o venció/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Solicitar un nuevo enlace' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nueva contraseña', { selector: 'input' })).not.toBeInTheDocument();
  });

  it('valida ambas contraseñas y confirma el cambio', async () => {
    const user = userEvent.setup();
    const api = {
      validarRecuperacion: vi.fn(async () => respuesta(true, 200, { valido: true })),
      restablecerContrasena: vi.fn(async () => respuesta(true, 200, { status: true })),
    };

    render(
      <RestablecerContrasena
        api={api}
        token="tok-1"
        onListo={vi.fn()}
        onSolicitarNueva={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    await user.type(
      await screen.findByLabelText('Nueva contraseña', { selector: 'input' }),
      'contraseña-larga',
    );
    await user.type(screen.getByLabelText('Repetir contraseña'), 'otra-contraseña');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
    expect(api.restablecerContrasena).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Repetir contraseña'));
    await user.type(screen.getByLabelText('Repetir contraseña'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    expect(await screen.findByText(/Tu contraseña fue cambiada/)).toBeInTheDocument();
    expect(api.restablecerContrasena).toHaveBeenCalledWith('tok-1', 'contraseña-larga');
  });
});
