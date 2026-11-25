import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "../../../../App.jsx";
import { crearClienteApi } from "../../../../shared/api/cliente-api.js";

test("administration opens on voting and switches to account management without losing a draft", async () => {
  const respuesta = (cuerpo) => ({ ok: true, cuerpo });
  const listar = async () => respuesta({ items: [], total: 0 });
  render(<App api={{
    obtenerSesion: async () => respuesta({ user: { id: "admin", name: "Ana" } }),
    obtenerMisRoles: async () => respuesta({ roles: ["ADMINISTRADOR"] }),
    cerrarSesion: vi.fn().mockResolvedValue(respuesta({})),
    listarEdiciones: listar, listarJurados: listar, listarNoches: listar,
    listarEspecialidades: listar, listarAsignaciones: listar,
    listarUsuarios: listar, listarInvitaciones: listar,
  }} />);

  expect(await screen.findByRole("heading", { name: "Ediciones" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Usuarios" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), { target: { value: "Carnaval" } });
  fireEvent.click(screen.getByRole("button", { name: "Usuarios e invitaciones" }));
  expect(await screen.findByRole("heading", { name: "Usuarios" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Invitaciones" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Ediciones" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Control de votación" }));
  expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Carnaval");
});

test("the assignment selector follows changes to the Jurado role without reloading the page", async () => {
  const respuesta = (cuerpo) => ({ ok: true, cuerpo });
  const listar = (items = []) => respuesta({ items, total: items.length });
  const persona = { id: "j", nombre: "Lucía", correo: "lucia@example.test" };
  let roles = [];
  render(<App api={{
    obtenerSesion: async () => respuesta({ user: { id: "admin", name: "Ana" } }),
    obtenerMisRoles: async () => respuesta({ roles: ["ADMINISTRADOR"] }),
    listarEdiciones: async () => listar(),
    listarNoches: async () => listar([{ id: "n", nombre: "Primera noche", estado: "DRAFT", edicion: { nombre: "Carnaval" } }]),
    listarEspecialidades: async () => listar(),
    listarAsignaciones: async () => listar(),
    listarJurados: async () => listar(roles.includes("JURADO") ? [persona] : []),
    listarUsuarios: async () => listar([{ ...persona, roles, sesionActiva: false }]),
    listarInvitaciones: async () => listar(),
    asignarRol: async () => { roles = ["JURADO"]; return respuesta({}); },
    retirarRol: async () => { roles = []; return respuesta({}); },
  }} />);

  const selector = within(await screen.findByRole("combobox", { name: "Jurado" }));
  const irACuentas = () => fireEvent.click(screen.getByRole("button", { name: "Usuarios e invitaciones" }));
  const irAVotacion = () => fireEvent.click(screen.getByRole("button", { name: "Control de votación" }));
  expect(selector.queryByRole("option", { name: "Lucía" })).toBeNull();

  irACuentas();
  fireEvent.change(await screen.findByRole("combobox", { name: "Rol para Lucía" }), { target: { value: "JURADO" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar", exact: true }));
  await screen.findByText("Rol Jurado asignado a Lucía.");
  irAVotacion();
  expect(await selector.findByRole("option", { name: "Lucía" })).toBeInTheDocument();

  irACuentas();
  fireEvent.click(await screen.findByRole("button", { name: "Quitar", exact: true }));
  await screen.findByText("Rol Jurado quitado a Lucía.");
  irAVotacion();
  await waitFor(() => expect(selector.queryByRole("option", { name: "Lucía" })).toBeNull());
});

test("Mis eventos hub filters editions by search query and status, and supports retiring an edition with confirmation", async () => {
  const respuesta = (cuerpo) => ({ ok: true, cuerpo });
  const listar = async () => respuesta({ items: [], total: 0 });
  let ediciones = [
    { id: "e1", nombre: "Carnaval de Goya", anio: 2027, estado: "CONFIGURING" },
    { id: "e2", nombre: "Edición Histórica", anio: 2025, estado: "CLOSED" },
  ];
  const retirarEdicion = vi.fn(async (id) => {
    ediciones = ediciones.filter((e) => e.id !== id);
    return respuesta({ edicionId: id, retiradaEn: "2026-11-24T15:00:00Z" });
  });
  render(<App api={{
    obtenerSesion: async () => respuesta({ user: { id: "admin", name: "Ana" } }),
    obtenerMisRoles: async () => respuesta({ roles: ["ADMINISTRADOR"] }),
    listarEdiciones: async () => respuesta({ items: ediciones }),
    retirarEdicion,
    listarJurados: listar, listarNoches: listar, listarEspecialidades: listar,
    listarAsignaciones: listar, listarUsuarios: listar, listarInvitaciones: listar,
  }} />);

  expect(await screen.findByRole("button", { name: "Configurar Carnaval de Goya 2027" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Configurar Edición Histórica 2025" })).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar evento" }), { target: { value: "Goya" } });
  expect(screen.getByRole("button", { name: "Configurar Carnaval de Goya 2027" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Configurar Edición Histórica 2025" })).toBeNull();

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar evento" }), { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado" }), { target: { value: "CLOSED" } });
  expect(screen.queryByRole("button", { name: "Configurar Carnaval de Goya 2027" })).toBeNull();
  expect(screen.getByRole("button", { name: "Configurar Edición Histórica 2025" })).toBeVisible();

  fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado" }), { target: { value: "ALL" } });
  fireEvent.click(screen.getByRole("button", { name: "Retirar Carnaval de Goya 2027" }));
  const modal = within(screen.getByRole("dialog", { name: "Retirar edición" }));
  fireEvent.click(modal.getByRole("button", { name: "Confirmar retiro" }));
  await screen.findByText("Edición retirada.");
  expect(retirarEdicion).toHaveBeenCalledWith("e1");
  expect(screen.queryByRole("button", { name: "Configurar Carnaval de Goya 2027" })).toBeNull();
});

test("crearClienteApi exposes existing admin configuration, padron, publication, and opening routes", async () => {
  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  const api = crearClienteApi(fetchMock);
  await api.retirarEdicion("ed-1");
  await api.abrirEdicion("ed-1", "op-1");
  await api.abrirNoche("ed-1", "n-1", "op-2");
  await api.listarRubros("ed-1", "v-1");
  await api.guardarOrdenNoche("ed-1", "n-1", [{ comparsaId: "c-1", orden: 1 }]);
  await api.publicarVersion("ed-1", "v-1");

  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/admin/ediciones/ed-1/retiro", expect.objectContaining({
    method: "POST", body: JSON.stringify({ confirmar: true }),
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/ediciones/ed-1/apertura", expect.objectContaining({
    method: "POST", body: JSON.stringify({ claveOperacion: "op-1" }),
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/admin/ediciones/ed-1/noches/n-1/apertura", expect.objectContaining({
    method: "POST", body: JSON.stringify({ claveOperacion: "op-2" }),
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/admin/ediciones/ed-1/versiones/v-1/rubros", expect.objectContaining({
    method: "GET",
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/admin/ediciones/ed-1/noches/n-1/orden", expect.objectContaining({
    method: "PUT", body: JSON.stringify({ items: [{ comparsaId: "c-1", orden: 1 }] }),
  }));
  expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/admin/ediciones/ed-1/versiones/v-1/publicar", expect.objectContaining({
    method: "POST",
  }));
});
