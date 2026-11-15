import { useEffect, useState } from "react";
import { paginasTotales } from "./paginacion.js";

// Tamaño de página del listado. Debe respetar el máximo de la API (100).
const limite = 20;

// Listado administrativo de usuarios: búsqueda, paginación y estado de sesión.
// La API decide quién es administrador: si responde 403, el panel no se muestra.
export function PanelUsuarios({ api }) {
  const [pagina, setPagina] = useState(1);
  const [buscar, setBuscar] = useState("");
  const [consulta, setConsulta] = useState("");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [sinPermiso, setSinPermiso] = useState(false);

  // Cada cambio de página o de búsqueda vuelve a pedir el listado a la API.
  useEffect(() => {
    let cancelado = false;
    api.listarUsuarios({ pagina, limite, buscar: consulta }).then((resultado) => {
      if (cancelado) return;
      if (resultado.status === 403) {
        setSinPermiso(true);
        return;
      }
      if (!resultado.ok) {
        setError("No se pudo cargar el listado. Intentá de nuevo.");
        return;
      }
      setError("");
      setDatos(resultado.cuerpo);
    });
    return () => {
      cancelado = true;
    };
  }, [api, pagina, consulta]);

  // Sin permiso de administrador no se muestra nada de administración.
  if (sinPermiso) {
    return null;
  }

  // Buscar reinicia a la primera página.
  function buscarUsuarios(evento) {
    evento.preventDefault();
    setPagina(1);
    setConsulta(buscar);
  }

  const totalPaginas = datos ? paginasTotales(datos.total, limite) : 1;

  return (
    <section>
      <h2>Usuarios</h2>
      <form onSubmit={buscarUsuarios}>
        <label>
          Buscar por nombre o correo
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </label>
        <button type="submit">Buscar</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {datos && (
        <>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Roles</th>
                <th>Sesión activa</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((usuario) => (
                <tr key={usuario.id}>
                  <td>{usuario.nombre}</td>
                  <td>{usuario.correo}</td>
                  <td>{usuario.roles.join(", ") || "Sin roles"}</td>
                  <td>{usuario.sesionActiva ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {datos.items.length === 0 && <p>No hay usuarios para mostrar.</p>}
          <nav>
            <button type="button" onClick={() => setPagina((p) => p - 1)} disabled={pagina <= 1}>Anterior</button>
            <span> Página {pagina} de {totalPaginas} </span>
            <button type="button" onClick={() => setPagina((p) => p + 1)} disabled={pagina >= totalPaginas}>Siguiente</button>
          </nav>
        </>
      )}
    </section>
  );
}
