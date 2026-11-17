import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";

// Punto de entrada del cliente: monta la aplicación React dentro del <div id="root"> de index.html.
createRoot(document.getElementById("root")).render(
  // StrictMode activa advertencias extra en desarrollo para detectar efectos secundarios mal escritos.
  <StrictMode>
    <App />
  </StrictMode>,
);
