/*
 * Modal de error reutilizable con la estructura pedida: título "Error",
 * mensaje, enlace coral de recuperación y botón Aceptar coral.
 * Expone ErrorModal (title y message configurables); depende de Modal y Button.
 */
import { useId, useRef } from 'react';
import { Button } from '../Button/Button.jsx';
import { Modal } from './Modal.jsx';
import styles from './ErrorModal.module.css';

export function ErrorModal({
  title = 'Error',
  message = 'Email y/o contraseña incorrecto',
  onClose,
}) {
  const messageId = useId();
  const acceptRef = useRef(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      describedBy={messageId}
      initialFocusRef={acceptRef}
    >
      <div className={styles.body}>
        <p id={messageId} className={styles.message}>
          {message}
        </p>
        <a className={styles.link} href="#recuperar-contrasena">
          Olvidé mi contraseña
        </a>
        <Button
          ref={acceptRef}
          variant="error"
          className={styles.action}
          onClick={onClose}
        >
          Aceptar
        </Button>
      </div>
    </Modal>
  );
}
