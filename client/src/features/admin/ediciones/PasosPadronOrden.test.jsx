import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ConfiguracionEdicion } from "./components/ConfiguracionEdicion/ConfiguracionEdicion.jsx";

const edicionBase = {
  id: "e1",
  nombre: "Carnaval",
  anio: 2027,
  estado: "CONFIGURING",
  version: { id: "v1", numero: 1, estado: "BORRADOR" },
};

test("Etapa 3 (Comparsas y orden) creates a comparsa and assigns a participant directly to a PERSONA rubro", async () => {
  let comparsas = [];
  let filasPlanilla = [];

  const crearComparsa = vi.fn(async (_e, cuerpo) => {
    const nueva = { ...cuerpo, id: "c1", activa: true };
    comparsas = [...comparsas, nueva];
    return { ok: true, cuerpo: nueva };
  });
  const crearParticipante = vi.fn(async (_e, cuerpo) => ({
    ok: true,
    cuerpo: { ...cuerpo, id: "p1", activo: true },
  }));
  const crearSujetoComparsa = vi.fn(async (_e, _c, cuerpo) => ({
    ok: true,
    cuerpo: { ...cuerpo, id: "s1", activo: true },
  }));
  const nominarEnRubro = vi.fn(async (_e, _v, rubroId, { sujetoId, especialidadId }) => {
    const fila = {
      id: `f-${especialidadId}`,
      rubroId,
      sujetoId,
      sujetoNombre: "Sofía Pérez",
      comparsaId: "c1",
      comparsaNombre: "Aramí",
      especialidadId,
      origen: "MANUAL",
      excluida: false,
    };
    filasPlanilla = [...filasPlanilla, fila];
    return { ok: true, cuerpo: fila };
  });

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarComparsas: async () => ({ ok: true, cuerpo: { items: comparsas } }),
      listarRubros: async () => ({
        ok: true,
        cuerpo: {
          items: [
            { id: "r-reina", nombre: "Reina de Comparsa", tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", especialidadIds: ["esp1"] },
            { id: "r-bat", nombre: "Batería", tipoSujeto: "BATERIA", tipoRubro: "NOMINATIVO", especialidadIds: ["esp1"] },
          ],
        },
      }),
      listarPlanillaVersion: async () => ({ ok: true, cuerpo: { items: filasPlanilla } }),
      crearComparsa,
      crearParticipante,
      crearSujetoComparsa,
      nominarEnRubro,
    }}
  />);

  fireEvent.click(screen.getByRole("button", { name: /Comparsas y orden/ }));

  const secComparsas = within(await screen.findByRole("region", { name: "Comparsas" }));
  fireEvent.change(secComparsas.getByLabelText("Nombre de la comparsa"), { target: { value: "Aramí" } });
  fireEvent.change(secComparsas.getByLabelText("Categoría"), { target: { value: "PRIMERA" } });
  fireEvent.click(secComparsas.getByRole("button", { name: "Agregar comparsa" }));
  expect(await secComparsas.findByText("Aramí")).toBeVisible();

  fireEvent.click(secComparsas.getByRole("button", { name: "Participantes de Aramí" }));
  const secParticipantes = within(await screen.findByRole("region", { name: "Participantes de Aramí" }));
  // Solo aparece el rubro de tipo PERSONA (Reina de Comparsa), no Batería
  expect(secParticipantes.getByText("Reina de Comparsa")).toBeVisible();
  expect(secParticipantes.queryByText("Batería")).toBeNull();

  fireEvent.change(secParticipantes.getByLabelText("Nombre para Reina de Comparsa"), { target: { value: "Sofía Pérez" } });
  fireEvent.click(secParticipantes.getByRole("button", { name: "Asignar a Reina de Comparsa" }));

  expect(await secParticipantes.findByText("Sofía Pérez")).toBeVisible();
  expect(crearParticipante).toHaveBeenCalledWith("e1", { nombreCompleto: "Sofía Pérez", esMenor: false, activo: true });
  expect(crearSujetoComparsa).toHaveBeenCalledWith("e1", "c1", { tipoSujeto: "PERSONA", participanteId: "p1" });
  expect(nominarEnRubro).toHaveBeenCalledWith("e1", "v1", "r-reina", { sujetoId: "s1", especialidadId: "esp1" });
});

