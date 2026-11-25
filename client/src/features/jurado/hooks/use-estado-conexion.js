import { useEffect, useState } from "react";

export function useEstadoConexion() {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    function conectar() { setEnLinea(true); }
    function desconectar() { setEnLinea(false); }
    window.addEventListener("online", conectar);
    window.addEventListener("offline", desconectar);
    return () => {
      window.removeEventListener("online", conectar);
      window.removeEventListener("offline", desconectar);
    };
  }, []);
  return enLinea;
}
