/*
 * Punto de entrada del cliente React: monta <App /> dentro de #root.
 * Importa primero los design tokens y luego los estilos globales.
 * Depende de react-dom/client, App.jsx y styles/.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
