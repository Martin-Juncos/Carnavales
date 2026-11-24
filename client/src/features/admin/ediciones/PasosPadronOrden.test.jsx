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

test("Paso 3 (Comparsas y padrón) creates a comparsa, a participant, and an evaluable subject", async () => {
  let comparsas = [];
  let participantes = [];
  let sujetos = [];

  const crearComparsa = vi.fn(async (_e, cuerpo) => {
    const nueva = { ...cuerpo, id: "c1", activa: true };
    comparsas = [...comparsas, nueva];
    return { ok: true, cuerpo: nueva };
  });
  const crearParticipante = vi.fn(async (_e, cuerpo) => {
    const nuevo = { ...cuerpo, id: "p1", activo: true };
    participantes = [...participantes, nuevo];
    return { ok: true, cuerpo: nuevo };
  });
  const crearSujetoComparsa = vi.fn(async (_e, _c, cuerpo) => {
    const nuevo = { ...cuerpo, id: "s1", activo: true };
    sujetos = [...sujetos, nuevo];
    return { ok: true, cuerpo: nuevo };
  });

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarComparsas: async () => ({ ok: true, cuerpo: { items: comparsas } }),
      crearComparsa,
      listarParticipantes: async () => ({ ok: true, cuerpo: { items: participantes } }),
      crearParticipante,
      listarSujetosComparsa: async () => ({ ok: true, cuerpo: { items: sujetos } }),
      crearSujetoComparsa,
    }}
  />);

  fireEvent.click(screen.getByRole("button", { name: /Comparsas y padrón/ }));

  const secComparsas = within(await screen.findByRole("region", { name: "Comparsas" }));
  fireEvent.change(secComparsas.getByLabelText("Nombre de la comparsa"), { target: { value: "Aramí" } });
  fireEvent.change(secComparsas.getByLabelText("Categoría"), { target: { value: "PRIMERA" } });
  fireEvent.click(secComparsas.getByRole("button", { name: "Agregar comparsa" }));
  expect(await secComparsas.findByText("Aramí")).toBeVisible();
  expect(crearComparsa).toHaveBeenCalledWith("e1", { nombre: "Aramí", categoria: "PRIMERA", activa: true });

  const secParticipantes = within(screen.getByRole("region", { name: "Participantes" }));
  fireEvent.change(secParticipantes.getByLabelText("Nombre completo"), { target: { value: "Sofía Pérez" } });
  fireEvent.click(secParticipantes.getByRole("button", { name: "Agregar participante" }));
  expect(await secParticipantes.findByText("Sofía Pérez")).toBeVisible();
  expect(crearParticipante).toHaveBeenCalledWith("e1", { nombreCompleto: "Sofía Pérez", esMenor: false, activo: true });

  fireEvent.click(secComparsas.getByRole("button", { name: "Sujetos de Aramí" }));
  const secSujetos = within(await screen.findByRole("region", { name: "Sujetos evaluables de Aramí" }));
  fireEvent.change(secSujetos.getByLabelText("Tipo de sujeto"), { target: { value: "PERSONA" } });
  fireEvent.change(secSujetos.getByLabelText("Participante"), { target: { value: "p1" } });
  fireEvent.click(secSujetos.getByRole("button", { name: "Agregar sujeto" }));
  await secSujetos.findByText(/Sofía Pérez/);
  expect(crearSujetoComparsa).toHaveBeenCalledWith("e1", "c1", { tipoSujeto: "PERSONA", participanteId: "p1" });
});

test("Paso 4 (Orden de salida) reorders comparsas for a DRAFT night and saves after modal confirmation", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: /Orden de salida/ }));

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
