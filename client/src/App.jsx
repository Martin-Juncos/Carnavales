import { useEffect, useState } from "react";

// Pantalla principal provisional. Muestra si la API responde, para confirmar que el proxy
// (en desarrollo) o el mismo origen (en producción) funcionan.
export function App() {
  // Estado de la conexión: "consultando" mientras espera la respuesta, luego el resultado.
  const [estado, setEstado] = useState("consultando");

  // Al montar el componente, consulta /health una sola vez (el arreglo de dependencias está vacío).
  useEffect(() => {
    fetch("/health")
      // 200 significa que la API y la base responden; cualquier otro código es un problema de la base.
      .then((respuesta) => setEstado(respuesta.ok ? "conectado" : "sin conexión con la base"))
      // Un error de red (la API no está levantada o no es alcanzable) cae aquí.
      .catch(() => setEstado("API no disponible"));
  }, []);

  return (
    <main>
      <h1>Carnavales · Votación</h1>
      <p>Estado de la API: {estado}</p>
    </main>
  );
}
