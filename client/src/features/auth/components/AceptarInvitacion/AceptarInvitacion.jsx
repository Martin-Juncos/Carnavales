/*
 * Pantalla de registro por invitación. Comparte la composición visual de LoginPage:
 * fondo de plumas, tarjeta magenta de marca y tarjeta blanca translúcida con el formulario.
 * Al crear la cuenta no inicia sesión; primero debe pasar por el inicio de sesión y código OTP.
 */
import { useId, useRef, useState } from 'react';
import isotipo from '../../../../assets/icons/isotipo.webp';
import { Button } from '../../../../components/Button/Button.jsx';
import { BrandPanel } from '../BrandPanel/BrandPanel.jsx';
import { FeatherBackground } from '../FeatherBackground/FeatherBackground.jsx';
import { limpiarTokenDeLaUrl, volverAlInicio } from '../../utils/ruta-invitacion.js';
import styles from './AceptarInvitacion.module.css';

// Límites de contraseña según la política de Better Auth del proyecto.
const MINIMO_CONTRASENA = 8;
const MAXIMO_CONTRASENA = 128;

// Mensajes para el usuario. Un enlace inválido no revela por qué falló.
const MENSAJES = {
  sinToken: 'El enlace de invitación no es válido. Pedí una nueva invitación al administrador.',
  generico: 'No se pudo crear la cuenta. Intentá de nuevo.',
};

