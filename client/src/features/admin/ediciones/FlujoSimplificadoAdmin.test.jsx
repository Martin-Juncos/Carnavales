import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ConfiguracionEdicion } from "./components/ConfiguracionEdicion/ConfiguracionEdicion.jsx";
import { sincronizarPlanillaEdicion } from "./sincronizar-planilla.js";

test("sincronizarPlanillaEdicion automates scale 1-5, missing non-person subjects, base sheet generation, and per-night selection", async () => {
  const guardarEscala = vi.fn(async () => ({ ok: true, cuerpo: { minimo: 1, maximo: 5 } }));
  const crearSujetoComparsa = vi.fn(async () => ({ ok: true, cuerpo: { id: "s-auto" } }));
  const generarPlanillaVersion = vi.fn(async () => ({ ok: true, cuerpo: { creadas: 2 } }));
  const guardarSeleccion = vi.fn(async () => ({ ok: true, cuerpo: { configurada: true, filaIds: ["f1", "f2"] } }));

  const resultado = await sincronizarPlanillaEdicion({
    edicionId: "e1",
    versionActiva: { id: "v1", numero: 1, estado: "BORRADOR" },
    noches: [{ id: "n1", orden: 1, nombre: "Noche 1", tipo: "COMPETENCIA", estado: "DRAFT" }],
    especialidades: [{ id: "esp1", nombre: "Música", activa: true }],
    api: {
      obtenerEscala: async () => ({ ok: true, cuerpo: null }),
      guardarEscala,
      listarRubros: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "r1", nombre: "Batería", tipoSujeto: "BATERIA", tipoRubro: "NOMINATIVO" }] },
      }),
      listarComparsas: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "c1", nombre: "Aramí", categoria: "PRIMERA", activa: true }] },
      }),
      listarSujetosComparsa: async () => ({ ok: true, cuerpo: { items: [] } }),
      crearSujetoComparsa,
      generarPlanillaVersion,
    },
    planillas: {
      obtenerSeleccion: async () => ({ ok: true, cuerpo: { configurada: false, filaIds: [] } }),
      listarCandidatas: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "f1", rubroNombre: "Batería", comparsaNombre: "Aramí" }, { id: "f2", rubroNombre: "Batería", comparsaNombre: "Aymará" }] },
      }),
      guardarSeleccion,
    },
  });

  expect(resultado.ok).toBe(true);
  expect(guardarEscala).toHaveBeenCalledWith("e1", "v1", 1, 5);
  expect(crearSujetoComparsa).toHaveBeenCalledWith("e1", "c1", { tipoSujeto: "BATERIA", nombre: "Aramí" });
  expect(generarPlanillaVersion).toHaveBeenCalledWith("e1", "v1");
  expect(guardarSeleccion).toHaveBeenCalledWith("e1", "v1", "n1", "esp1", ["f1", "f2"]);
});

test("ConfiguracionEdicion renders 4 clear stages and lets the admin prepare sheets, publish, and open in one unified final stage", async () => {
  const guardarEscala = vi.fn(async () => ({ ok: true, cuerpo: { minimo: 1, maximo: 5 } }));
  const generarPlanillaVersion = vi.fn(async () => ({ ok: true, cuerpo: { creadas: 1 } }));
  const guardarSeleccion = vi.fn(async () => ({ ok: true, cuerpo: { configurada: true, filaIds: ["f1"] } }));
  const publicarVersion = vi.fn(async () => ({ ok: true, cuerpo: { id: "v1", numero: 1, estado: "PUBLICADA" } }));

  render(<ConfiguracionEdicion
    edicion={{
      id: "e1",
      nombre: "Carnaval",
      anio: 2027,
      estado: "CONFIGURING",
      version: { id: "v1", numero: 1, estado: "BORRADOR" },
    }}
    alVolver={() => {}}
    planillas={{
      listarVersiones: async () => ({ ok: true, cuerpo: { items: [{ id: "v1", numero: 1, estado: "BORRADOR" }] } }),
      obtenerSeleccion: async () => ({ ok: true, cuerpo: { configurada: false, filaIds: [] } }),
      listarCandidatas: async () => ({ ok: true, cuerpo: { items: [{ id: "f1", rubroNombre: "Batería", comparsaNombre: "Aramí" }] } }),
      guardarSeleccion,
    }}
    api={{
      listarNochesEdicion: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "n1", orden: 1, nombre: "Noche 1", tipo: "COMPETENCIA", estado: "DRAFT" }] },
      }),
      listarEspecialidadesEdicion: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "esp1", nombre: "Música", codigo: "MUSICA", orden: 1, activa: true }] },
      }),
      obtenerEscala: async () => ({ ok: true, cuerpo: null }),
      guardarEscala,
      listarRubros: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "r1", nombre: "Batería", tipoSujeto: "BATERIA", tipoRubro: "NOMINATIVO", especialidadIds: ["esp1"] }] },
      }),
      listarComparsas: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "c1", nombre: "Aramí", categoria: "PRIMERA", activa: true }] },
      }),
      listarSujetosComparsa: async () => ({ ok: true, cuerpo: { items: [] } }),
      crearSujetoComparsa: async () => ({ ok: true, cuerpo: { id: "s1" } }),
      generarPlanillaVersion,
      obtenerChecklistPublicacion: async () => ({
        ok: true,
        cuerpo: { publicable: true, bloqueantes: [], advertencias: [] },
      }),
      obtenerVistaPreviaVersion: async () => ({
        ok: true,
        cuerpo: {
          especialidades: [
            { nombre: "Música", comparsas: [{ nombre: "Aramí", filas: [{ id: "f1", rubroNombre: "Batería" }] }] },
          ],
        },
      }),
      publicarVersion,
    }}
  />);

  // Exactamente 4 etapas en el stepper
  const stepper = within(screen.getByRole("navigation", { name: "Etapas de la edición" }));
  expect(stepper.getAllByRole("button")).toHaveLength(4);
  expect(stepper.getByRole("button", { name: /Noches y especialidades/ })).toBeVisible();
  expect(stepper.getByRole("button", { name: /Reglamento y puntajes/ })).toBeVisible();
  expect(stepper.getByRole("button", { name: /Comparsas y orden de salida/ })).toBeVisible();
  expect(stepper.getByRole("button", { name: /Planilla y apertura/ })).toBeVisible();

  // Paso 4 unificado: preparar en 1 clic + publicar
  fireEvent.click(stepper.getByRole("button", { name: /Planilla y apertura/ }));
  const secFinal = within(await screen.findByRole("region", { name: "Planilla y habilitación" }));
  fireEvent.click(secFinal.getByRole("button", { name: "Preparar y sincronizar planillas" }));
  await secFinal.findByText(/Planillas sincronizadas/);
  expect(generarPlanillaVersion).toHaveBeenCalledWith("e1", "v1");
  expect(guardarSeleccion).toHaveBeenCalledWith("e1", "v1", "n1", "esp1", ["f1"]);

  // Ajustar excepciones está plegado por defecto y se puede abrir si hace falta
  expect(secFinal.queryByText("Planillas por noche")).toBeNull();
  fireEvent.click(secFinal.getByRole("button", { name: /Ajustar excepciones por noche/ }));
  expect(await secFinal.findByRole("heading", { name: "Planillas por noche" })).toBeVisible();
});
