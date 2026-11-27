/*
 * Modal de código de acceso con seis casillas independientes.
 * Soporta auto-avance, retroceso, flechas y pegado del código completo; delega
 * la verificación y el reenvío en onVerify/onResend. Depende de Modal y Button.
 */
import { useId, useRef, useState } from 'react';
import { Button } from '../../../../components/Button/Button.jsx';
import { Modal } from '../../../../components/Modal/Modal.jsx';
import styles from './AccessCodeModal.module.css';

const CODE_LENGTH = 6;

export function AccessCodeModal({
  maskedEmail,
  onClose,
  onVerify,
  onResend,
}) {
  const fieldId = useId();
  const introId = `${fieldId}-intro`;
  const errorId = `${fieldId}-error`;
  const statusId = `${fieldId}-status`;
  const cellRefs = useRef([]);
  const firstCellRef = useRef(null);
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const setCellRef = (index) => (node) => {
    cellRefs.current[index] = node;
    if (index === 0) firstCellRef.current = node;
  };

  function clearFeedback() {
    setError('');
    setStatus('');
  }

  /** Escribe varios dígitos desde startIndex y mueve el foco al último tocado. */
  function distributeDigits(startIndex, rawValue) {
    const clean = rawValue.replace(/\D/g, '');
    if (!clean) return;

    setDigits((previous) => {
      const next = [...previous];
      let position = startIndex;
      for (const digit of clean) {
        if (position >= CODE_LENGTH) break;
        next[position] = digit;
        position += 1;
      }
      return next;
    });
    clearFeedback();

    const target = Math.min(startIndex + clean.length, CODE_LENGTH - 1);
    cellRefs.current[target]?.focus();
  }

  function handleChange(index, event) {
    const clean = event.target.value.replace(/\D/g, '');

    if (!clean) {
      setDigits((previous) => {
        const next = [...previous];
        next[index] = '';
        return next;
      });
      clearFeedback();
      return;
    }

    if (clean.length > 1) {
      distributeDigits(clean.length >= CODE_LENGTH ? 0 : index, clean);
      return;
    }

    setDigits((previous) => {
      const next = [...previous];
      next[index] = clean;
      return next;
    });
    clearFeedback();
    if (index < CODE_LENGTH - 1) cellRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        setDigits((previous) => {
          const next = [...previous];
          next[index] = '';
          return next;
        });
        clearFeedback();
        return;
      }
      if (index > 0) {
        setDigits((previous) => {
          const next = [...previous];
          next[index - 1] = '';
          return next;
        });
        clearFeedback();
        cellRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      cellRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      cellRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index, event) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    distributeDigits(pasted.length >= CODE_LENGTH ? 0 : index, pasted);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    const code = digits.join('');
    if (!/^\d{6}$/.test(code)) {
      setError('Ingresá los 6 dígitos del código.');
      setStatus('');
      const firstEmpty = digits.findIndex((digit) => !digit);
      cellRefs.current[Math.max(0, firstEmpty)]?.focus();
      return;
    }

    setSubmitting(true);
    setError('');
    setStatus('');
    try {
      const isValid = onVerify ? await onVerify(code) : true;
      if (!isValid) {
        setError('El código ingresado no es válido.');
      } else {
        setStatus('Código verificado correctamente.');
      }
    } catch {
      setError('No pudimos verificar el código. Intentá nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(event) {
    event.preventDefault();
    if (resending) return;

    setResending(true);
    setError('');
    setStatus('');
    try {
      const sent = onResend ? await onResend() : true;
      if (sent === false) {
        setError('No pudimos reenviar el código.');
      } else {
        setStatus('Te enviamos un nuevo código.');
      }
    } catch {
      setError('No pudimos reenviar el código.');
    } finally {
      setResending(false);
    }
  }

  return (
    <Modal
      title="Código de acceso"
      tone="info"
      icon="mail"
      onClose={onClose}
      describedBy={introId}
      initialFocusRef={firstCellRef}
      showCloseButton
    >
      <div className={styles.body}>
        <p id={introId} className={styles.intro}>
          Ingresá el código de 6 dígitos que enviamos a
          <strong className={styles.email}>{maskedEmail}</strong>
        </p>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div
            className={styles.codeRow}
            role="group"
            aria-label="Código de acceso de seis dígitos"
            aria-describedby={error ? errorId : undefined}
          >
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={setCellRef(index)}
                className={`${styles.cell} ${digit ? styles.cellFilled : ''} ${error ? styles.cellError : ''}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                aria-label={`Dígito ${index + 1} de 6`}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? errorId : undefined}
                value={digit}
                onChange={(event) => handleChange(index, event)}
                onFocus={(event) => event.target.select()}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
              />
            ))}
          </div>

          {error && (
            <p id={errorId} className={styles.error} role="alert">
              {error}
            </p>
          )}
          {status && (
            <p id={statusId} className={styles.status} role="status">
              {status}
            </p>
          )}

          <p className={styles.resendRow}>
            ¿No recibiste el código?{' '}
            <a
              className={styles.resend}
              href="#reenviar-codigo"
              aria-disabled={resending}
              onClick={handleResend}
            >
              {resending ? 'Reenviando…' : 'Reenviar código'}
            </a>
          </p>

          <Button
            type="submit"
            variant="primary"
            className={styles.submit}
            aria-disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Verificando…' : 'Verificar código'}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
