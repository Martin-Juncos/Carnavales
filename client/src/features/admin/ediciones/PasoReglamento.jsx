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
  const [rubros, setRubros] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [tipoSujetoForm, setTipoSujetoForm] = useState("COMPARSA");
  const [tipoRubro, setTipoRubro] = useState("NOMINATIVO");
  const [rubroAEliminar, setRubroAEliminar] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [categorias, setCategorias] = useState(null);
  const [categoriaAEliminar, setCategoriaAEliminar] = useState(null);
  const idCategorias = useId();

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
            if (!controlador.signal.aborted && !guardada.ok) {
              setError(guardada.cuerpo?.mensaje ?? "No se pudo aplicar la escala fija de 1 a 5.");
            }
          }
        }
      } catch {
        if (!controlador.signal.aborted) setError("No se pudo cargar la evaluación. Revisá la conexión.");
      }
    }
    cargar();
    return () => controlador.abort();
  }, [api, edicion.id, versionId, editable, recarga]);

  // Categorías del reglamento: agrupan rubros de esta versión (solo agrupan, no cambian puntajes).
  useEffect(() => {
    if (!versionId || typeof api.listarCategoriasRubro !== "function") return;
    const controlador = new AbortController();
    api.listarCategoriasRubro(edicion.id, versionId, controlador.signal).then((res) => {
      if (!controlador.signal.aborted && res.ok) setCategorias(res.cuerpo.items ?? []);
    }).catch(() => {});
    return () => controlador.abort();
  }, [api, edicion.id, versionId, recarga]);

  if (!versionId) {
    return (
      <section className="admin-configuracion-grupo">
        <h3>Evaluación</h3>
        <p>Esta edición todavía no tiene una versión de reglamento disponible.</p>
      </section>
    );
  }

  // Escribe el nombre de la categoría; después se crean sus rubros desde el formulario de rubros.
  async function crearCategoria(evento) {
    evento.preventDefault();
    if (guardando || typeof api.crearCategoriaRubro !== "function") return;
    const form = evento.currentTarget;
    const nombre = String(new FormData(form).get("nombre") ?? "").trim();
    const orden = (categorias ?? []).reduce((maximo, c) => Math.max(maximo, c.orden ?? 0), 0) + 1;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.crearCategoriaRubro(edicion.id, versionId, { nombre, orden });
      if (res.ok) {
        setCategorias((prev) => [...(prev ?? []), res.cuerpo].sort((a, b) => a.orden - b.orden));
        form.reset();
        setAviso(`Categoría «${res.cuerpo.nombre}» creada. Ahora podés crear sus rubros.`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo crear la categoría.");
      }
    } catch {
      setError("No se pudo crear la categoría. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBorradoCategoria() {
    if (!categoriaAEliminar || guardando || typeof api.eliminarCategoriaRubro !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.eliminarCategoriaRubro(edicion.id, versionId, categoriaAEliminar.id);
      if (res.ok) {
        setCategorias((prev) => (prev ?? []).filter((c) => c.id !== categoriaAEliminar.id));
        setAviso(`Categoría «${categoriaAEliminar.nombre}» eliminada.`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo eliminar la categoría.");
      }
      setCategoriaAEliminar(null);
    } catch {
      setError("No se pudo eliminar la categoría.");
      setCategoriaAEliminar(null);
    } finally {
      setGuardando(false);
    }
  }

  async function crearRubro(evento) {
    evento.preventDefault();
    if (guardando || typeof api.crearRubro !== "function") return;
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nombre = String(datos.get("nombre") ?? "").trim();
    const tipoSujeto = tipoSujetoForm;
    const tipo = String(datos.get("tipoRubro") ?? "NOMINATIVO");
    const nominadosPorComparsaRaw = datos.get("nominadosMaximosPorComparsa");
    const orden = (rubros ?? []).reduce((max, r) => Math.max(max, r.orden ?? 0), 0) + 1;
    const codigo = codigoDesdeNombre(nombre, rubros ?? []);

    const cuerpo = {
      nombre,
      codigo,
      orden,
      tipoSujeto,
      tipoRubro: tipo,
      evaluable: true,
      categoriaId: String(datos.get("categoriaId") ?? "") || null,
      ...(tipo === "ALEATORIO" && nominadosPorComparsaRaw
        ? { nominadosMaximosPorComparsa: Number(nominadosPorComparsaRaw) }
        : {}),
    };

    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.crearRubro(edicion.id, versionId, cuerpo);
      if (res.ok) {
        setRubros((prev) => [...(prev ?? []), res.cuerpo].sort((a, b) => a.orden - b.orden));
        form.reset();
        setTipoSujetoForm("COMPARSA");
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

  async function alternarRequiereParticipante(rubro) {
    if (!editable || guardando || typeof api.actualizarRubro !== "function") return;
    const siguienteTipo = rubro.tipoSujeto === "PERSONA" ? "COMPARSA" : "PERSONA";

    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.actualizarRubro(edicion.id, versionId, rubro.id, { tipoSujeto: siguienteTipo });
      if (res.ok) {
        setRubros((prev) => prev.map((r) => (r.id === rubro.id ? { ...r, ...res.cuerpo } : r)));
        setAviso(
          siguienteTipo === "PERSONA"
            ? `«${rubro.nombre}» ahora requiere nombre de participante.`
            : `«${rubro.nombre}» ahora evalúa a la comparsa sin nombre individual.`,
        );
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo actualizar el rubro.");
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
        // Los rubros que quedan se renumeran 1, 2, 3… sin huecos, y se guarda solo lo que cambió de número.
        const restantes = (rubros ?? [])
          .filter((r) => r.id !== rubroAEliminar.id)
          .sort((a, b) => a.orden - b.orden);
        const numerados = restantes.map((r, indice) => ({ ...r, orden: indice + 1 }));
        const cambios = numerados
          .filter((r, indice) => restantes[indice].orden !== r.orden)
          .map((r) => ({ rubroId: r.id, orden: r.orden }));
        setRubros(numerados);
        setAviso(`Rubro «${rubroAEliminar.nombre}» eliminado.`);
        if (cambios.length > 0 && typeof api.reordenarRubros === "function") {
          const renumerado = await api.reordenarRubros(edicion.id, versionId, cambios);
          if (!renumerado.ok) {
            setError(renumerado.cuerpo?.mensaje ?? "El rubro se eliminó, pero no se pudo renumerar la lista.");
          }
        }
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

      <p className={styles.itemMeta}>
        La versión del reglamento se crea automáticamente. En esta etapa definí
        las categorías y los rubros; publicala desde «Planilla y apertura»
        después de sincronizar las planillas.
      </p>

      <section aria-labelledby={idCategorias} className="admin-configuracion-grupo">
        <h3 id={idCategorias}>Categorías</h3>
        <p className={styles.itemMeta}>
          Escribí el nombre de la categoría (por ejemplo, Reina) y después creá sus rubros. Sirve para agrupar rubros y elegir la categoría de cada integrante.
        </p>

        {categorias === null ? (
          <p role="status">Cargando categorías…</p>
        ) : categorias.length === 0 ? (
          <p>Todavía no hay categorías. Creá la primera para agrupar rubros.</p>
        ) : (
          <ul className={styles.cardList} style={{ listStyle: "none", padding: 0 }}>
            {categorias.map((categoria) => {
              const cantidad = (rubros ?? []).filter((r) => r.categoriaId === categoria.id).length;
              return (
                <li key={categoria.id} className={styles.itemCard}>
                  <div className={styles.itemCardHeader}>
                    <div>
                      <h4 className={styles.itemTitle}>{categoria.nombre}</h4>
                      <p className={styles.itemMeta}>{cantidad} rubro(s)</p>
                    </div>
                    {editable && typeof api.eliminarCategoriaRubro === "function" && (
                      <button
                        type="button"
                        disabled={guardando}
                        aria-label={`Eliminar categoría ${categoria.nombre}`}
                        onClick={() => setCategoriaAEliminar(categoria)}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {editable && typeof api.crearCategoriaRubro === "function" && (
          <form onSubmit={crearCategoria} aria-busy={guardando}>
            <label>
              Nombre de la categoría
              <input name="nombre" required disabled={guardando} />
            </label>
            <button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Agregar categoría"}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby={idRubros} className="admin-configuracion-grupo">
        <div className={styles.itemCardHeader} style={{ marginBottom: "0.75rem" }}>
          <div>
            <h3 id={idRubros}>Rubros y especialidades</h3>
            <p className={styles.itemMeta}>
              Definí qué ítems se evalúan y marcá qué especialidad de jurado puntúa cada uno.
            </p>
          </div>
          <span className={styles.badgeOk}>
            Escala fija: 1 a 5
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
                          {categorias?.find((c) => c.id === rubro.categoriaId)?.nombre
                            ? `Categoría: ${categorias.find((c) => c.id === rubro.categoriaId).nombre} · `
                            : ""}
                          Evalúa: {rubro.tipoSujeto} ·{" "}
                          {rubro.tipoRubro === "ALEATORIO"
                            ? rubro.nominadosMaximosPorComparsa
                              ? `Aleatorio (máx. ${rubro.nominadosMaximosPorComparsa} por comparsa)`
                              : `Aleatorio (máx. ${rubro.nominadosMaximos} en total)`
                            : "Nominativo"}
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
                    {editable && typeof api.actualizarRubro === "function" && (
                      <label className="admin-casilla" style={{ marginTop: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={rubro.tipoSujeto === "PERSONA"}
                          disabled={guardando}
                          onChange={() => alternarRequiereParticipante(rubro)}
                        />
                        Requiere nombre de participante
                      </label>
                    )}
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
                  Categoría
                  <select name="categoriaId" defaultValue="" disabled={guardando}>
                    <option value="">Sin categoría</option>
                    {(categorias ?? []).map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Qué evalúa
                  <select
                    name="tipoSujeto"
                    aria-label="Tipo de sujeto"
                    value={tipoSujetoForm}
                    onChange={(e) => setTipoSujetoForm(e.target.value)}
                    disabled={guardando}
                  >
                    {TIPOS_SUJETO.map((t) => (
                      <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="admin-casilla">
                  <input
                    type="checkbox"
                    checked={tipoSujetoForm === "PERSONA"}
                    disabled={guardando}
                    onChange={(e) => setTipoSujetoForm(e.target.checked ? "PERSONA" : "COMPARSA")}
                  />
                  Requiere nombre de participante
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
                    Máximo de nominados por comparsa
                    <input name="nominadosMaximosPorComparsa" type="number" min="1" step="1" required disabled={guardando} />
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

      {categoriaAEliminar && (
        <Modal title="Eliminar categoría" onClose={() => setCategoriaAEliminar(null)}>
          <p>
            ¿Confirmás eliminar la categoría <strong>{categoriaAEliminar.nombre}</strong>? Solo se puede si no tiene rubros.
          </p>
          <button type="button" onClick={() => setCategoriaAEliminar(null)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={confirmarBorradoCategoria}>
            Confirmar eliminación
          </button>
        </Modal>
      )}

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
