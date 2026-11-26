/*
 * Paso 3 de la recuperación: crear una contraseña nueva con el token del enlace.
 * El token lo valida y consume el servidor; aquí solo se valida el formulario.
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
  'El enlace de recuperación no es válido o venció. Pedí uno nuevo para continuar.';
const MENSAJE_ERROR_GENERAL = 'No se pudo cambiar la contraseña. Intentá de nuevo.';

export function RestablecerContrasena({ api, token, onListo, onSolicitarNueva, onVolver }) {
  const [estadoEnlace, setEstadoEnlace] = useState(
    token ? (api.validarRecuperacion ? 'verificando' : 'valido') : 'invalido',
  );
  const [contrasena, setContrasena] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);

  // Antes de mostrar el formulario se comprueba que el enlace siga vigente.
  // La validación definitiva y el consumo del token siguen ocurriendo al guardar.
  useEffect(() => {
    if (!token || !api.validarRecuperacion) return undefined;

    let cancelado = false;
    api.validarRecuperacion(token)
      .then((resultado) => {
        if (cancelado) return;
        if (resultado.ok) {
          setEstadoEnlace('valido');
          return;
        }
        if (resultado.status === 400 || resultado.status === 404) {
          limpiarTokenDeLaUrl();
          setEstadoEnlace('invalido');
          return;
        }
        // Si no se pudo consultar, no se bloquea el intento de cambio.
        setEstadoEnlace('valido');
        setErrorGeneral('No pudimos verificar el enlace ahora. Podés intentar cambiar la contraseña.');
      })
      .catch(() => {
        if (cancelado) return;
        setEstadoEnlace('valido');
        setErrorGeneral('No pudimos verificar el enlace ahora. Podés intentar cambiar la contraseña.');
      });

    return () => {
      cancelado = true;
    };
  }, [api, token]);

  // Después de confirmar, se vuelve al acceso automáticamente.
  useEffect(() => {
    if (!exito) return undefined;
    const temporizador = setTimeout(() => onListo?.(), 4500);
    return () => clearTimeout(temporizador);
  }, [exito, onListo]);

  function limpiarError(campo) {
    setErrores((actuales) => {
      if (!actuales[campo]) return actuales;
      return { ...actuales, [campo]: '' };
    });
  }

  async function cambiar(evento) {
    evento.preventDefault();
    if (enviando) return;

    const siguientes = {};
    const errorContrasena = validarContrasena(contrasena);
    if (errorContrasena) siguientes.contrasena = errorContrasena;
    if (contrasena !== repetir) siguientes.repetir = 'Las contraseñas no coinciden.';

    setErrores(siguientes);
    setErrorGeneral('');
    if (Object.keys(siguientes).length > 0) return;

    setEnviando(true);
    try {
      const resultado = await api.restablecerContrasena(token, contrasena);
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
      <AuthShell title="Contraseña actualizada">
        <div className={styles.success} role="status">
          <span className={styles.successIcon} aria-hidden="true">
            ✓
          </span>
          <p className={styles.successTitle}>Cambio exitoso</p>
          <p className={styles.successText}>
            Tu contraseña fue cambiada. Ya podés iniciar sesión con tu correo y la nueva contraseña.
          </p>
        </div>
        <div className={styles.actions}>
          <Button className={styles.submit} onClick={onListo}>
            Ir al inicio de sesión
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (estadoEnlace === 'invalido') {
    return (
      <AuthShell title="Nueva contraseña">
        <p className={styles.alert} role="alert">
          {MENSAJE_ENLACE_INVALIDO}
        </p>
        <div className={styles.actions}>
          <Button className={styles.submit} onClick={onSolicitarNueva}>
            Solicitar un nuevo enlace
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
        </div>
      </AuthShell>
    );
  }

  if (estadoEnlace === 'verificando') {
    return (
      <AuthShell title="Nueva contraseña">
        <p className={styles.verifying} role="status">
          Verificando el enlace…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nueva contraseña"
      description="Elegí una contraseña nueva para tu cuenta. La vas a usar junto con el código de acceso."
    >
      <form className={styles.form} onSubmit={cambiar} noValidate>
        <AuthField
          id="nueva-contrasena"
          label="Nueva contraseña"
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
          id="repetir-nueva-contrasena"
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
          disabled={enviando}
          aria-busy={enviando}
        >
          {enviando ? 'Guardando…' : 'Aceptar'}
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
