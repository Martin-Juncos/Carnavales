import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { crearClienteApi } from "../../shared/api/cliente-api.js";
import { PanelEscribano } from "./PanelEscribano.jsx";

test("the penalizaciones client posts explicit JSON confirmations", async () => {
  const fetch = vi.fn(async () => Response.json({ id: "p1" }));
  const api = crearClienteApi(fetch);
  await api.registrarPenalizacion("e1", { operationId: "op1", tipo: "MINIMO_INTEGRANTES" });
  expect(fetch).toHaveBeenCalledWith("/api/escribano/ediciones/e1/penalizaciones", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationId: "op1", tipo: "MINIMO_INTEGRANTES", confirmar: true }),
  });
  await api.anularPenalizacion("e1", "p1", { motivoAnulacion: "Error", referenciaActaAnulacion: "Acta 2" });
  expect(fetch).toHaveBeenLastCalledWith("/api/escribano/ediciones/e1/penalizaciones/p1/anular", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ motivoAnulacion: "Error", referenciaActaAnulacion: "Acta 2", confirmar: true }),
  });
});

test("the Escribano previews D14 discount, registers after confirmation, and voids an active penalty", async () => {
  const edicion = { id: "e1", nombre: "Carnaval 2027", anio: 2027, estado: "OPEN", cerradaEn: null };
  const creada = {
    id: "p1",
    operationId: "op-1",
    edicionId: "e1",
    noche: { id: "n1", nombre: "Primera noche", orden: 1 },
    comparsa: { id: "c1", nombre: "Aymara" },
    rubro: null,
    tipo: "RETRASO_INGRESO",
    minutos: 35,
    puntosDescuento: 15,
    cedioTurno: true,
    impidePremiosComparsa: false,
    motivo: "Demora técnica",
    referenciaActa: "Acta 12",
    estado: "ACTIVA",
    registradaEn: "2026-11-24T12:00:00Z",
    anulacion: null,
  };
  const anulada = {
    ...creada,
    estado: "ANULADA",
    anulacion: { anuladaEn: "2026-11-24T12:10:00Z", motivo: "Rectificada", referenciaActa: "Acta 13" },
  };
  const api = {
    listarNochesEscribano: async () => ({ ok: true, cuerpo: { items: [] } }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
    listarEdicionesEscribano: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
    consultarCierreTotal: vi.fn().mockResolvedValue({
      ok: true, cuerpo: { edicionId: "e1", estado: "OPEN", puedeCerrar: false, motivo: "noches_en_votacion", cerradaEn: null },
    }),
    cerrarVotacionTotal: vi.fn(),
    obtenerContextoPenalizaciones: async () => ({
      ok: true,
      cuerpo: {
        edicion,
        noches: [{ id: "n1", orden: 1, nombre: "Primera noche", estado: "OPEN", comparsas: [{ id: "c1", nombre: "Aymara", categoria: "PRIMERA" }] }],
        rubros: [{ id: "r1", codigo: "BAT", nombre: "Show de batería", tipoSujeto: "BATERIA" }],
      },
    }),
    listarPenalizaciones: vi.fn().mockResolvedValue({ ok: true, cuerpo: { items: [] } }),
    registrarPenalizacion: vi.fn().mockResolvedValue({ ok: true, status: 201, cuerpo: creada }),
    anularPenalizacion: vi.fn().mockResolvedValue({ ok: true, status: 200, cuerpo: anulada }),
  };

  render(<PanelEscribano api={api} />);
  const seccionPenalizaciones = screen.getByRole("region", { name: "Penalizaciones" });
  fireEvent.click(await within(seccionPenalizaciones).findByRole("button", { name: /Carnaval 2027 · 2027/ }));

  await within(seccionPenalizaciones).findByText("Todavía no hay penalizaciones registradas.");
  fireEvent.change(within(seccionPenalizaciones).getByLabelText("Minutos"), { target: { value: "35" } });
  expect(within(seccionPenalizaciones).getByText(/15,00 pts.*cede turno/i)).toBeVisible();
  fireEvent.change(within(seccionPenalizaciones).getByLabelText("Motivo"), { target: { value: "Demora técnica" } });
  fireEvent.change(within(seccionPenalizaciones).getByLabelText("Referencia de acta"), { target: { value: "Acta 12" } });

  fireEvent.click(within(seccionPenalizaciones).getByRole("button", { name: "Registrar penalización" }));
  expect(api.registrarPenalizacion).not.toHaveBeenCalled();

  const modalRegistro = screen.getByRole("dialog");
  fireEvent.click(within(modalRegistro).getByRole("button", { name: "Confirmar penalización" }));
  await within(seccionPenalizaciones).findByText("Demora técnica");
  expect(api.registrarPenalizacion).toHaveBeenCalledTimes(1);
  expect(api.registrarPenalizacion.mock.calls[0][0]).toBe("e1");
  expect(api.registrarPenalizacion.mock.calls[0][1]).toMatchObject({
    nocheId: "n1", comparsaId: "c1", tipo: "RETRASO_INGRESO", minutos: 35, motivo: "Demora técnica", referenciaActa: "Acta 12",
  });
  expect(typeof api.registrarPenalizacion.mock.calls[0][1].operationId).toBe("string");

  fireEvent.click(within(seccionPenalizaciones).getByRole("button", { name: "Anular" }));
  const modalAnular = screen.getByRole("dialog");
  fireEvent.change(within(modalAnular).getByLabelText("Motivo de anulación"), { target: { value: "Rectificada" } });
  fireEvent.change(within(modalAnular).getByLabelText("Referencia de acta de anulación"), { target: { value: "Acta 13" } });
  fireEvent.click(within(modalAnular).getByRole("button", { name: "Confirmar anulación" }));

  await within(seccionPenalizaciones).findByText("Anulada");
  expect(api.anularPenalizacion).toHaveBeenCalledExactlyOnceWith("e1", "p1", {
    motivoAnulacion: "Rectificada", referenciaActaAnulacion: "Acta 13",
  });
});

test("penalizaciones switches to read-only when the edition is CLOSED", async () => {
  const edicion = { id: "e1", nombre: "Carnaval 2027", anio: 2027, estado: "CLOSED", cerradaEn: "2026-11-24T13:00:00Z" };
  const api = {
    listarNochesEscribano: async () => ({ ok: true, cuerpo: { items: [] } }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
    listarEdicionesEscribano: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
    consultarCierreTotal: vi.fn(),
    cerrarVotacionTotal: vi.fn(),
    obtenerContextoPenalizaciones: async () => ({ ok: true, cuerpo: { edicion, noches: [], rubros: [] } }),
    listarPenalizaciones: async () => ({
      ok: true,
      cuerpo: {
        items: [{
          id: "p1", operationId: "op1", edicionId: "e1",
          noche: { id: "n1", nombre: "Primera noche", orden: 1 },
          comparsa: { id: "c1", nombre: "Aymara" }, rubro: null,
          tipo: "MINIMO_INTEGRANTES", minutos: null, puntosDescuento: 0,
          cedioTurno: false, impidePremiosComparsa: true,
          motivo: "Sin mínimo", referenciaActa: "Acta 5", estado: "ACTIVA",
          registradaEn: "2026-11-24T12:00:00Z", anulacion: null,
        }],
      },
    }),
    registrarPenalizacion: vi.fn(),
    anularPenalizacion: vi.fn(),
  };

  render(<PanelEscribano api={api} />);
  const seccion = screen.getByRole("region", { name: "Penalizaciones" });
  fireEvent.click(await within(seccion).findByRole("button", { name: /Carnaval 2027 · 2027/ }));
  await within(seccion).findByText("Las penalizaciones quedaron congeladas por el cierre total.");
  expect(within(seccion).queryByRole("button", { name: "Registrar penalización" })).toBeNull();
  expect(within(seccion).queryByRole("button", { name: "Anular" })).toBeNull();
});

test("failed penalty confirmation renders a single alert inside the modal and clears on cancel", async () => {
  const edicion = { id: "e1", nombre: "Carnaval 2027", anio: 2027, estado: "OPEN", cerradaEn: null };
  const api = {
    listarNochesEscribano: async () => ({ ok: true, cuerpo: { items: [] } }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
    listarEdicionesEscribano: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
    consultarCierreTotal: vi.fn().mockResolvedValue({
      ok: true, cuerpo: { edicionId: "e1", estado: "OPEN", puedeCerrar: false, motivo: "noches_en_votacion", cerradaEn: null },
    }),
    cerrarVotacionTotal: vi.fn(),
    obtenerContextoPenalizaciones: async () => ({
      ok: true,
      cuerpo: {
        edicion,
        noches: [{ id: "n1", orden: 1, nombre: "Primera noche", estado: "OPEN", comparsas: [{ id: "c1", nombre: "Aymara", categoria: "PRIMERA" }] }],
        rubros: [],
      },
    }),
    listarPenalizaciones: async () => ({ ok: true, cuerpo: { items: [] } }),
    registrarPenalizacion: vi.fn().mockResolvedValue({ ok: false, cuerpo: { mensaje: "Fallo de prueba." } }),
    anularPenalizacion: vi.fn(),
  };

  render(<PanelEscribano api={api} />);
  const seccion = screen.getByRole("region", { name: "Penalizaciones" });
  fireEvent.click(await within(seccion).findByRole("button", { name: /Carnaval 2027 · 2027/ }));
  await within(seccion).findByText("Todavía no hay penalizaciones registradas.");
  fireEvent.change(within(seccion).getByLabelText("Motivo"), { target: { value: "Demora" } });
  fireEvent.change(within(seccion).getByLabelText("Referencia de acta"), { target: { value: "Acta 99" } });
  fireEvent.click(within(seccion).getByRole("button", { name: "Registrar penalización" }));

  const modal = screen.getByRole("dialog");
  fireEvent.click(within(modal).getByRole("button", { name: "Confirmar penalización" }));
  expect(await within(modal).findByRole("alert")).toHaveTextContent("Fallo de prueba.");
  expect(screen.getAllByRole("alert")).toHaveLength(1);

  fireEvent.click(within(modal).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});
