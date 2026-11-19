/*
 * Modal base accesible y reutilizable: portal a <body>, overlay oscuro,
 * role="dialog", aria-modal, cierre con Escape, foco atrapado y restaurado.
 * Expone Modal; depende de react, Button y Modal.module.css.
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../Button/Button.jsx';
import styles from './Modal.module.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(dialog) {
  if (!dialog) return [];
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
}

export function Modal({
  title,
  children,
  onClose,
  initialFocusRef,
  describedBy,
  showCloseButton = false,
}) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = initialFocusRef?.current ?? getFocusable(dialog)[0] ?? dialog;
    focusTarget.focus();

    // Escape cierra y Tab/Shift+Tab ciclan dentro del diálogo.
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusIsOutside = !dialog.contains(active);

      if (event.shiftKey && (active === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [initialFocusRef]);

  return createPortal(
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {showCloseButton && (
          <Button
            variant="secondary"
            className={styles.close}
            aria-label="Cerrar"
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        )}
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
