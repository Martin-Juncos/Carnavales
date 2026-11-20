import { useEffect, useId, useRef, useState } from "react";

const estadoNoche = { DRAFT: "Borrador", OPEN: "Abierta", CLOSED: "Cerrada" };
const estadoEdicion = { CONFIGURING: "En configuración", OPEN: "Abierta" };
const tipoNoche = { COMPETENCIA: "Competitiva", PREMIACION: "Premiación" };

function codigoDeEspecialidad(nombre, especialidades) {
  const base = nombre.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "ESPECIALIDAD";
  const existentes = new Set(especialidades.map(({ codigo }) => codigo.toUpperCase()));
  let codigo = base;
  for (let sufijo = 2; existentes.has(codigo); sufijo += 1) codigo = `${base}-${sufijo}`;
  return codigo;
}

export function ConfiguracionEdicion({ edicion, api, alVolver, alAgregar }) {
  const titulo = useId();
  const encabezado = useRef(null);
  useEffect(() => { encabezado.current?.focus(); }, []);
  return (
    <section className="admin-configuracion" aria-labelledby={titulo}>
      <button type="button" onClick={alVolver}>Volver a ediciones</button>
      <h2 id={titulo} ref={encabezado} tabIndex={-1}>Configurar {edicion.nombre} {edicion.anio}</h2>
      <p><strong>{estadoEdicion[edicion.estado] ?? edicion.estado}.</strong> Define el calendario y las especialidades antes de asignar jurados.</p>
      <Coleccion
        edicionId={edicion.id} titulo="Noches" nombreColeccion="noches" accion="Agregar noche"
        listar={api.listarNochesEdicion} crear={api.crearNocheEdicion} alAgregar={alAgregar}
        ordenAutomatico
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
        listar={api.listarEspecialidadesEdicion} crear={api.crearEspecialidadEdicion} alAgregar={alAgregar}
        columnas={["Orden", "Nombre", "Código", "Estado"]}
        celdas={(especialidad) => [especialidad.orden, especialidad.nombre, especialidad.codigo, especialidad.activa ? "Activa" : "Inactiva"]}
        construir={(_campos, nombre, items) => ({ codigo: codigoDeEspecialidad(nombre, items) })}
        ayuda="El código se genera a partir del nombre y se muestra en el listado."
      />
    </section>
  );
}

function Coleccion({ edicionId, titulo, nombreColeccion, accion, listar, crear, alAgregar, columnas, celdas, construir, ordenAutomatico, ayuda, children }) {
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
        if (resultado.ok) setItems(resultado.cuerpo.items);
        else setErrorCarga(resultado.cuerpo?.mensaje ?? `No se pudieron cargar las ${nombreColeccion}.`);
      } catch {
        if (!controlador.signal.aborted) setErrorCarga(`No se pudieron cargar las ${nombreColeccion}. Revisa la conexión.`);
      }
    }
    cargar();
    return () => controlador.abort();
  }, [edicionId, listar, nombreColeccion, recarga]);

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
      setItems((anteriores) => [...anteriores, resultado.cuerpo].sort((a, b) => a.orden - b.orden));
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
          <form onSubmit={agregar} aria-busy={guardando}>
            <label>Nombre<input name="nombre" required disabled={guardando} /></label>
            {!ordenAutomatico && <label>Orden<input name="orden" type="number" min="1" step="1" required disabled={guardando} /></label>}
            {children && <fieldset className="admin-configuracion-campos" disabled={guardando}>{children}</fieldset>}
            <button type="submit" disabled={guardando}>{guardando ? "Guardando…" : accion}</button>
          </form>
          {errorGuardado && <p className="admin-aviso" role="alert">{errorGuardado}</p>}
          {aviso && <p role="status">{aviso}</p>}
        </>
      )}
    </section>
  );
}
