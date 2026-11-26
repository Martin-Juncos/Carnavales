/*
 * Modal de error reutilizable: título "Error" por defecto, mensaje destacado en tono
 * de peligro, enlace opcional de recuperación y botón Aceptar.
 * Por defecto ofrece el enlace de recuperación del login; recoveryLabel={null} lo oculta.
 * Expone ErrorModal; depende de Modal y Button.
 */
import { useId, useRef } from 'react';
import { Button } from '../Button/Button.jsx';
import { Modal } from './Modal.jsx';
import styles from './ErrorModal.module.css';

export function ErrorModal({
  title = 'Error',
  message = 'Email y/o contraseña incorrecto',
  recoveryHref = '#recuperar-contrasena',
  recoveryLabel = 'Olvidé mi contraseña',
  onClose,
}) {
  const messageId = useId();
  const acceptRef = useRef(null);

  return (
    <Modal
      title={title}
      tone="danger"
      icon="alert"
      onClose={onClose}
      describedBy={messageId}
      initialFocusRef={acceptRef}
      footer={(
        <>
          {recoveryLabel && (
            <a className={styles.link} href={recoveryHref}>
              {recoveryLabel}
            </a>
          )}
          <Button ref={acceptRef} variant="danger" onClick={onClose}>
            Aceptar
          </Button>
        </>
      )}
    >
      <p id={messageId} className={styles.message}>
        {message}
      </p>
    </Modal>
  );
}
