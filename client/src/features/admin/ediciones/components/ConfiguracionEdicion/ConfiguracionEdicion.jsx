import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PasoReglamento } from "../../PasoReglamento.jsx";
import { PasoPadron } from "../../PasoPadron.jsx";
import { PasoOrdenSalida } from "../../PasoOrdenSalida.jsx";
import { PasoPlanillaYHabilitacion } from "../../PasoPlanillaYHabilitacion.jsx";
import { crearClientePlanillasNoche } from "../../api/planillas-noche-api.js";
import {
  ETIQUETA_ESTADO_PASO,
  PASOS_EDICION as PASOS,
  cargarResumenEdicion,
  estadosDePasos,
  progresoDeEdicion,
} from "../../resumen-edicion.js";
import styles from "../../ConfiguracionEdicion.module.css";

const planillasPorDefecto = crearClientePlanillasNoche();

const estadoNoche = { DRAFT: "Borrador", OPEN: "Abierta", CLOSED: "Cerrada" };
const estadoEdicion = { CONFIGURING: "En preparación", OPEN: "Abierta", CLOSED: "Cerrada" };
const tipoNoche = { COMPETENCIA: "Competitiva", PREMIACION: "Premiación" };

function codigoDeEspecialidad(nombre, especialidades) {
  const base = nombre.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "ESPECIALIDAD";
  const existentes = new Set(especialidades.map(({ codigo }) => codigo.toUpperCase()));
  let codigo = base;
  for (let sufijo = 2; existentes.has(codigo); sufijo += 1) codigo = `${base}-${sufijo}`;
  return codigo;
}

