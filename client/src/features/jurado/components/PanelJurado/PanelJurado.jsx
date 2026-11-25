import { useEffect, useState } from "react";
import { useEstadoConexion } from "../../hooks/use-estado-conexion.js";
import { CabeceraJurado } from "../CabeceraJurado/CabeceraJurado.jsx";
import { Planilla } from "../Planilla/Planilla.jsx";
import styles from "./PanelJurado.module.css";

function etiquetaEstadoNoche(estado) {
  if (estado === "OPEN") return { texto: "Abierta", clase: styles.badgeSuccess };
  if (estado === "CLOSED") return { texto: "Cerrada", clase: styles.badgeNeutral };
  return { texto: "En preparación", clase: styles.badgeWarning };
}

export function PanelJurado({ api, juradoId, guardar, nombre, onCambiarRol, onCerrarSesion }) {
  const [contextos, setContextos] = useState(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [seleccion, setSeleccion] = useState(null);
  const [estadoPlanilla, setEstadoPlanilla] = useState("");
  const enLinea = useEstadoConexion();

  useEffect(() => {
    let vigente = true;
    async function cargar() {
      try {
        const { ok, cuerpo } = await api.listarContextosJurado();
        if (!ok || !Array.isArray(cuerpo?.items)) throw new Error();
        if (vigente) setContextos(cuerpo.items);
      } catch {
        if (vigente) setError(true);
      }
    }
    cargar();
    return () => { vigente = false; };
  }, [api, intento]);

  function volverAlInicio() {
    setSeleccion(null);
    setEstadoPlanilla("");
  }

  return (
    <div className={`jurado-contenido ${styles.shell}`}>
      <CabeceraJurado
        contexto={seleccion}
        estadoPlanilla={estadoPlanilla}
        enLinea={enLinea}
        nombre={nombre}
        onCambiarRol={onCambiarRol}
        onCerrarSesion={onCerrarSesion}
      />
      <section aria-labelledby="titulo-planilla" className={styles.container}>
        {seleccion ? (
          <Planilla
            key={seleccion.asignacionId}
            api={api}
            juradoId={juradoId}
            guardar={guardar}
            contexto={seleccion}
            onVolver={volverAlInicio}
            onCambioEstado={setEstadoPlanilla}
          />
        ) : (
          <>
            <div className={styles.pageHeader}>
              <div>
                <h2 id="titulo-planilla" className={styles.pageTitle}>Planilla del jurado</h2>
                <p className={styles.pageSubtitle}>
                  Elegí una noche y especialidad asignada para evaluar. Tus puntuaciones se guardan localmente en este dispositivo.
                </p>
              </div>
            </div>

            {error ? (
              <div className={`${styles.stateCard} ${styles.stateCardDanger}`}>
                <p role="alert" className={styles.stateCopy}>
                  No se pudieron consultar las asignaciones. Revisá la conexión.
                </p>
                <div className={styles.stateActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => { setError(false); setIntento(intento + 1); }}
                  >
                    Volver a consultar
                  </button>
                </div>
              </div>
            ) : !contextos ? (
              <div className={styles.stateCard}>
                <p role="status" className={styles.stateCopy}>Cargando asignaciones…</p>
              </div>
            ) : contextos.length === 0 ? (
              <div className={styles.stateCard}>
                <p className={styles.stateCopy}>No tenés asignaciones activas.</p>
              </div>
            ) : (
              <ul className={styles.contextGrid}>
                {contextos.map((contexto) => {
                  const badgeNoche = etiquetaEstadoNoche(contexto.noche.estado);
                  return (
                    <li key={contexto.asignacionId}>
                      <button
                        type="button"
                        className={`${styles.contextCard} ${contexto.noche.estado === "OPEN" ? styles.contextCardOpen : ""}`}
                        onClick={() => setSeleccion(contexto)}
                      >
                        <div className={styles.contextMetaRow}>
                          <span className={styles.contextEdition}>{contexto.noche.edicion.nombre}</span>
                          <span className={`${styles.badge} ${badgeNoche.clase}`}>{badgeNoche.texto}</span>
                        </div>
                        <span className={styles.contextNight}>{contexto.noche.nombre}</span>
                        <span className={styles.contextSpec}>{contexto.especialidad.nombre}</span>
                        <span className={styles.contextCta}>
                          {contexto.noche.estado === "OPEN" ? "Abrir planilla →" : "Ver planilla →"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
