/*
 * Pruebas de las utilidades de autenticación y enmascaramiento.
 * Cubren validación de email, formato del email enmascarado y la cuenta demo.
 * Depende de vitest y de lib/auth.js.
 */
import { describe, expect, it } from 'vitest';
import {
  DEMO_CREDENTIALS,
  authenticate,
  isValidEmail,
  maskEmail,
} from './auth.js';

describe('isValidEmail', () => {
  it('acepta emails con usuario, dominio y TLD', () => {
    expect(isValidEmail('jurado@carnavalesgoyanos.gob.ar')).toBe(true);
    expect(isValidEmail('  persona@example.com  ')).toBe(true);
  });

  it('rechaza emails incompletos o con espacios internos', () => {
    expect(isValidEmail('sin-arroba.com')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@example.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('maskEmail', () => {
  it('reproduce el formato a*****@*******.com', () => {
    expect(maskEmail('ana@ejemplo.com')).toBe('a**@*******.com');
    expect(maskEmail('jurado@carnavalesgoyanos.gob.ar')).toBe(
      'j*****@*****************.***.ar',
    );
  });

  it('devuelve el valor original si no es un email reconocible', () => {
    expect(maskEmail('sin-arroba')).toBe('sin-arroba');
    expect(maskEmail('')).toBe('');
  });
});

describe('authenticate', () => {
  it('acepta solo las credenciales demo y normaliza mayúsculas', async () => {
    await expect(
      authenticate({
        email: DEMO_CREDENTIALS.email.toUpperCase(),
        password: DEMO_CREDENTIALS.password,
      }),
    ).resolves.toBe(true);

    await expect(
      authenticate({
        email: DEMO_CREDENTIALS.email,
        password: 'incorrecta',
      }),
    ).resolves.toBe(false);
  });
});