export function ConfiguracionEdicion({ edicion, api, alVolver, alAgregar, planillas = planillasPorDefecto }) {
  const titulo = useId();
  const tituloPadron = useId();
  const tituloOrden = useId();
  const encabezado = useRef(null);
  const [pasoActivo, setPasoActivo] = useState("jornadas");
  const [noches, setNoches] = useState([]);
  const [especialidades, setEspecialidades] = useState([]);
  const [resumen, setResumen] = useState({ noches: null, especialidades: null, comparsas: null });
  const [estadoActual, setEstadoActual] = useState(edicion.estado);
  const [versionActiva, setVersionActiva] = useState(edicion.version ?? null);

  // Los listados de noches y especialidades también alimentan el conteo del progreso.
  const registrarNoches = useCallback((items) => {
    setNoches(items);
    setResumen((previo) => ({ ...previo, noches: items.length }));
  }, []);
  const registrarEspecialidades = useCallback((items) => {
    setEspecialidades(items);
    setResumen((previo) => ({ ...previo, especialidades: items.length }));
  }, []);

  useEffect(() => { encabezado.current?.focus(); }, []);

  // Relee los conteos al cambiar de etapa, para reflejar lo que se cargó en otra etapa (p. ej. comparsas).
  useEffect(() => {
    const controlador = new AbortController();
    cargarResumenEdicion(api, edicion.id, controlador.signal).then((datos) => {
      if (!controlador.signal.aborted) setResumen(datos);
    });
    return () => controlador.abort();
  }, [api, edicion.id, pasoActivo]);

  useEffect(() => {
    if (edicion.version?.id || typeof api.listarVersionesEdicion !== "function") return;
    const controlador = new AbortController();
    api.listarVersionesEdicion(edicion.id, controlador.signal).then((res) => {
      if (!controlador.signal.aborted && res.ok && res.cuerpo?.items?.length) {
        setVersionActiva(res.cuerpo.items[0]);
      }
    }).catch(() => {});
    return () => controlador.abort();
  }, [api, edicion.id, edicion.version]);

  const soloLectura = estadoActual === "CLOSED";
  const congelado = noches.some((n) => n.estado !== "DRAFT");
  const reglamentoPublicado = ["PUBLICADA", "CONGELADA"].includes(versionActiva?.estado);
  const pasos = estadosDePasos({ estado: estadoActual, ...resumen, reglamentoPublicado });
  const progreso = pasos ? progresoDeEdicion(pasos) : null;
  const indicePaso = PASOS.findIndex((p) => p.id === pasoActivo);

  return (
    <section className="admin-configuracion" aria-labelledby={titulo}>
      <div className={styles.headerRow}>
        <div>
          <button type="button" className={styles.backBtn} onClick={alVolver}>
            ← Volver a mis eventos
          </button>
          <h2 id={titulo} ref={encabezado} tabIndex={-1} className={styles.title}>
            {edicion.nombre} {edicion.anio}
          </h2>
          <p className={styles.subtitle}>
            <strong>{estadoEdicion[estadoActual] ?? estadoActual}.</strong>{" "}
            {soloLectura
              ? "La votación completa está cerrada; la configuración queda en solo lectura."
              : "Completá los pasos en orden. Cuando estén todos, podrás abrir la votación."}
          </p>
        </div>
      </div>

      {congelado && !soloLectura && (
        <div className={styles.freezeBanner} role="status">
          Desde que se abrió la primera noche, el reglamento y las comparsas quedan en solo lectura.
        </div>
      )}

      <div className={styles.etapasLayout}>
        <nav className={styles.stepperWrap} aria-label="Etapas de la edición">
          <div className={styles.stepperProgressHeader}>
            <span>{progreso ? `${progreso.completos} de ${progreso.total} pasos completos` : "Cargando progreso…"}</span>
          </div>
          <div className={styles.progressTrack} aria-hidden="true">
            <div
              className={styles.progressFill}
              style={{ width: `${progreso ? Math.round((progreso.completos / progreso.total) * 100) : 0}%` }}
            />
          </div>
          <ol className={styles.stepperList}>
            {PASOS.map((paso) => {
              const activo = paso.id === pasoActivo;
              const estado = pasos?.find((p) => p.id === paso.id)?.estado;
              return (
                <li key={paso.id}>
                  <button
                    type="button"
                    className={`${styles.stepBtn} ${activo ? styles.stepBtnActive : ""}`}
                    aria-current={activo ? "step" : undefined}
                    onClick={() => setPasoActivo(paso.id)}
                  >
                    <span className={styles.stepNum}>{estado === "completo" ? "✓" : paso.numero}</span>
                    <span className={styles.stepTexto}>
                      <span className={styles.stepNombre}>{paso.etiqueta}</span>
                      <span className={styles.stepEstado}>{estado ? ETIQUETA_ESTADO_PASO[estado] : "…"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className={styles.etapaContenido}>
          <div className={styles.etapaCabecera}>
            <p className={styles.etapaNumero}>Paso {indicePaso + 1} de {PASOS.length}</p>
            <h3 className={styles.etapaTitulo}>{PASOS[indicePaso]?.etiqueta}</h3>
            <p className={styles.etapaDescripcion}>{PASOS[indicePaso]?.descripcion}</p>
          </div>

      {pasoActivo === "jornadas" && (
        <>
          <Coleccion
            edicionId={edicion.id} titulo="Noches" nombreColeccion="noches" accion="Agregar noche"
            listar={api.listarNochesEdicion} crear={api.crearNocheEdicion}
            alAgregar={alAgregar} alCargar={registrarNoches}
            ordenAutomatico soloLectura={soloLectura}
            columnas={["Orden", "Nombre", "Fecha", "Tipo", "Estado"]}
            celdas={(noche) => [noche.orden, noche.nombre, noche.fecha ?? "Sin fecha", tipoNoche[noche.tipo] ?? noche.tipo,
              estadoNoche[noche.estado] ?? noche.estado]}
            construir={(campos) => {
              const fecha = campos.get("fecha");
              return { tipo: campos.get("tipo"), cuentaParaPuntaje: campos.has("cuentaParaPuntaje"), ...(fecha && { fecha }) };
            }}
          >
            <label>Fecha (opcional)<input name="fecha" type="date" /></label>
            <label>Tipo<select name="tipo"><option value="COMPETENCIA">Competitiva</option><option value="PREMIACION">Premiación</option></select></label>
            <label className="admin-casilla"><input name="cuentaParaPuntaje" type="checkbox" defaultChecked /> Cuenta para puntaje</label>
          </Coleccion>

          <Coleccion
            edicionId={edicion.id} titulo="Especialidades" nombreColeccion="especialidades" accion="Agregar especialidad"
            listar={api.listarEspecialidadesEdicion} crear={api.crearEspecialidadEdicion}
            alAgregar={alAgregar} alCargar={registrarEspecialidades}
            soloLectura={soloLectura || congelado}
            columnas={["Orden", "Nombre", "Código", "Estado"]}
            celdas={(especialidad) => [especialidad.orden, especialidad.nombre, especialidad.codigo, especialidad.activa ? "Activa" : "Inactiva"]}
            construir={(_campos, nombre, items) => ({ codigo: codigoDeEspecialidad(nombre, items) })}
            ayuda="El código se genera a partir del nombre y se muestra en el listado."
          />
        </>
      )}

      {pasoActivo === "evaluacion" && (
        <PasoReglamento
          edicion={edicion}
          versionActiva={versionActiva}
          especialidades={especialidades}
          api={api}
          soloLectura={soloLectura || congelado}
        />
      )}

      {pasoActivo === "comparsas" && (
        <>
          <section aria-labelledby={tituloPadron} className={styles.subseccion}>
            <h4 id={tituloPadron} className={styles.subseccionTitulo}>Comparsas y figuras</h4>
            <PasoPadron
              edicion={edicion}
              versionActiva={versionActiva}
              api={api}
              soloLectura={soloLectura || congelado}
            />
          </section>
          <section aria-labelledby={tituloOrden} className={styles.subseccion}>
            <h4 id={tituloOrden} className={styles.subseccionTitulo}>Orden de salida</h4>
            <PasoOrdenSalida edicion={edicion} noches={noches} api={api} soloLectura={soloLectura} />
          </section>
        </>
      )}

      {pasoActivo === "habilitacion" && (
        <PasoPlanillaYHabilitacion
          edicion={edicion}
          estadoEdicionActual={estadoActual}
          versionActiva={versionActiva}
          noches={noches}
          especialidades={especialidades}
          api={api}
          planillas={planillas}
          soloLectura={soloLectura || congelado}
          alPublicar={(publicada) => {
            if (publicada) setVersionActiva(publicada);
            alAgregar?.();
          }}
          alAbrirEdicion={() => {
            setEstadoActual("OPEN");
            alAgregar?.();
          }}
          alAbrirNoche={(nocheId) => {
            setNoches((prev) => prev.map((n) => (n.id === nocheId ? { ...n, estado: "OPEN" } : n)));
            setVersionActiva((prev) => (prev ? { ...prev, estado: "CONGELADA" } : prev));
            alAgregar?.();
          }}
        />
      )}

        <div className={styles.stepFooter}>
          <button
            type="button"
            disabled={indicePaso === 0}
            onClick={() => setPasoActivo(PASOS[indicePaso - 1].id)}
          >
            ← Paso anterior
          </button>
          <button
            type="button"
            disabled={indicePaso === PASOS.length - 1}
            onClick={() => setPasoActivo(PASOS[indicePaso + 1].id)}
          >
            Siguiente paso →
          </button>
        </div>
      </div>
      </div>
    </section>
  );
}

function Coleccion({ edicionId, titulo, nombreColeccion, accion, listar, crear, alAgregar, alCargar, columnas, celdas, construir, ordenAutomatico, soloLectura, ayuda, children }) {
  const id = useId();
  const [items, setItems] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [errorCarga, setErrorCarga] = useState("");
  const [errorGuardado, setErrorGuardado] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    const controlador = new AbortController();
    async function cargar() {
      try {
        const resultado = await listar(edicionId, controlador.signal);
        if (controlador.signal.aborted) return;
        if (resultado.ok) {
          setItems(resultado.cuerpo.items);
          alCargar?.(resultado.cuerpo.items);
        } else {
          setErrorCarga(resultado.cuerpo?.mensaje ?? `No se pudieron cargar las ${nombreColeccion}.`);
        }
      } catch {
        if (!controlador.signal.aborted) setErrorCarga(`No se pudieron cargar las ${nombreColeccion}. Revisa la conexión.`);
      }
    }
    cargar();
    return () => controlador.abort();
  }, [edicionId, listar, nombreColeccion, recarga, alCargar]);

  async function agregar(evento) {
    evento.preventDefault();
    if (guardando) return;
    const formulario = evento.currentTarget;
    const campos = new FormData(formulario);
    const nombre = campos.get("nombre").trim();
    const orden = ordenAutomatico ? items.reduce((maximo, item) => Math.max(maximo, item.orden), 0) + 1
      : Number(campos.get("orden"));
    setGuardando(true);
    setErrorGuardado("");
    setAviso("");
    try {
      const resultado = await crear(edicionId, {
        nombre, orden, ...construir(campos, nombre, items),
      });
      if (!resultado.ok) {
        setErrorGuardado(resultado.cuerpo?.mensaje ?? "No se pudo guardar.");
        if (resultado.cuerpo?.error === "codigo_existente" || (ordenAutomatico && resultado.cuerpo?.error === "orden_existente")) {
          setRecarga((n) => n + 1);
        }
        return;
      }
      const siguientes = [...items, resultado.cuerpo].sort((a, b) => a.orden - b.orden);
      setItems(siguientes);
      alCargar?.(siguientes);
      formulario.reset();
      setAviso(`Se agregó «${resultado.cuerpo.nombre}».`);
      alAgregar?.();
    } catch {
      setErrorGuardado("No se pudo confirmar el guardado. Vuelve a consultar la edición antes de intentarlo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section aria-labelledby={id} className="admin-configuracion-grupo">
      <h3 id={id}>{titulo}</h3>
      {errorCarga ? (
        <div className="admin-aviso">
          <p role="alert">{errorCarga}</p>
          <button type="button" onClick={() => { setErrorCarga(""); setRecarga((n) => n + 1); }}>Reintentar</button>
        </div>
      ) : items === null ? <p role="status">Cargando {nombreColeccion}…</p> : (
        <>
          {ordenAutomatico && <p>Las noches se agregan al final del calendario.</p>}
          {ayuda && <p>{ayuda}</p>}
          {items.length === 0 ? <p>Todavía no hay {nombreColeccion} en esta edición.</p> : (
            <div className="admin-tabla" role="region" aria-label={`Listado de ${nombreColeccion}`} tabIndex={0}>
              <table>
                <thead><tr>{columnas.map((columna) => <th key={columna} scope="col">{columna}</th>)}</tr></thead>
                <tbody>{items.map((item) => (
                  <tr key={item.id}>{celdas(item).map((valor, indice) => <td key={columnas[indice]}>{valor}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {!soloLectura && <form onSubmit={agregar} aria-busy={guardando}>
            <label>Nombre<input name="nombre" required disabled={guardando} /></label>
            {!ordenAutomatico && <label>Orden<input name="orden" type="number" min="1" step="1" required disabled={guardando} /></label>}
            {children && <fieldset className="admin-configuracion-campos" disabled={guardando}>{children}</fieldset>}
            <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : accion}</button>
          </form>}
          {errorGuardado && <p className="admin-aviso" role="alert">{errorGuardado}</p>}
          {aviso && <p role="status">{aviso}</p>}
        </>
      )}
    </section>
  );
}
