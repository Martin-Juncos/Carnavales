import { useEffect, useState } from "react";
import { crearClienteApi } from "./cliente-api.js";
import { esperaOtpSegundos, segundosRestantes } from "./espera-otp.js";

// Mensajes que se muestran al usuario. No revelan si el correo existe ni detalles internos.
const mensajes = {
  credenciales: "Correo o contraseña incorrectos.",
  codigo: "Código incorrecto o vencido. Pedí uno nuevo.",
  generico: "No se pudo completar la operación. Intentá de nuevo.",
};

// Pantalla de acceso en dos pasos: correo y contraseña, luego el código enviado al correo.
// api se puede reemplazar en pruebas.
// Cliente por defecto a nivel de módulo, para que su referencia no cambie en cada render.
const apiPorDefecto = crearClienteApi();

export function Acceso({ api = apiPorDefecto, onSesionIniciada }) {
  // paso: "credenciales" o "codigo".
  const [paso, setPaso] = useState("credenciales");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  // Momento (ms) del último envío de código y "ahora" para calcular la espera restante.
  const [ultimoEnvio, setUltimoEnvio] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());

  // Mientras se espera el reenvío, actualiza "ahora" cada segundo para refrescar la cuenta regresiva.
  useEffect(() => {
    if (paso !== "codigo") return undefined;
    const intervalo = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [paso]);

  const esperaRestante = segundosRestantes(ultimoEnvio, ahora, esperaOtpSegundos);

  // Pide el código al servidor y arranca la espera de 30 segundos si se envió.
  async function enviarCodigo() {
    const resultado = await api.pedirCodigo();
    if (resultado.ok) {
      const momento = Date.now();
      setUltimoEnvio(momento);
      setAhora(momento);
      setError("");
      return true;
    }
    // Un 429 o 503 trae un mensaje del servidor pensado para el usuario.
    setError(resultado.cuerpo?.message ?? mensajes.generico);
    return false;
  }

  // Paso 1: contraseña. Si es correcta, el servidor pide el segundo factor y se envía el código.
  async function iniciarSesion(evento) {
    evento.preventDefault();
    setCargando(true);
    const resultado = await api.iniciarSesion(email, password);
    setPassword("");
    if (resultado.ok && resultado.cuerpo?.twoFactorRedirect) {
      setPaso("codigo");
      await enviarCodigo();
    } else if (resultado.status === 401) {
      setError(mensajes.credenciales);
    } else {
      setError(resultado.cuerpo?.message ?? mensajes.generico);
    }
    setCargando(false);
  }

  // Paso 2: verifica el código y consulta la sesión para saber quién entró.
  async function verificar(evento) {
    evento.preventDefault();
    setCargando(true);
    const resultado = await api.verificarCodigo(code);
    if (resultado.ok) {
      const sesion = await api.obtenerSesion();
      onSesionIniciada?.(sesion.cuerpo?.user ?? null);
    } else {
      setError(resultado.status === 401 ? mensajes.codigo : resultado.cuerpo?.message ?? mensajes.generico);
    }
    setCargando(false);
  }

  // Vuelve al primer paso y descarta lo escrito en el segundo.
  function volver() {
    setPaso("credenciales");
    setCode("");
    setError("");
    setUltimoEnvio(null);
  }

  if (paso === "credenciales") {
    return (
      <form onSubmit={iniciarSesion}>
        <h2>Iniciar sesión</h2>
        <label>
          Correo
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={cargando}>Continuar</button>
        {error && <p role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={verificar}>
      <h2>Código de acceso</h2>
      <p>Enviamos un código de 6 dígitos a tu correo.</p>
      <label>
        Código
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} required />
      </label>
      <button type="submit" disabled={cargando}>Verificar</button>
      <button type="button" onClick={enviarCodigo} disabled={cargando || esperaRestante > 0}>
        {esperaRestante > 0 ? `Reenviar en ${esperaRestante} s` : "Reenviar código"}
      </button>
      <button type="button" onClick={volver}>Volver</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
