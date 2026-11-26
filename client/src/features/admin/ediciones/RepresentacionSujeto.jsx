import { useState } from "react";
import { Button } from "../../../components/Button/Button.jsx";
import styles from "./ConfiguracionEdicion.module.css";

export const LARGO_MAXIMO_REPRESENTACION = 1000;

// Texto «Representa: …» de un sujeto. El valor lo controla quien lo muestra; aquí solo se edita
// y se avisa al guardar, para que la lista siempre muestre lo que quedó en la base.
export function RepresentacionSujeto({ api, edicionId, sujetoId, nombre, valor, soloLectura = false, alGuardar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  function empezarEdicion() {
    setTexto(valor ?? "");
    setError("");
    setEditando(true);
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setError("");
    try {
      const res = await api.actualizarSujeto(edicionId, sujetoId, { representacion: texto });
      if (res.ok) {
        setEditando(false);
        alGuardar?.(res.cuerpo?.representacion ?? null);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo guardar la representación.");
      }
    } catch {
      setError("No se pudo guardar la representación. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <form onSubmit={guardar} aria-busy={guardando} className={styles.formIntegrante}>
        <label>
          Representa
          <textarea
            value={texto}
            maxLength={LARGO_MAXIMO_REPRESENTACION}
            rows={3}
            disabled={guardando}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <p className={styles.itemMeta}>{texto.length}/{LARGO_MAXIMO_REPRESENTACION}</p>
        {error && <p role="alert" className="admin-aviso">{error}</p>}
        <div className={styles.inlineActions}>
          <Button type="submit" variant="primary" disabled={guardando}>Guardar representación</Button>
          <Button variant="secondary" disabled={guardando} onClick={() => setEditando(false)}>Cancelar</Button>
        </div>
      </form>
    );
  }

  return (
    <div>
      {valor ? (
        <p className={styles.itemMeta}>Representa: {valor}</p>
      ) : (
        !soloLectura && <p className={styles.itemMeta}>Sin representación cargada.</p>
      )}
      {!soloLectura && (
        <button type="button" aria-label={`Editar representación de ${nombre}`} onClick={empezarEdicion}>
          Editar representación
        </button>
      )}
    </div>
  );
}
