import { useEffect, useState } from "react";

// Consulta de salud de la API. Confirma que el proxy y el origen compartido funcionan.
export function App() {
  const [estado, setEstado] = useState("consultando");

  useEffect(() => {
    fetch("/health")
      .then((respuesta) => setEstado(respuesta.ok ? "conectado" : "sin conexión con la base"))
      .catch(() => setEstado("API no disponible"));
  }, []);

  return (
    <main>
      <h1>Carnavales · Votación</h1>
      <p>Estado de la API: {estado}</p>
    </main>
  );
}
