/*
 * Tarjeta blanca translúcida con el formulario de acceso.
 * Valida email y contraseña, simula la autenticación y avisa a LoginPage
 * si debe abrir el modal de error o el de código. Depende de auth.js, Button y tokens.
 */
import { useId, useRef, useState } from 'react';
import isotipo from '../../img/icons/isotipo.webp';
import { authenticate, isValidEmail } from '../../lib/auth.js';
import { Button } from '../Button/Button.jsx';
import styles from './LoginCard.module.css';

export function LoginCard({ onAuthenticated, onInvalidCredentials }) {
  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = `${emailId}-error`;
  const passwordErrorId = `${passwordId}-error`;
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim();
    const nextErrors = {};
    if (!isValidEmail(normalizedEmail)) {
      nextErrors.email = 'Ingresá un email válido.';
    }
    if (!password) {
      nextErrors.password = 'Ingresá tu contraseña.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      (nextErrors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const isValid = await authenticate({
        email: normalizedEmail,
        password,
      });

      if (isValid) {
        onAuthenticated?.(normalizedEmail);
      } else {
        onInvalidCredentials?.();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card} aria-label="Iniciar sesión">
      <img
        className={styles.isotipo}
        src={isotipo}
        alt=""
        aria-hidden="true"
      />

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={emailId}>
            Email
          </label>
          <input
            ref={emailRef}
            id={emailId}
            className={styles.input}
            type="email"
            name="email"
            placeholder="email@example.com"
            autoComplete="email"
            spellCheck="false"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (errors.email) setErrors((current) => ({ ...current, email: '' }));
            }}
            aria-invalid={errors.email ? 'true' : undefined}
            aria-describedby={errors.email ? emailErrorId : undefined}
          />
          {errors.email && (
            <p id={emailErrorId} className={styles.error} role="alert">
              {errors.email}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={passwordId}>
            Contraseña
          </label>
          <input
            ref={passwordRef}
            id={passwordId}
            className={styles.input}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (errors.password) {
                setErrors((current) => ({ ...current, password: '' }));
              }
            }}
            aria-invalid={errors.password ? 'true' : undefined}
            aria-describedby={errors.password ? passwordErrorId : undefined}
          />
          {errors.password && (
            <p id={passwordErrorId} className={styles.error} role="alert">
              {errors.password}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          className={styles.submit}
          aria-disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </Button>

        <a className={styles.forgot} href="#recuperar-contrasena">
          ¿Olvidaste tu contraseña?
        </a>
      </form>
    </section>
  );
}
