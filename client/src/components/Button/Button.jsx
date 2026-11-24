/*
 * Botón base reutilizable con variantes primary, error y secondary.
 * Expone Button (forwardRef) para que modales y formularios puedan enfocarlo.
 * Depende de Button.module.css y de los tokens de styles/tokens.css.
 */
import { forwardRef } from 'react';
import styles from './Button.module.css';

export const Button = forwardRef(function Button(
  { variant = 'primary', className = '', type = 'button', ...props },
  ref,
) {
  const classes = [styles.button, styles[variant], className]
    .filter(Boolean)
    .join(' ');

  return <button ref={ref} type={type} className={classes} {...props} />;
});