test("Etapa 3 (subtab Orden de salida) reorders comparsas for a DRAFT night and saves after modal confirmation", async () => {
  const guardarOrdenNoche = vi.fn(async () => ({ ok: true, cuerpo: { items: [] } }));

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "n1", orden: 1, nombre: "Primera noche", tipo: "COMPETENCIA", estado: "DRAFT" }] },
      }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarComparsas: async () => ({
        ok: true,
        cuerpo: {
          items: [
            { id: "c1", nombre: "Aramí", categoria: "PRIMERA", activa: true },
            { id: "c2", nombre: "Aymará", categoria: "PRIMERA", activa: true },
          ],
        },
      }),
      obtenerOrdenNoche: async () => ({
        ok: true,
        cuerpo: {
          items: [
            { comparsaId: "c1", orden: 1 },
            { comparsaId: "c2", orden: 2 },
          ],
        },
      }),
      guardarOrdenNoche,
    }}
  />);

  await screen.findByText("Primera noche");
  fireEvent.click(screen.getByRole("button", { name: /Comparsas y orden/ }));

  const secOrden = within(await screen.findByRole("region", { name: "Orden de salida por jornada" }));
  expect(await secOrden.findByText(/1\. Aramí/)).toBeVisible();
  fireEvent.click(secOrden.getByRole("button", { name: "Subir Aymará" }));
  expect(secOrden.getByText(/1\. Aymará/)).toBeVisible();

  fireEvent.click(secOrden.getByRole("button", { name: "Guardar orden" }));
  const modal = within(screen.getByRole("dialog", { name: "Guardar orden de salida" }));
  fireEvent.click(modal.getByRole("button", { name: "Confirmar orden" }));

  await secOrden.findByText(/Orden de salida guardado/);
  expect(guardarOrdenNoche).toHaveBeenCalledWith("e1", "n1", [
    { comparsaId: "c2", orden: 1 },
    { comparsaId: "c1", orden: 2 },
  ]);
});

test("Etapa 3 allows attaching an optional PNG logo when creating a comparsa and renders its thumbnail", async () => {
  let comparsas = [];
  const crearComparsa = vi.fn(async (_e, cuerpo) => {
    const nueva = { ...cuerpo, id: "c-logo", activa: true };
    comparsas = [...comparsas, nueva];
    return { ok: true, cuerpo: nueva };
  });

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarComparsas: async () => ({ ok: true, cuerpo: { items: comparsas } }),
      listarRubros: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarPlanillaVersion: async () => ({ ok: true, cuerpo: { items: [] } }),
      crearComparsa,
    }}
  />);

  fireEvent.click(screen.getByRole("button", { name: /Comparsas y orden/ }));
  const secComparsas = within(await screen.findByRole("region", { name: "Comparsas" }));
  fireEvent.change(secComparsas.getByLabelText("Nombre de la comparsa"), { target: { value: "Itá Verá" } });

  const archivo = new File([new Uint8Array([137, 80, 78, 71])], "ita-vera.png", { type: "image/png" });
  fireEvent.change(secComparsas.getByLabelText("Logo de la comparsa (opcional)"), { target: { files: [archivo] } });
  expect(await secComparsas.findByAltText("Vista previa del logo")).toBeVisible();

  fireEvent.click(secComparsas.getByRole("button", { name: "Agregar comparsa" }));
  expect(await secComparsas.findByAltText("Logo de Itá Verá")).toBeVisible();
  expect(crearComparsa).toHaveBeenCalledWith("e1", expect.objectContaining({
    nombre: "Itá Verá",
    logoDataUrl: expect.stringMatching(/^data:image\/png;base64,/),
  }));
});

test("Etapa 3 lets the admin choose which rubros require participant names", async () => {
  const actualizarRubro = vi.fn(async (_e, _v, rubroId, cuerpo) => ({
    ok: true,
    cuerpo: { id: rubroId, ...cuerpo },
  }));

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarComparsas: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "c1", nombre: "Ita Vera", categoria: "PRIMERA", activa: true }] },
      }),
      listarRubros: async () => ({
        ok: true,
        cuerpo: {
          items: [
            { id: "r-reina", nombre: "Reina de Carnaval", tipoSujeto: "COMPARSA", tipoRubro: "ALEATORIO", nominadosMaximosPorComparsa: 3, especialidadIds: ["esp1"] },
            { id: "r-traje", nombre: "Mejor Traje femenino", tipoSujeto: "PERSONA", tipoRubro: "ALEATORIO", nominadosMaximosPorComparsa: 1, especialidadIds: ["esp1"] },
          ],
        },
      }),
      listarPlanillaVersion: async () => ({ ok: true, cuerpo: { items: [] } }),
      actualizarRubro,
      nominarEnRubro: vi.fn(),
    }}
  />);

  fireEvent.click(screen.getByRole("button", { name: /Comparsas y orden/ }));
  const secComparsas = within(await screen.findByRole("region", { name: "Comparsas" }));
  fireEvent.click(secComparsas.getByRole("button", { name: "Participantes de Ita Vera" }));

  const secParticipantes = within(await screen.findByRole("region", { name: "Participantes de Ita Vera" }));
  const grupo = within(secParticipantes.getByRole("group", { name: "Rubros que requieren nombre de participante" }));
  const casillaReina = grupo.getByRole("checkbox", { name: "Reina de Carnaval" });
  expect(casillaReina).not.toBeChecked();

  fireEvent.click(casillaReina);

  expect(actualizarRubro).toHaveBeenCalledWith("e1", "v1", "r-reina", { tipoSujeto: "PERSONA" });
  expect(await secParticipantes.findByLabelText("Nombre para Reina de Carnaval")).toBeVisible();
});

