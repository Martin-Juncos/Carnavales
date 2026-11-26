/*
 * Pruebas de las reglas de progreso de una edición: qué paso está completo, cuál está en
 * curso, cuáles están bloqueados y cómo se cargan los conteos sin inventar datos.
 * Depende de resumen-edicion.js y de vitest.
 */
import { describe, expect, it, vi } from "vitest";
import { cargarResumenEdicion, estadosDePasos, progresoDeEdicion } from "./resumen-edicion.js";

const estados = (pasos) => pasos.map((paso) => paso.estado);

describe("estadosDePasos", () => {
  it("no muestra progreso cuando falta algún dato", () => {
    expect(estadosDePasos({
      estado: "CONFIGURING", noches: null, especialidades: 5, comparsas: 0, reglamentoPublicado: false,
    })).toBeNull();
  });

  it("marca completos los pasos cumplidos, el primero pendiente en curso y bloquea la apertura", () => {
    const pasos = estadosDePasos({
      estado: "CONFIGURING", noches: 3, especialidades: 5, comparsas: 0, reglamentoPublicado: false,
    });

    expect(estados(pasos)).toEqual(["completo", "en_curso", "pendiente", "bloqueado"]);
    expect(progresoDeEdicion(pasos)).toEqual({ completos: 1, total: 4 });
  });

  it("una edición con todo cargado queda lista para abrir, sin bloqueo", () => {
    const pasos = estadosDePasos({
      estado: "CONFIGURING", noches: 3, especialidades: 5, comparsas: 4, reglamentoPublicado: true,
    });

    expect(estados(pasos)).toEqual(["completo", "completo", "completo", "en_curso"]);
  });

  it("una edición abierta o cerrada tiene la planilla y apertura completa", () => {
    const pasos = estadosDePasos({
      estado: "OPEN", noches: 3, especialidades: 5, comparsas: 4, reglamentoPublicado: true,
    });

    expect(progresoDeEdicion(pasos)).toEqual({ completos: 4, total: 4 });
  });
});

describe("cargarResumenEdicion", () => {
  it("cuenta los elementos de cada listado y deja null lo que la API no puede responder", async () => {
    const api = {
      listarNochesEdicion: vi.fn(async () => ({ ok: true, cuerpo: { items: [{ id: "n1" }, { id: "n2" }] } })),
      listarEspecialidadesEdicion: vi.fn(async () => { throw new Error("red caída"); }),
    };

    const resumen = await cargarResumenEdicion(api, "e1");

    expect(resumen).toEqual({ noches: 2, especialidades: null, comparsas: null });
    expect(api.listarNochesEdicion).toHaveBeenCalledWith("e1", undefined);
  });
});
