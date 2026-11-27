/*
 * Pantalla pública para aceptar una invitación.
 * Consulta el enlace, precarga el nombre si la API lo conoce y crea la cuenta
 * con una contraseña confirmada. No inicia sesión: vuelve al acceso.
 * Depende de AuthShell, AuthField, Button, ruta-invitacion y auth.js.
 */
import { useEffect, useState } from 'react';
import { Button } from '../../../../components/Button/Button.jsx';
import { AuthField } from '../AuthField/AuthField.jsx';
import { AuthShell } from '../AuthShell/AuthShell.jsx';
import { limpiarTokenDeLaUrl } from '../../utils/ruta-invitacion.js';
import { validarContrasena } from '../../utils/auth.js';
import styles from '../AuthForm/AuthForm.module.css';

const MENSAJE_ENLACE_INVALIDO =
  'El enlace de invitación no es válido o venció. Solicitá una nueva invitación al administrador.';
const MENSAJE_ERROR_GENERAL = 'No se pudo crear la cuenta. Intentá de nuevo.';

export function AceptarInvitacion({ api, token, onCuentaCreada, onVolver }) {
  const [estadoEnlace, setEstadoEnlace] = useState(token ? 'verificando' : 'invalido');
  const [correo, setCorreo] = useState('');
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);

  // La consulta del token completa el correo y, si existe, el nombre registrado.
  useEffect(() => {
    if (!token) {
      setEstadoEnlace('invalido');
      return undefined;
    }

    let cancelado = false;
    const consulta = api.consultarInvitacion
      ? api.consultarInvitacion(token)
      : Promise.resolve({ ok: true, cuerpo: {} });

    consulta
      .then((resultado) => {
        if (cancelado) return;
        if (resultado.ok) {
          setCorreo(resultado.cuerpo?.correo ?? '');
          setNombre(resultado.cuerpo?.nombre ?? '');
          setEstadoEnlace('valido');
          return;
        }
        if (resultado.status === 400 || resultado.status === 404) {
          setEstadoEnlace('invalido');
          limpiarTokenDeLaUrl();
          return;
        }
        // Sin conexión o error del servidor: se permite intentar el alta; el
        // servidor seguirá siendo la autoridad sobre la validez del token.
        setEstadoEnlace('valido');
        setErrorGeneral('No pudimos verificar el enlace ahora. Podés intentar completar el registro.');
      })
      .catch(() => {
        if (cancelado) return;
        setEstadoEnlace('valido');
        setErrorGeneral('No pudimos verificar el enlace ahora. Podés intentar completar el registro.');
      });

    return () => {
      cancelado = true;
    };
  }, [api, token]);

  // Confirmación visible y regreso automático al acceso.
  useEffect(() => {
    if (!exito) return undefined;
    const temporizador = setTimeout(() => onCuentaCreada?.(), 4500);
    return () => clearTimeout(temporizador);
  }, [exito, onCuentaCreada]);

  function limpiarError(campo) {
    setErrores((actuales) => {
      if (!actuales[campo]) return actuales;
      return { ...actuales, [campo]: '' };
    });
  }

  async function aceptar(evento) {
    evento.preventDefault();
    if (enviando) return;

    const siguientes = {};
    if (!nombre.trim()) siguientes.nombre = 'Ingresá tu nombre y apellido.';
    const errorContrasena = validarContrasena(contrasena);
    if (errorContrasena) siguientes.contrasena = errorContrasena;
    if (contrasena !== repetir) siguientes.repetir = 'Las contraseñas no coinciden.';

    setErrores(siguientes);
    setErrorGeneral('');
    if (Object.keys(siguientes).length > 0) return;

    setEnviando(true);
    try {
      const resultado = await api.aceptarInvitacion(token, nombre.trim(), contrasena);
      setContrasena('');
      setRepetir('');

      if (resultado.ok) {
        limpiarTokenDeLaUrl();
        setExito(true);
        return;
      }

      if (resultado.status === 400 || resultado.status === 404) {
        limpiarTokenDeLaUrl();
        setEstadoEnlace('invalido');
        return;
      }

      setErrorGeneral(resultado.cuerpo?.mensaje ?? MENSAJE_ERROR_GENERAL);
    } catch {
      setErrorGeneral('No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (exito) {
    return (
      <AuthShell title="Cuenta creada">
        <div className={styles.success} role="status">
          <span className={styles.successIcon} aria-hidden="true">
            ✓
          </span>
          <p className={styles.successTitle}>¡Ya sos parte!</p>
          <p className={styles.successText}>
            Tu cuenta se creó correctamente. Ya podés iniciar sesión con tu correo y la contraseña que elegiste.
          </p>
        </div>
        <div className={styles.actions}>
          <Button className={styles.submit} onClick={onCuentaCreada}>
            Ir al inicio de sesión
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (estadoEnlace === 'invalido') {
    return (
      <AuthShell title="Aceptar invitación">
        <p className={styles.alert} role="alert">
          {MENSAJE_ENLACE_INVALIDO}
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" className={styles.secondary} onClick={onVolver}>
            Volver al inicio de sesión
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Aceptar invitación"
      description="Completá tus datos y elegí la contraseña con la que vas a ingresar al portal."
    >
      {correo && (
        <p className={styles.context}>
          Invitación para <strong>{correo}</strong>
        </p>
      )}
      {estadoEnlace === 'verificando' && (
        <p className={styles.verifying} role="status">
          Verificando el enlace…
        </p>
      )}

      <form className={styles.form} onSubmit={aceptar} noValidate>
        <AuthField
          id="invitacion-nombre"
          label="Nombre y apellido"
          value={nombre}
          onChange={(evento) => {
            setNombre(evento.target.value);
            limpiarError('nombre');
          }}
          error={errores.nombre}
          autoComplete="name"
          name="nombre"
          disabled={enviando}
        />

        <AuthField
          id="invitacion-contrasena"
          label="Contraseña"
          type="password"
          value={contrasena}
          onChange={(evento) => {
            setContrasena(evento.target.value);
            limpiarError('contrasena');
            limpiarError('repetir');
          }}
          error={errores.contrasena}
          hint="Mínimo 8 caracteres."
          autoComplete="new-password"
          name="contrasena"
          disabled={enviando}
        />

        <AuthField
          id="invitacion-repetir"
          label="Repetir contraseña"
          type="password"
          value={repetir}
          onChange={(evento) => {
            setRepetir(evento.target.value);
            limpiarError('repetir');
          }}
          error={errores.repetir}
          autoComplete="new-password"
          name="repetir-contrasena"
          disabled={enviando}
        />

        {errorGeneral && (
          <p className={styles.alert} role="alert">
            {errorGeneral}
          </p>
        )}

        <Button
          type="submit"
          className={styles.submit}
          disabled={enviando || estadoEnlace === 'verificando'}
          aria-busy={enviando}
        >
          {enviando ? 'Creando cuenta…' : 'Aceptar'}
        </Button>

        <a
          className={styles.link}
          href="/"
          onClick={(evento) => {
            evento.preventDefault();
            onVolver?.();
          }}
        >
          Volver al inicio de sesión
        </a>
      </form>
    </AuthShell>
  );
}
