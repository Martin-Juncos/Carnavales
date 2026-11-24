// Cliente HTTP de la planilla por noche del panel de administración. Devuelve { ok, status, cuerpo },
// igual que cliente-api.js. Recibe fetch inyectable para probarlo sin red.

import { crearLlamador } from "../../../shared/api/http.js";

export function crearClientePlanillasNoche(fetchImpl = globalThis.fetch) {
  // Envía una petición JSON (GET por defecto) y normaliza la respuesta.
  const llamar = crearLlamador(fetchImpl, { metodoPorDefecto: "GET", cachePorDefecto: "no-store" });

  const edicion = (edicionId) => `/api/admin/ediciones/${encodeURIComponent(edicionId)}`;
  const planilla = (edicionId, versionId, nocheId, especialidadId) =>
    `${edicion(edicionId)}/versiones/${encodeURIComponent(versionId)}/noches/${encodeURIComponent(nocheId)}`
    + `/planilla/${encodeURIComponent(especialidadId)}`;

  return {
    // Versiones de reglamento de la edición, de la más nueva a la más antigua.
    listarVersiones: (edicionId, signal) => llamar(`${edicion(edicionId)}/versiones`, { signal }),
    // Selección guardada (o propuesta, si la noche está en borrador y no hay selección).
    obtenerSeleccion: (edicionId, versionId, nocheId, especialidadId, signal) =>
      llamar(planilla(edicionId, versionId, nocheId, especialidadId), { signal }),
    // Filas elegibles para la noche y especialidad, con nombres de rubro y comparsa.
    listarCandidatas: (edicionId, versionId, nocheId, especialidadId, signal) =>
      llamar(`${planilla(edicionId, versionId, nocheId, especialidadId)}/candidatas`, { signal }),
    // Reemplaza la selección completa. Una lista vacía confirma que no hay nada que evaluar.
    guardarSeleccion: (edicionId, versionId, nocheId, especialidadId, filaIds) =>
      llamar(planilla(edicionId, versionId, nocheId, especialidadId), { metodo: "PUT", cuerpo: { filaIds } }),
  };
}
