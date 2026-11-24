import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ConfiguracionEdicion } from "./ConfiguracionEdicion.jsx";

const edicionBase = {
  id: "e1",
  nombre: "Carnaval",
  anio: 2027,
  estado: "CONFIGURING",
  version: { id: "v1", numero: 1, estado: "BORRADOR" },
};

test("Paso 5 (Planillas) generates nominative rows and toggles row exclusion", async () => {
  let filas = [];
  const generarPlanillaVersion = vi.fn(async () => {
    filas = [
      { id: "f1", rubroNombre: "Batería", comparsaNombre: "Aramí", especialidadNombre: "Música", origen: "GENERADA", excluida: false },
    ];
    return { ok: true, cuerpo: { creadas: 1 } };
  });
  const actualizarFilaPlanilla = vi.fn(async (_e, _v, filaId, cuerpo) => {
    filas = filas.map((f) => (f.id === filaId ? { ...f, ...cuerpo } : f));
    return { ok: true, cuerpo: filas[0] };
  });

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    planillas={{
      listarVersiones: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarCandidatas: async () => ({ ok: true, cuerpo: { items: [] } }),
      obtenerPlanillaNoche: async () => ({ ok: true, cuerpo: { configurada: false, filaIds: [] } }),
      guardarPlanillaNoche: async () => ({ ok: true, cuerpo: { configurada: true, filaIds: [] } }),
    }}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarPlanillaVersion: async () => ({ ok: true, cuerpo: { items: filas } }),
      generarPlanillaVersion,
      actualizarFilaPlanilla,
    }}
  />);

  fireEvent.click(screen.getByRole("button", { name: /Planillas/ }));
  const secBase = within(await screen.findByRole("region", { name: "Planilla base del reglamento" }));
  fireEvent.click(secBase.getByRole("button", { name: "Generar filas nominativas" }));
  expect(await secBase.findByText(/Aramí/)).toBeVisible();
  expect(generarPlanillaVersion).toHaveBeenCalledWith("e1", "v1");

  fireEvent.click(secBase.getByRole("button", { name: "Excluir" }));
  await secBase.findByText("Excluida");
  expect(actualizarFilaPlanilla).toHaveBeenCalledWith("e1", "v1", "f1", { excluida: true });
});

test("Paso 6 (Revisión y publicación) shows checklist, preview, and publishes after modal confirmation", async () => {
  const publicarVersion = vi.fn(async () => ({ ok: true, cuerpo: { id: "v1", numero: 1, estado: "PUBLICADA" } }));

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      obtenerChecklistPublicacion: async () => ({
        ok: true,
        cuerpo: {
          publicable: true,
          bloqueantes: [],
          advertencias: [{ codigo: "especialidad_sin_rubros", mensaje: "Una especialidad no tiene rubros." }],
          resumen: { rubros: 3, comparsas: 4, filas: 12 },
        },
      }),
      obtenerVistaPreviaVersion: async () => ({
        ok: true,
        cuerpo: {
          especialidades: [
            {
              nombre: "Vestuario",
              comparsas: [{ nombre: "Aramí", filas: [{ id: "f1", rubroNombre: "Traje de fantasía", sujetoNombre: "Sofía" }] }],
            },
          ],
        },
      }),
      publicarVersion,
    }}
  />);

  fireEvent.click(screen.getByRole("button", { name: /Revisión y publicación/ }));
  const secRev = within(await screen.findByRole("region", { name: "Revisión y publicación" }));
  expect(await secRev.findByText(/Lista para publicar/)).toBeVisible();
  expect(secRev.getByText(/Una especialidad no tiene rubros/)).toBeVisible();
  expect(secRev.getByText(/Traje de fantasía/)).toBeVisible();

  fireEvent.click(secRev.getByRole("button", { name: "Publicar versión" }));
  const modal = within(screen.getByRole("dialog", { name: "Publicar versión del reglamento" }));
  fireEvent.click(modal.getByRole("button", { name: "Confirmar publicación" }));

  await secRev.findByText(/Versión publicada correctamente/);
  expect(publicarVersion).toHaveBeenCalledWith("e1", "v1");
});
