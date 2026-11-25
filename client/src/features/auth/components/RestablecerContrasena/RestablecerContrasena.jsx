import { useState } from "react";
import { limpiarTokenDeLaUrl } from "../../utils/ruta-invitacion.js";

// Longitud mínima de contraseña, según la política de Better Auth del diseño.
const minimoContrasena = 8;

// Pantalla del enlace de recuperación: elige la nueva contraseña con el token del enlace.
export function RestablecerContrasena({ api, token, onListo }) {
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);
  const [cargando, setCargando] = useState(false);

  if (!token) {
    return <p role="alert">El enlace no es válido o venció. Pedí uno nuevo desde el acceso.</p>;
  }

  async function cambiar(evento) {
    evento.preventDefault();
    if (contrasena.length < minimoContrasena) {
      setError(`La contraseña debe tener al menos ${minimoContrasena} caracteres.`);
      return;
    }
    setCargando(true);
    const resultado = await api.restablecerContrasena(token, contrasena);
    setContrasena("");
    setCargando(false);
    // El token ya se usó o venció: se quita de la barra en cualquier caso.
    limpiarTokenDeLaUrl();
    if (resultado.ok) {
      setListo(true);
    } else {
      setError("El enlace no es válido o venció. Pedí uno nuevo desde el acceso.");
    }
  }

  if (listo) {
    return (
      <section>
        <p role="status">Contraseña cambiada. Ya podés iniciar sesión con la nueva.</p>
        <button type="button" onClick={onListo}>Ir al acceso</button>
      </section>
    );
  }

  return (
    <form onSubmit={cambiar}>
      <h2>Nueva contraseña</h2>
      <label>
        Contraseña (mínimo {minimoContrasena} caracteres)
        <input type="password" autoComplete="new-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
      </label>
      <button type="submit" disabled={cargando}>Guardar contraseña</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
