/*
 * Pantalla de acceso "Portal de votación". Conecta la tarjeta de acceso y los modales con la API:
 * contraseña, código OTP y sesión. Depende de LoginCard, AccessCodeModal, ErrorModal y lib/auth.js.
 */
import { useMemo, useState } from 'react';
import { BrandPanel } from '../BrandPanel/BrandPanel.jsx';
import { FeatherBackground } from '../FeatherBackground/FeatherBackground.jsx';
import { LoginCard } from '../LoginCard/LoginCard.jsx';
import { AccessCodeModal } from '../AccessCodeModal/AccessCodeModal.jsx';
import { ErrorModal } from '../../../../components/Modal/ErrorModal.jsx';
import { crearAcceso, maskEmail } from '../../utils/auth.js';
import styles from './LoginPage.module.css';

export function LoginPage({ api, onSesionIniciada, onRecuperar }) {
  const [errorOpen, setErrorOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [authenticatedEmail, setAuthenticatedEmail] = useState('');
  const acceso = useMemo(() => crearAcceso(api), [api]);

  function handleAuthenticated(email) {
    setAuthenticatedEmail(email);
    setErrorOpen(false);
    setCodeOpen(true);
  }

  // Verifica el código y, si es correcto, consulta la sesión para saber quién entró.
  async function verificar(code) {
    const valido = await acceso.verifyAccessCode(code);
    if (valido) {
      const sesion = await api.obtenerSesion();
      onSesionIniciada?.(sesion.cuerpo?.user ?? null);
    }
    return valido;
  }

  return (
    <main className={styles.page}>
      <FeatherBackground />

      <div className={styles.content}>
        <BrandPanel>
          <LoginCard
            authenticate={acceso.authenticate}
            onAuthenticated={handleAuthenticated}
            onInvalidCredentials={() => setErrorOpen(true)}
            onRecuperar={onRecuperar}
          />
        </BrandPanel>
      </div>

      {errorOpen && <ErrorModal onClose={() => setErrorOpen(false)} />}

      {codeOpen && authenticatedEmail && (
        <AccessCodeModal
          maskedEmail={maskEmail(authenticatedEmail)}
          onClose={() => setCodeOpen(false)}
          onVerify={verificar}
          onResend={() => acceso.resendAccessCode()}
        />
      )}
    </main>
  );
}
