import { useEffect, useState } from "react";

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(resultado) {
  return resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
}

// Panel administrativo de ediciones: crear una edición vacía y ver su estado.
// La API decide quién es administrador: si responde 403, el panel no se muestra.
export function PanelEdiciones({ api }) {
  const [datos, setDatos] = useState(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [nombre, setNombre] = useState("");
  const [anio, setAnio] = useState("");
  const [recargar, setRecargar] = useState(0);

  // Al montar y después de cada alta, pide el listado a la API.
  useEffect(() => {
    let cancelado = false;
    api.listarEdiciones().then((resultado) => {
      if (cancelado) return;
      if (resultado.status === 403) {
        setSinPermiso(true);
        return;
      }
      if (resultado.ok) setDatos(resultado.cuerpo);
      else setMensaje(mensajeDeError(resultado));
    });
    return () => {
      cancelado = true;
    };
  }, [api, recargar]);

  // Sin permiso de administrador no se muestra nada de administración.
  if (sinPermiso) {
    return null;
  }

  async function crear(evento) {
    evento.preventDefault();
    const resultado = await api.crearEdicion(nombre.trim(), anio.trim());
    setMensaje(resultado.ok ? "Edición creada." : mensajeDeError(resultado));
    if (resultado.ok) {
      setNombre("");
      setAnio("");
      setRecargar((n) => n + 1);
    }
  }

  return (
    <section>
      <h2>Ediciones</h2>
      <form onSubmit={crear}>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Año
          <input type="number" min="1" step="1" value={anio} onChange={(e) => setAnio(e.target.value)} required />
        </label>
        <button type="submit">Crear edición</button>
      </form>

      {mensaje && <p role="status">{mensaje}</p>}

      {datos && (
        <>
          <table>
            <thead>
              <tr>
                <th>Año</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Reglamento</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((edicion) => (
                <tr key={edicion.id}>
                  <td>{edicion.anio}</td>
                  <td>{edicion.nombre}</td>
                  <td>{edicion.estado}</td>
                  <td>{edicion.version ? `Versión ${edicion.version.numero}: ${edicion.version.estado}` : "Sin versión"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {datos.items.length === 0 && <p>No hay ediciones creadas.</p>}
        </>
      )}
    </section>
  );
}
