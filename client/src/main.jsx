import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles/tokens.css";
import "./styles/global.css";

// Punto de entrada del cliente: monta la aplicación dentro de #root.
// Los design tokens se cargan antes que los estilos globales.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
