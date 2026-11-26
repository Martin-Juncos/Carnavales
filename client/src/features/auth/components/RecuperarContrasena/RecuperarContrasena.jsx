/*
 * Paso 1 de la recuperación de contraseña: pedir el enlace por correo.
 * La respuesta es siempre genérica para no revelar si la cuenta existe.
 * Depende de AuthShell, AuthField, Button y auth.js.
 */
import { useState } from 'react';
import { Button } from '../../../../components/Button/Button.jsx';
import { AuthField } from '../AuthField/AuthField.jsx';
import { AuthShell } from '../AuthShell/AuthShell.jsx';
import { isValidEmail } from '../../utils/auth.js';
import styles from '../AuthForm/AuthForm.module.css';

const MENSAJE_ENVIO_FALLIDO = 'No pudimos enviar el pedido. Revisá tu conexión e intentá de nuevo.';

export function RecuperarContrasena({ api, onVolver }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function pedir(evento) {
    evento.preventDefault();
    if (enviando) return;

    const correo = email.trim();
    if (!isValidEmail(correo)) {
      setError('Ingresá un correo electrónico válido.');
      return;
    }

    setEnviando(true);
    setError('');
    try {
      const resultado = await api.pedirRecuperacion(
        correo,
        `${window.location.origin}/restablecer-contrasena`,
      );
      if (resultado.ok) {
        setEnviado(true);
      } else {
        setError(MENSAJE_ENVIO_FALLIDO);
      }
    } catch {
      setError(MENSAJE_ENVIO_FALLIDO);
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <AuthShell title="Recuperar contraseña">
        <div className={styles.success} role="status">
          <span className={styles.successIcon} aria-hidden="true">
            ✉
          </span>
          <p className={styles.successTitle}>Revisá tu correo</p>
          <p className={styles.successText}>
            Si el correo está registrado en el sistema, te enviamos las instrucciones para crear una nueva
            contraseña. El enlace vence en 60 minutos y se puede usar una sola vez.
          </p>
        </div>
        <div className={styles.actions}>
          <Button className={styles.submit} onClick={onVolver}>
            Volver al inicio de sesión
          </Button>
          <a
            className={styles.link}
            href="/recuperar-contrasena"
            onClick={(evento) => {
              evento.preventDefault();
              setEnviado(false);
              setEmail('');
            }}
          >
            Usar otro correo
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      description="Ingresá el correo electrónico asociado a tu cuenta para recibir instrucciones para recuperar tu contraseña."
    >
      <form className={styles.form} onSubmit={pedir} noValidate>
        <AuthField
          id="recuperar-email"
          label="Correo electrónico"
          type="email"
          value={email}
          onChange={(evento) => {
            setEmail(evento.target.value);
            if (error) setError('');
          }}
          error={error}
          autoComplete="email"
          inputMode="email"
          name="email"
          placeholder="email@example.com"
          disabled={enviando}
        />

        <Button
          type="submit"
          className={styles.submit}
          disabled={enviando}
          aria-busy={enviando}
        >
          {enviando ? 'Enviando…' : 'Enviar instrucciones'}
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