function EyeIcon({ visible }) {
  return visible ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.74-2.1 2.02-3.95 3.68-5.32" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.05 11.05 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function AceptarInvitacion({ api, token, onCuentaCreada, onVolverAlInicio }) {
  const nombreId = useId();
  const contrasenaId = useId();
  const confirmacionId = useId();
  const nombreErrorId = `${nombreId}-error`;
  const contrasenaHintId = `${contrasenaId}-hint`;
  const contrasenaErrorId = `${contrasenaId}-error`;
  const confirmacionErrorId = `${confirmacionId}-error`;

  const nombreRef = useRef(null);
  const contrasenaRef = useRef(null);
  const confirmacionRef = useRef(null);

  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [errors, setErrors] = useState({});
  const [cargando, setCargando] = useState(false);

  function irAlInicio(evento) {
    evento?.preventDefault();
    if (onVolverAlInicio) {
      onVolverAlInicio();
    } else {
      volverAlInicio();
    }
  }

  async function aceptar(evento) {
    evento.preventDefault();
    if (cargando) return;

    const nombreLimpio = nombre.trim();
    const nextErrors = {};

    if (!nombreLimpio) {
      nextErrors.nombre = 'Ingresá tu nombre.';
    }
    if (contrasena.length < MINIMO_CONTRASENA) {
      nextErrors.contrasena = `La contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`;
    } else if (contrasena.length > MAXIMO_CONTRASENA) {
      nextErrors.contrasena = `La contraseña no puede superar los ${MAXIMO_CONTRASENA} caracteres.`;
    }
    if (!confirmacion) {
      nextErrors.confirmacion = 'Confirmá tu contraseña.';
    } else if (confirmacion !== contrasena) {
      nextErrors.confirmacion = 'Las contraseñas no coinciden.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.nombre) nombreRef.current?.focus();
      else if (nextErrors.contrasena) contrasenaRef.current?.focus();
      else confirmacionRef.current?.focus();
      return;
    }

    setCargando(true);
    try {
      const resultado = await api.aceptarInvitacion(token, nombreLimpio, contrasena);
      // El token ya se usó (o el enlace no sirve): se quita de la barra del navegador.
      limpiarTokenDeLaUrl();
      setContrasena('');
      setConfirmacion('');

      if (resultado.ok) {
        onCuentaCreada();
        return;
      }
      // La API envía un mensaje pensado para el usuario en 400 (enlace inválido) y 422 (datos no válidos).
      setErrors({ form: resultado.cuerpo?.mensaje ?? MENSAJES.generico });
    } catch {
      setErrors({ form: MENSAJES.generico });
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className={styles.page}>
      <FeatherBackground />

      <div className={styles.content}>
        <div className={styles.brandSlot}>
          <BrandPanel>
            <section className={styles.card} aria-labelledby="invitacion-titulo">
              <img
                className={styles.isotipo}
                src={isotipo}
                alt=""
                aria-hidden="true"
              />

              {!token ? (
                <div className={styles.invalidState}>
                  <header className={styles.header}>
                    <h2 id="invitacion-titulo" className={styles.heading}>
                      Invitación no válida
                    </h2>
                    <p className={styles.subtitle}>
                      No pudimos abrir el registro con este enlace.
                    </p>
                  </header>

                  <p className={styles.alertBox} role="alert">
                    {MENSAJES.sinToken}
                  </p>

                  <Button
                    type="button"
                    variant="secondary"
                    className={styles.submit}
                    onClick={irAlInicio}
                  >
                    Ir al inicio de sesión
                  </Button>
                </div>
              ) : (
                <>
                  <header className={styles.header}>
                    <h2 id="invitacion-titulo" className={styles.heading}>
                      Aceptar invitación
                    </h2>
                    <p className={styles.subtitle}>
                      Completá tus datos para activar tu cuenta.
                    </p>
                  </header>

                  <form className={styles.form} onSubmit={aceptar} noValidate>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={nombreId}>
                        Nombre
                      </label>
                      <input
                        ref={nombreRef}
                        id={nombreId}
                        className={styles.input}
                        type="text"
                        name="nombre"
                        placeholder="Tu nombre y apellido"
                        autoComplete="name"
                        value={nombre}
                        onChange={(e) => {
                          setNombre(e.target.value);
                          if (errors.nombre || errors.form) {
                            setErrors((current) => ({ ...current, nombre: '', form: '' }));
                          }
                        }}
                        aria-invalid={errors.nombre ? 'true' : undefined}
                        aria-describedby={errors.nombre ? nombreErrorId : undefined}
                        required
                      />
                      {errors.nombre && (
                        <p id={nombreErrorId} className={styles.error} role="alert">
                          {errors.nombre}
                        </p>
                      )}
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={contrasenaId}>
                        Contraseña
                      </label>
                      <div className={styles.inputWrap}>
                        <input
                          ref={contrasenaRef}
                          id={contrasenaId}
                          className={`${styles.input} ${styles.inputWithAction}`}
                          type={mostrarContrasena ? 'text' : 'password'}
                          name="contrasena"
                          placeholder={`Mínimo ${MINIMO_CONTRASENA} caracteres`}
                          autoComplete="new-password"
                          value={contrasena}
                          onChange={(e) => {
                            setContrasena(e.target.value);
                            if (errors.contrasena || errors.confirmacion || errors.form) {
                              setErrors((current) => ({
                                ...current,
                                contrasena: '',
                                confirmacion: '',
                                form: '',
                              }));
                            }
                          }}
                          aria-invalid={errors.contrasena ? 'true' : undefined}
                          aria-describedby={
                            errors.contrasena
                              ? `${contrasenaHintId} ${contrasenaErrorId}`
                              : contrasenaHintId
                          }
                          required
                        />
                        <button
                          type="button"
                          className={styles.toggleVisibility}
                          onClick={() => setMostrarContrasena((actual) => !actual)}
                          aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          aria-pressed={mostrarContrasena}
                        >
                          <EyeIcon visible={mostrarContrasena} />
                        </button>
                      </div>
                      <p id={contrasenaHintId} className={styles.hint}>
                        Entre {MINIMO_CONTRASENA} y {MAXIMO_CONTRASENA} caracteres. Podés usar espacios o frases.
                      </p>
                      {errors.contrasena && (
                        <p id={contrasenaErrorId} className={styles.error} role="alert">
                          {errors.contrasena}
                        </p>
                      )}
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={confirmacionId}>
                        Confirmar contraseña
                      </label>
                      <div className={styles.inputWrap}>
                        <input
                          ref={confirmacionRef}
                          id={confirmacionId}
                          className={`${styles.input} ${styles.inputWithAction}`}
                          type={mostrarConfirmacion ? 'text' : 'password'}
                          name="confirmacion"
                          placeholder="Repetí tu contraseña"
                          autoComplete="new-password"
                          value={confirmacion}
                          onChange={(e) => {
                            setConfirmacion(e.target.value);
                            if (errors.confirmacion || errors.form) {
                              setErrors((current) => ({ ...current, confirmacion: '', form: '' }));
                            }
                          }}
                          aria-invalid={errors.confirmacion ? 'true' : undefined}
                          aria-describedby={errors.confirmacion ? confirmacionErrorId : undefined}
                          required
                        />
                        <button
                          type="button"
                          className={styles.toggleVisibility}
                          onClick={() => setMostrarConfirmacion((actual) => !actual)}
                          aria-label={
                            mostrarConfirmacion
                              ? 'Ocultar confirmación de contraseña'
                              : 'Mostrar confirmación de contraseña'
                          }
                          aria-pressed={mostrarConfirmacion}
                        >
                          <EyeIcon visible={mostrarConfirmacion} />
                        </button>
                      </div>
                      {errors.confirmacion && (
                        <p id={confirmacionErrorId} className={styles.error} role="alert">
                          {errors.confirmacion}
                        </p>
                      )}
                    </div>

                    {errors.form && (
                      <p className={styles.alertBox} role="alert">
                        {errors.form}
                      </p>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      className={styles.submit}
                      disabled={cargando}
                      aria-busy={cargando}
                    >
                      {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
                    </Button>

                    <a className={styles.backLink} href="/" onClick={irAlInicio}>
                      ¿Ya tenés cuenta? Iniciar sesión
                    </a>
                  </form>
                </>
              )}
            </section>
          </BrandPanel>
        </div>
      </div>
    </main>
  );
}
