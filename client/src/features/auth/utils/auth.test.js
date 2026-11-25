/*
 * Pruebas de las utilidades de acceso: validación y enmascarado del correo, y las operaciones
 * de acceso sobre un cliente de API falso. Depende de vitest y de lib/auth.js.
 */
import { describe, expect, it } from 'vitest';
import { crearAcceso, isValidEmail, maskEmail, validarContrasena } from './auth.js';

const respuesta = (ok, status = ok ? 200 : 401, cuerpo = {}) => ({ ok, status, cuerpo });

function apiFalsa(sobrescritos = {}) {
  return {
    iniciarSesion: async () => respuesta(true, 200, { twoFactorRedirect: true }),
    pedirCodigo: async () => respuesta(true),
    verificarCodigo: async () => respuesta(true),
    ...sobrescritos,
  };
}

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

describe('validarContrasena', () => {
  it('exige al menos 8 caracteres', () => {
    expect(validarContrasena('')).toBe('Ingresá una contraseña.');
    expect(validarContrasena('corta')).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('acepta contraseñas dentro del límite de Better Auth', () => {
    expect(validarContrasena('contraseña-larga')).toBe('');
    expect(validarContrasena('x'.repeat(128))).toBe('');
    expect(validarContrasena('x'.repeat(129))).toBe(
      'La contraseña no puede superar los 128 caracteres.',
    );
  });
});

describe('crearAcceso.authenticate', () => {
  const credenciales = { email: 'ana@example.test', password: 'contraseña' };

  it('pide el código cuando la contraseña es correcta y el servidor pide el segundo factor', async () => {
    let codigoPedido = false;
    const acceso = crearAcceso(apiFalsa({ pedirCodigo: async () => ((codigoPedido = true), respuesta(true)) }));

    await expect(acceso.authenticate(credenciales)).resolves.toBe(true);
    expect(codigoPedido).toBe(true);
  });

  it('rechaza credenciales incorrectas sin pedir código', async () => {
    let codigoPedido = false;
    const acceso = crearAcceso(
      apiFalsa({
        iniciarSesion: async () => respuesta(false, 401),
        pedirCodigo: async () => ((codigoPedido = true), respuesta(true)),
      }),
    );

    await expect(acceso.authenticate(credenciales)).resolves.toBe(false);
    expect(codigoPedido).toBe(false);
  });

  it('rechaza si el código no se pudo enviar', async () => {
    const acceso = crearAcceso(apiFalsa({ pedirCodigo: async () => respuesta(false, 429) }));
    await expect(acceso.authenticate(credenciales)).resolves.toBe(false);
  });
});

describe('crearAcceso.verifyAccessCode y resendAccessCode', () => {
  it('devuelve el resultado de la verificación del código', async () => {
    await expect(crearAcceso(apiFalsa()).verifyAccessCode('123456')).resolves.toBe(true);
    const rechazada = crearAcceso(apiFalsa({ verificarCodigo: async () => respuesta(false, 401) }));
    await expect(rechazada.verifyAccessCode('000000')).resolves.toBe(false);
  });

  it('devuelve el resultado del reenvío del código', async () => {
    await expect(crearAcceso(apiFalsa()).resendAccessCode()).resolves.toBe(true);
    const fallido = crearAcceso(apiFalsa({ pedirCodigo: async () => respuesta(false, 503) }));
    await expect(fallido.resendAccessCode()).resolves.toBe(false);
  });
});
