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

// Trazos de los íconos del encabezado; el color lo define el tono del diálogo.
const ICONOS = {
  info: 'M12 11v5M12 8h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  star: 'M12 3l2.7 5.6 6.1 0.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-0.9z',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
};

const ICONO_POR_TONO = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  danger: 'alert',
  vote: 'star',
};

export function Modal({
  title,
  children,
  footer,
  onClose,
  initialFocusRef,
  describedBy,
  showCloseButton = false,
  tone = 'info',
  icon,
}) {
  const iconoNombre = icon ?? ICONO_POR_TONO[tone] ?? 'info';
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
        <header className={styles.header}>
          <span className={`${styles.badge} ${styles[tone] ?? styles.info}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
              <path d={ICONOS[iconoNombre] ?? ICONOS.info} />
            </svg>
          </span>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        </header>
        <div className={styles.content}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
