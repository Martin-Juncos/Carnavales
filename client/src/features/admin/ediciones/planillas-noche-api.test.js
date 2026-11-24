import { describe, expect, it, vi } from "vitest";
import { crearClientePlanillasNoche } from "./planillas-noche-api.js";

function respuestaJson(cuerpo, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

describe("crearClientePlanillasNoche", () => {
  it("lista versiones con la ruta de administración y devuelve el cuerpo normalizado", async () => {
    const fetchImpl = vi.fn(async () => respuestaJson({ items: [{ id: "v1", numero: 1, estado: "BORRADOR" }] }));
    const api = crearClientePlanillasNoche(fetchImpl);

    const resultado = await api.listarVersiones("e 1");

    expect(fetchImpl).toHaveBeenCalledWith("/api/admin/ediciones/e%201/versiones", expect.objectContaining({
      method: "GET", credentials: "same-origin", cache: "no-store",
    }));
    expect(resultado).toEqual({ ok: true, status: 200, cuerpo: { items: [{ id: "v1", numero: 1, estado: "BORRADOR" }] } });
  });

  it("obtiene la selección y las candidatas en sus rutas de noche y especialidad", async () => {
    const fetchImpl = vi.fn(async () => respuestaJson({ configurada: false, filaIds: [] }));
    const api = crearClientePlanillasNoche(fetchImpl);

    await api.obtenerSeleccion("ed", "ver", "noc", "esp");
    await api.listarCandidatas("ed", "ver", "noc", "esp");

    expect(fetchImpl.mock.calls[0][0]).toBe(
      "/api/admin/ediciones/ed/versiones/ver/noches/noc/planilla/esp",
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "/api/admin/ediciones/ed/versiones/ver/noches/noc/planilla/esp/candidatas",
    );
  });

  it("guarda la selección completa con PUT y el cuerpo filaIds, incluida la lista vacía", async () => {
    const fetchImpl = vi.fn(async () => respuestaJson({ configurada: true, filaIds: [] }));
    const api = crearClientePlanillasNoche(fetchImpl);

    const resultado = await api.guardarSeleccion("ed", "ver", "noc", "esp", []);

    const [ruta, opciones] = fetchImpl.mock.calls[0];
    expect(ruta).toBe("/api/admin/ediciones/ed/versiones/ver/noches/noc/planilla/esp");
    expect(opciones.method).toBe("PUT");
    expect(opciones.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(opciones.body)).toEqual({ filaIds: [] });
    expect(resultado.ok).toBe(true);
  });

  it("informa el error de la API sin lanzar excepciones y tolera respuestas que no son JSON", async () => {
    const fetchImpl = vi.fn(async () => respuestaJson({ error: "noche_no_editable", mensaje: "Solo en borrador." }, 409));
    const api = crearClientePlanillasNoche(fetchImpl);
    const conError = await api.guardarSeleccion("ed", "ver", "noc", "esp", ["f"]);
    expect(conError).toEqual({ ok: false, status: 409, cuerpo: { error: "noche_no_editable", mensaje: "Solo en borrador." } });

    const paginaDeError = vi.fn(async () => new Response("<!doctype html>", { status: 502 }));
    const resultado = await crearClientePlanillasNoche(paginaDeError).listarVersiones("ed");
    expect(resultado).toEqual({ ok: false, status: 502, cuerpo: null });
  });
});
