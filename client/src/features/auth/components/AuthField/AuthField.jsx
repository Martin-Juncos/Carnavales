/*
 * Campo de formulario reutilizable de las pantallas de autenticación.
 * Incluye etiqueta visible, error junto al campo y botón para mostrar u ocultar
 * la contraseña. Depende de AuthField.module.css.
 */
import { useId, useState } from 'react';
import styles from './AuthField.module.css';

function IconoOjo({ visible }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {!visible && (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function AuthField({
  id: idExterno,
  label,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  autoComplete,
  name,
  inputMode,
  placeholder,
  readOnly = false,
  disabled = false,
}) {
  const idGenerado = useId();
  const id = idExterno || idGenerado;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const descritoPor = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const esContrasena = type === 'password';
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          id={id}
          className={`${styles.input} ${esContrasena ? styles.conBoton : ''}`}
          type={esContrasena && visible ? 'text' : type}
          name={name}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          spellCheck={esContrasena ? undefined : false}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={descritoPor}
        />
        {esContrasena && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setVisible((actual) => !actual)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
            disabled={disabled}
          >
            <IconoOjo visible={visible} />
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
