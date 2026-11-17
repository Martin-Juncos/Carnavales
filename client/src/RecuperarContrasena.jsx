import { useState } from "react";

// Pide el enlace de recuperación. El mensaje no revela si el correo existe.
export function RecuperarContrasena({ api, onVolver }) {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function pedir(evento) {
    evento.preventDefault();
    setCargando(true);
    // La URL de retorno usa el origen del cliente: la API lo acepta como origen confiable.
    const resultado = await api.pedirRecuperacion(email.trim(), `${window.location.origin}/restablecer-contrasena`);
    setCargando(false);
    if (resultado.ok) {
      setEnviado(true);
      setError("");
    } else {
      setError("No se pudo enviar el pedido. Intentá de nuevo más tarde.");
    }
  }

  if (enviado) {
    return (
      <section>
        <p role="status">Si el correo existe, te enviamos un enlace para cambiar la contraseña.</p>
        <button type="button" onClick={onVolver}>Volver al acceso</button>
      </section>
    );
  }

  return (
    <form onSubmit={pedir}>
      <h2>Recuperar contraseña</h2>
      <label>
        Correo
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <button type="submit" disabled={cargando}>Enviar enlace</button>{" "}
      <button type="button" onClick={onVolver}>Volver</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
