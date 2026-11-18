/*
 * Composición raíz del cliente. Por ahora expone únicamente la pantalla de
 * login "Portal de votación"; las rutas autenticadas se integrarán después.
 * Depende de LoginPage.
 */
import { LoginPage } from './components/LoginPage/LoginPage.jsx';

export default function App() {
  return <LoginPage />;
}
