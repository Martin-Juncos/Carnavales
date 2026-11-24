import { useState } from "react";
import { limpiarTokenDeLaUrl } from "./ruta-invitacion.js";

// Longitud mínima de contraseña, según la política de Better Auth del diseño.
const minimoContrasena = 8;

// Mensajes para el usuario. Un enlace inválido no revela por qué falló.
const mensajes = {
  sinToken: "El enlace de invitación no es válido. Pedí una nueva invitación al administrador.",
  generico: "No se pudo crear la cuenta. Intentá de nuevo.",
};

// Pantalla para aceptar una invitación: el usuario elige su nombre y contraseña.
// Al crear la cuenta no inicia sesión; primero debe pasar por el código de acceso.
export function AceptarInvitacion({ api, token, onCuentaCreada }) {
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // Sin token no hay nada que aceptar: se muestra el error sin llamar a la API.
  if (!token) {
    return (
      <section>
        <h2>Invitación</h2>
        <p role="alert">{mensajes.sinToken}</p>
      </section>
    );
  }

  async function aceptar(evento) {
    evento.preventDefault();
    if (contrasena.length < minimoContrasena) {
      setError(`La contraseña debe tener al menos ${minimoContrasena} caracteres.`);
      return;
    }
    setCargando(true);
    const resultado = await api.aceptarInvitacion(token, nombre.trim(), contrasena);
    // El token ya se usó (o el enlace no sirve): se quita de la barra del navegador.
    limpiarTokenDeLaUrl();
    setContrasena("");
    setCargando(false);
    if (resultado.ok) {
      onCuentaCreada();
      return;
    }
    // La API envía un mensaje pensado para el usuario en 400 (enlace inválido) y 422 (datos no válidos).
    setError(resultado.cuerpo?.mensaje ?? mensajes.generico);
  }

  return (
    <form onSubmit={aceptar}>
      <h2>Aceptar invitación</h2>
      <label>
        Nombre
        <input autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>
      <label>
        Contraseña (mínimo {minimoContrasena} caracteres)
        <input type="password" autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
      </label>
      <button type="submit" disabled={cargando}>Crear cuenta</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