test("Etapa 3 allows assigning the same participant to multiple rubros without creating duplicates", async () => {
  let filasPlanilla = [];
  const crearParticipante = vi.fn(async (_e, cuerpo) => ({
    ok: true,
    cuerpo: { ...cuerpo, id: "p-ana", activo: true },
  }));
  const crearSujetoComparsa = vi.fn(async (_e, _c, cuerpo) => ({
    ok: true,
    cuerpo: { ...cuerpo, id: "s-ana", activo: true },
  }));
  const nominarEnRubro = vi.fn(async (_e, _v, rubroId, { sujetoId, especialidadId }) => {
    const fila = {
      id: `f-${rubroId}-${especialidadId}`,
      rubroId,
      sujetoId,
      sujetoNombre: "Ana Gómez",
      comparsaId: "c1",
      comparsaNombre: "Poramba",
      especialidadId,
      origen: "MANUAL",
      excluida: false,
    };
    filasPlanilla = [...filasPlanilla, fila];
    return { ok: true, cuerpo: fila };
  });

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarComparsas: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "c1", nombre: "Poramba", categoria: "PRIMERA", activa: true }] },
      }),
      listarRubros: async () => ({
        ok: true,
        cuerpo: {
          items: [
            { id: "r1", nombre: "Reina de Comparsas", tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", especialidadIds: ["esp1"] },
            { id: "r2", nombre: "Reina del Carnaval", tipoSujeto: "PERSONA", tipoRubro: "ALEATORIO", nominadosMaximosPorComparsa: 3, especialidadIds: ["esp1"] },
            { id: "r3", nombre: "Mejor Traje Femenino", tipoSujeto: "PERSONA", tipoRubro: "ALEATORIO", nominadosMaximosPorComparsa: 1, especialidadIds: ["esp1"] },
          ],
        },
      }),
      listarPlanillaVersion: async () => ({ ok: true, cuerpo: { items: filasPlanilla } }),
      crearParticipante,
      crearSujetoComparsa,
      nominarEnRubro,
    }}
  />);

  fireEvent.click(screen.getByRole("button", { name: /Comparsas y orden/ }));
  const secComparsas = within(await screen.findByRole("region", { name: "Comparsas" }));
  fireEvent.click(secComparsas.getByRole("button", { name: "Participantes de Poramba" }));

  const secParticipantes = within(await screen.findByRole("region", { name: "Participantes de Poramba" }));
  fireEvent.change(secParticipantes.getByLabelText("Nombre para Reina de Comparsas"), { target: { value: "Ana Gómez" } });
  fireEvent.click(secParticipantes.getByRole("button", { name: "Asignar a Reina de Comparsas" }));

  const grupoAna = within(await secParticipantes.findByRole("group", { name: "Rubros de Ana Gómez" }));
  expect(grupoAna.getByRole("checkbox", { name: "Reina de Comparsas" })).toBeChecked();

  fireEvent.click(grupoAna.getByRole("checkbox", { name: "Reina del Carnaval" }));
  await screen.findByText(/«Ana Gómez» asignado a Reina del Carnaval/);

  fireEvent.click(grupoAna.getByRole("checkbox", { name: "Mejor Traje Femenino" }));
  await screen.findByText(/«Ana Gómez» asignado a Mejor Traje Femenino/);

  expect(crearParticipante).toHaveBeenCalledTimes(1);
  expect(crearSujetoComparsa).toHaveBeenCalledTimes(1);
  expect(nominarEnRubro).toHaveBeenCalledTimes(3);
  expect(nominarEnRubro).toHaveBeenNthCalledWith(1, "e1", "v1", "r1", { sujetoId: "s-ana", especialidadId: "esp1" });
  expect(nominarEnRubro).toHaveBeenNthCalledWith(2, "e1", "v1", "r2", { sujetoId: "s-ana", especialidadId: "esp1" });
  expect(nominarEnRubro).toHaveBeenNthCalledWith(3, "e1", "v1", "r3", { sujetoId: "s-ana", especialidadId: "esp1" });
});
