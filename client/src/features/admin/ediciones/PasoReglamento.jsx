import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

export const TIPOS_SUJETO = [
  { codigo: "COMPARSA", etiqueta: "Comparsa" },
  { codigo: "PERSONA", etiqueta: "Persona (figura nominada)" },
  { codigo: "PAREJA", etiqueta: "Pareja" },
  { codigo: "GRUPO", etiqueta: "Grupo" },
  { codigo: "TRAJE", etiqueta: "Traje" },
  { codigo: "CARRO", etiqueta: "Carro" },
  { codigo: "CARROZA_REINA", etiqueta: "Carroza de reina" },
  { codigo: "BATERIA", etiqueta: "Batería" },
  { codigo: "BANDA_MUSICAL", etiqueta: "Banda musical" },
  { codigo: "TEMA_INEDITO", etiqueta: "Tema inédito" },
];

function codigoDesdeNombre(nombre, existentes) {
  const base = nombre.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "RUBRO";
  const usados = new Set(existentes.map((r) => r.codigo.toUpperCase()));
  let codigo = base;
  for (let sufijo = 2; usados.has(codigo); sufijo += 1) codigo = `${base}_${sufijo}`;
  return codigo;
}

export function PasoReglamento({ edicion, versionActiva, especialidades, api, soloLectura }) {
  const idRubros = useId();
  const [escala, setEscala] = useState(null);
  const [rubros, setRubros] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [tipoRubro, setTipoRubro] = useState("NOMINATIVO");
  const [rubroAEliminar, setRubroAEliminar] = useState(null);
  const [recarga, setRecarga] = useState(0);

  const versionId = versionActiva?.id ?? null;
  const editable = !soloLectura && versionActiva?.estado === "BORRADOR";

  useEffect(() => {
    if (!versionId || typeof api.listarRubros !== "function") return;
    const controlador = new AbortController();
    async function cargar() {
      setError("");
      try {
        const [resRubros, resEscala] = await Promise.all([
          api.listarRubros(edicion.id, versionId, controlador.signal),
          typeof api.obtenerEscala === "function"
            ? api.obtenerEscala(edicion.id, versionId, controlador.signal)
            : Promise.resolve({ ok: true, cuerpo: null }),
        ]);
        if (controlador.signal.aborted) return;
        if (resRubros.ok) setRubros(resRubros.cuerpo.items ?? []);
        else setError(resRubros.cuerpo?.mensaje ?? "No se pudieron cargar los rubros.");

        if (resEscala.ok) {
          const actual = resEscala.cuerpo ?? null;
          if (!actual?.minimo && editable && typeof api.guardarEscala === "function") {
            const guardada = await api.guardarEscala(edicion.id, versionId, 1, 5);
            if (!controlador.signal.aborted && guardada.ok) {
              setEscala(guardada.cuerpo ?? { minimo: 1, maximo: 5 });
            }
          } else {
            setEscala(actual);
          }
        }
      } catch {
        if (!controlador.signal.aborted) setError("No se pudo cargar la evaluación. Revisá la conexión.");
      }
    }
    cargar();
    return () => controlador.abort();
  }, [api, edicion.id, versionId, editable, recarga]);

  if (!versionId) {
    return (
      <section className="admin-configuracion-grupo">
        <h3>Evaluación</h3>
        <p>Esta edición todavía no tiene una versión de reglamento disponible.</p>
      </section>
    );
  }

  async function crearRubro(evento) {
    evento.preventDefault();
    if (guardando || typeof api.crearRubro !== "function") return;
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nombre = String(datos.get("nombre") ?? "").trim();
    const tipoSujeto = String(datos.get("tipoSujeto") ?? "COMPARSA");
    const tipo = String(datos.get("tipoRubro") ?? "NOMINATIVO");
    const nominadosRaw = datos.get("nominadosMaximos");
    const orden = (rubros ?? []).reduce((max, r) => Math.max(max, r.orden ?? 0), 0) + 1;
    const codigo = codigoDesdeNombre(nombre, rubros ?? []);

    const cuerpo = {
      nombre,
      codigo,
      orden,
      tipoSujeto,
      tipoRubro: tipo,
      evaluable: true,
      ...(tipo === "ALEATORIO" && nominadosRaw ? { nominadosMaximos: Number(nominadosRaw) } : {}),
    };

    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.crearRubro(edicion.id, versionId, cuerpo);
      if (res.ok) {
        setRubros((prev) => [...(prev ?? []), res.cuerpo].sort((a, b) => a.orden - b.orden));
        form.reset();
        setTipoRubro("NOMINATIVO");
        setAviso(`Rubro «${res.cuerpo.nombre}» creado.`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo crear el rubro.");
      }
    } catch {
      setError("No se pudo crear el rubro. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarEspecialidad(rubro, especialidadId) {
    if (!editable || guardando || typeof api.asignarEspecialidadesRubro !== "function") return;
    const actuales = new Set(rubro.especialidadIds ?? []);
    if (actuales.has(especialidadId)) actuales.delete(especialidadId);
    else actuales.add(especialidadId);
    const siguiente = [...actuales];

    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.asignarEspecialidadesRubro(edicion.id, versionId, rubro.id, siguiente);
      if (res.ok) {
        setRubros((prev) => prev.map((r) => (r.id === rubro.id ? { ...r, especialidadIds: siguiente } : r)));
        setAviso(`Especialidades actualizadas para «${rubro.nombre}».`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudieron actualizar las especialidades del rubro.");
      }
    } catch {
      setError("No se pudo actualizar el rubro. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBorradoRubro() {
    if (!rubroAEliminar || guardando || typeof api.eliminarRubro !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.eliminarRubro(edicion.id, versionId, rubroAEliminar.id);
      if (res.ok) {
        setRubros((prev) => prev.filter((r) => r.id !== rubroAEliminar.id));
        setAviso(`Rubro «${rubroAEliminar.nombre}» eliminado.`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo eliminar el rubro.");
      }
      setRubroAEliminar(null);
    } catch {
      setError("No se pudo eliminar el rubro. Revisá la conexión.");
      setRubroAEliminar(null);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      {error && <p className="admin-aviso" role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <section aria-labelledby={idRubros} className="admin-configuracion-grupo">
        <div className={styles.itemCardHeader} style={{ marginBottom: "0.75rem" }}>
          <div>
            <h3 id={idRubros}>Rubros y especialidades</h3>
            <p className={styles.itemMeta}>
              Definí qué ítems se evalúan y marcá qué especialidad de jurado puntúa cada uno.
            </p>
          </div>
          <span className={styles.badgeOk}>
            {escala?.minimo && escala?.maximo ? `Escala: ${escala.minimo} a ${escala.maximo}` : "Escala 1 a 5 (automática)"}
          </span>
        </div>

        {rubros === null ? (
          <p role="status">Cargando rubros…</p>
        ) : (
          <>
            {rubros.length === 0 ? (
              <p>Todavía no hay rubros cargados.</p>
            ) : (
              <div className={styles.cardList}>
                {rubros.map((rubro) => (
                  <article key={rubro.id} className={styles.itemCard}>
                    <div className={styles.itemCardHeader}>
                      <div>
                        <h4 className={styles.itemTitle}>
                          {rubro.orden}. {rubro.nombre}
                        </h4>
                        <p className={styles.itemMeta}>
                          Evalúa: {rubro.tipoSujeto} · {rubro.tipoRubro === "ALEATORIO" ? `Aleatorio (máx. ${rubro.nominadosMaximos})` : "Nominativo"}
                        </p>
                      </div>
                      {editable && typeof api.eliminarRubro === "function" && (
                        <button
                          type="button"
                          disabled={guardando}
                          aria-label={`Eliminar rubro ${rubro.nombre}`}
                          onClick={() => setRubroAEliminar(rubro)}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>

                    <div className={styles.chipGroup} role="group" aria-label={`Especialidades de ${rubro.nombre}`}>
                      {especialidades.length === 0 ? (
                        <span className={styles.itemMeta}>Primero agregá especialidades en la etapa 1.</span>
                      ) : (
                        especialidades.map((esp) => {
                          const marcada = (rubro.especialidadIds ?? []).includes(esp.id);
                          return (
                            <label key={esp.id} className={styles.chipLabel}>
                              <input
                                type="checkbox"
                                checked={marcada}
                                disabled={!editable || guardando}
                                onChange={() => alternarEspecialidad(rubro, esp.id)}
                              />
                              <span>{esp.nombre}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {editable && typeof api.crearRubro === "function" && (
              <form onSubmit={crearRubro} aria-busy={guardando}>
                <label>
                  Nombre del rubro
                  <input name="nombre" required disabled={guardando} />
                </label>
                <label>
                  Qué evalúa
                  <select name="tipoSujeto" aria-label="Tipo de sujeto" defaultValue="COMPARSA" disabled={guardando}>
                    {TIPOS_SUJETO.map((t) => (
                      <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Modalidad
                  <select
                    name="tipoRubro"
                    value={tipoRubro}
                    onChange={(e) => setTipoRubro(e.target.value)}
                    disabled={guardando}
                  >
                    <option value="NOMINATIVO">Nominativo (todas las comparsas)</option>
                    <option value="ALEATORIO">Aleatorio (nominados)</option>
                  </select>
                </label>
                {tipoRubro === "ALEATORIO" && (
                  <label>
                    Nominados máximos
                    <input name="nominadosMaximos" type="number" min="1" step="1" required disabled={guardando} />
                  </label>
                )}
                <button type="submit" disabled={guardando}>
                  {guardando ? "Guardando…" : "Agregar rubro"}
                </button>
              </form>
            )}
          </>
        )}
        {error && (
          <button type="button" onClick={() => setRecarga((n) => n + 1)}>
            Reintentar carga
          </button>
        )}
      </section>

      {rubroAEliminar && (
        <Modal title="Eliminar rubro" onClose={() => setRubroAEliminar(null)}>
          <p>
            ¿Confirmás eliminar el rubro <strong>{rubroAEliminar.nombre}</strong>?
          </p>
          <button type="button" onClick={() => setRubroAEliminar(null)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={confirmarBorradoRubro}>
            Confirmar eliminación
          </button>
        </Modal>
      )}
    </>
  );
}
