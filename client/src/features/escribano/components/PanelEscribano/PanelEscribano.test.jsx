import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "../../../../App.jsx";
import { crearClienteApi } from "../../../../shared/api/cliente-api.js";
import { PanelEscribano } from "./PanelEscribano.jsx";

test("the closure client posts an explicit JSON confirmation", async () => {
  const fetch = vi.fn(async () => Response.json({ estado: "CLOSED" }));
  await crearClienteApi(fetch).cerrarNoche("e", "n");
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/escribano/ediciones/e/noches/n/cierre", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmar: true }),
  });
});

test("the Escribano sees a blocker and closes a ready night only after confirmation", async () => {
  const noche = { id: "n", nombre: "Primera noche", estado: "OPEN", edicion: { id: "e", nombre: "Carnaval 2027" } };
  const respuesta = (cuerpo) => ({ ok: true, cuerpo });
  const api = {
    obtenerSesion: async () => respuesta({ user: { id: "escribano", name: "Escribano" } }),
    obtenerMisRoles: async () => respuesta({ roles: ["ESCRIBANO"] }),
    listarNochesEscribano: async () => respuesta({ items: [noche] }),
    consultarCierreNoche: vi.fn()
      .mockResolvedValueOnce(respuesta({ nocheId: "n", puedeCerrar: false, motivo: "planillas_pendientes" }))
      .mockResolvedValue(respuesta({ nocheId: "n", puedeCerrar: true, motivo: null })),
    cerrarNoche: vi.fn().mockResolvedValue(respuesta({ nocheId: "n", estado: "CLOSED", cerradaEn: "2026-11-20T10:00:00Z" })),
  };
  render(<App api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /Primera noche/ }));
  await screen.findByText("Hay planillas esperadas que el servidor todavía no recibió.");
  expect(screen.getByRole("button", { name: "Cerrar noche" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
  await screen.findByText("La noche puede cerrarse.");
  fireEvent.click(screen.getByRole("button", { name: "Cerrar noche" }));
  expect(api.cerrarNoche).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre" }));
  await screen.findByText("Noche cerrada.");
  expect(api.cerrarNoche).toHaveBeenCalledExactlyOnceWith("e", "n");
});

test("cancel never posts and failed closure requires refreshing readiness", async () => {
  const api = {
    listarNochesEscribano: async () => ({ ok: true, cuerpo: {
      items: [{ id: "n", nombre: "Ronda", estado: "OPEN", edicion: { id: "e", nombre: "Carnaval" } }],
    } }),
    consultarCierreNoche: vi.fn().mockResolvedValue({ ok: true, cuerpo: { nocheId: "n", puedeCerrar: true } }),
    cerrarNoche: vi.fn()
      .mockResolvedValueOnce({ ok: false, cuerpo: { error: "planillas_pendientes" } })
      .mockRejectedValueOnce(new TypeError("Connection dropped")),
  };
  render(<PanelEscribano api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /Ronda/ }));
  await screen.findByText("La noche puede cerrarse.");
  const cerrar = screen.getByRole("button", { name: "Cerrar noche" });
  const abrir = () => fireEvent.click(cerrar);
  const confirmar = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre" }));
  abrir();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  abrir();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.cerrarNoche).not.toHaveBeenCalled();
  abrir();
  confirmar();
  expect(await screen.findByRole("alert")).toHaveTextContent(/planillas esperadas/);
  expect(cerrar).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Actualizar estado" }));
  await screen.findByText("La noche puede cerrarse.");
  abrir();
  confirmar();
  expect(await screen.findByRole("alert")).toHaveTextContent(/No se pudo confirmar/);
  expect(cerrar).toBeDisabled();
  expect(api.cerrarNoche.mock.calls).toEqual([["e", "n"], ["e", "n"]]);
});

test("a failed night list can be retried without offering closure", async () => {
  const api = {
    listarNochesEscribano: vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, cuerpo: { items: [] } }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
  };
  render(<PanelEscribano api={api} />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("No hay noches competitivas.");
  expect(screen.queryByRole("button", { name: "Cerrar noche" })).toBeNull();
  expect(api.consultarCierreNoche).not.toHaveBeenCalled();
  expect(api.cerrarNoche).not.toHaveBeenCalled();
});

test("the total-closure client posts an explicit JSON confirmation", async () => {
  const fetch = vi.fn(async () => Response.json({ edicionId: "e", estado: "CLOSED", cerradaEn: "2026-11-24T12:00:00Z" }));
  await crearClienteApi(fetch).cerrarVotacionTotal("e");
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/escribano/ediciones/e/cierre", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmar: true }),
  });
});

test("the Escribano sees total-closure blockers and closes voting only after explicit confirmation", async () => {
  const edicion = { id: "e", nombre: "Carnaval 2027", anio: 2027, estado: "OPEN", cerradaEn: null };
  const respuesta = (cuerpo) => ({ ok: true, cuerpo });
  const api = {
    listarNochesEscribano: async () => respuesta({ items: [] }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
    listarEdicionesEscribano: async () => respuesta({ items: [edicion] }),
    consultarCierreTotal: vi.fn()
      .mockResolvedValueOnce(respuesta({
        edicionId: "e", estado: "OPEN", puedeCerrar: false, motivo: "noches_puntuables_pendientes", cerradaEn: null,
      }))
      .mockResolvedValue(respuesta({
        edicionId: "e", estado: "OPEN", puedeCerrar: true, motivo: null, cerradaEn: null,
      })),
    cerrarVotacionTotal: vi.fn().mockResolvedValue(respuesta({
      edicionId: "e", estado: "CLOSED", cerradaEn: "2026-11-24T12:00:00Z",
    })),
  };

  render(<PanelEscribano api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /Carnaval 2027 · 2027/ }));
  await screen.findByText("Todavía quedan noches competitivas puntuables sin cerrar.");
  const botonCerrar = screen.getByRole("button", { name: "Cerrar votación completa" });
  expect(botonCerrar).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Actualizar estado de la edición" }));
  await screen.findByText("La votación completa puede cerrarse.");
  expect(botonCerrar).toBeEnabled();

  fireEvent.click(botonCerrar);
  expect(api.cerrarVotacionTotal).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.cerrarVotacionTotal).not.toHaveBeenCalled();

  fireEvent.click(botonCerrar);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre total" }));
  await screen.findByText("Votación completa cerrada.");
  expect(api.cerrarVotacionTotal).toHaveBeenCalledExactlyOnceWith("e");
});

test("failed total closure clears readiness and shows blocker message", async () => {
  const edicion = { id: "e", nombre: "Carnaval 2027", anio: 2027, estado: "OPEN", cerradaEn: null };
  const api = {
    listarNochesEscribano: async () => ({ ok: true, cuerpo: { items: [] } }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
    listarEdicionesEscribano: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
    consultarCierreTotal: vi.fn().mockResolvedValue({
      ok: true, cuerpo: { edicionId: "e", estado: "OPEN", puedeCerrar: true, motivo: null, cerradaEn: null },
    }),
    cerrarVotacionTotal: vi.fn().mockResolvedValueOnce({ ok: false, cuerpo: { error: "noches_en_votacion" } }),
  };

  render(<PanelEscribano api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: /Carnaval 2027 · 2027/ }));
  await screen.findByText("La votación completa puede cerrarse.");
  const botonCerrar = screen.getByRole("button", { name: "Cerrar votación completa" });
  fireEvent.click(botonCerrar);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cierre total" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/noche competitiva en votación/i);
  expect(botonCerrar).toBeDisabled();
});
