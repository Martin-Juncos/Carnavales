/*
 * Pantalla de login "Portal de votación": compone fondo de plumas, tarjeta
 * magenta, tarjeta translúcida y orquesta los modales de error y código.
 * La autenticación y el OTP están simulados en lib/auth.js hasta integrar la API.
 * Depende de BrandPanel, LoginCard, FeatherBackground, modales y maskEmail.
 */
import { useState } from 'react';
import { BrandPanel } from '../BrandPanel/BrandPanel.jsx';
import { FeatherBackground } from '../FeatherBackground/FeatherBackground.jsx';
import { LoginCard } from '../LoginCard/LoginCard.jsx';
import { AccessCodeModal } from '../Modal/AccessCodeModal.jsx';
import { ErrorModal } from '../Modal/ErrorModal.jsx';
import {
  maskEmail,
  resendAccessCode,
  verifyAccessCode,
} from '../../lib/auth.js';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const [errorOpen, setErrorOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [authenticatedEmail, setAuthenticatedEmail] = useState('');

  function handleAuthenticated(email) {
    setAuthenticatedEmail(email);
    setErrorOpen(false);
    setCodeOpen(true);
  }

  return (
    <main className={styles.page}>
      <FeatherBackground />

      <div className={styles.content}>
        <div className={styles.brandSlot}>
          <BrandPanel />
        </div>
        <div className={styles.loginSlot}>
          <LoginCard
            onAuthenticated={handleAuthenticated}
            onInvalidCredentials={() => setErrorOpen(true)}
          />
        </div>
      </div>

      {errorOpen && <ErrorModal onClose={() => setErrorOpen(false)} />}

      {codeOpen && authenticatedEmail && (
        <AccessCodeModal
          maskedEmail={maskEmail(authenticatedEmail)}
          onClose={() => setCodeOpen(false)}
          onVerify={verifyAccessCode}
          onResend={() => resendAccessCode(authenticatedEmail)}
        />
      )}
    </main>
  );
}
