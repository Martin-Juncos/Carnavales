import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../../../../App.jsx";
import { crearClienteApi } from "../../../../shared/api/cliente-api.js";

beforeEach(() => {
  window.sessionStorage.clear();
});

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

  expect(await screen.findByRole("heading", { name: "Mis eventos" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Usuarios" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Nuevo evento" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), { target: { value: "Carnaval" } });
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Nuevo evento" }), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Personas y accesos" }));
  expect(await screen.findByRole("heading", { name: "Usuarios" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Invitaciones" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Mis eventos" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Panel de control" }));
  fireEvent.click(screen.getByRole("button", { name: "Nuevo evento" }));
  expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("Carnaval");
});

test("assignments live in their own navigation view, separate from the control panel", async () => {
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

  expect(await screen.findByRole("heading", { name: "Mis eventos" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Asignaciones de jurado" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Asignaciones" }));
  expect(await screen.findByRole("heading", { name: "Asignaciones de jurado" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Mis eventos" })).toBeNull();
  expect(screen.getByRole("button", { name: "Asignaciones" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "Panel de control" }));
  expect(screen.queryByRole("heading", { name: "Asignaciones de jurado" })).toBeNull();
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

  const irACuentas = () => fireEvent.click(screen.getByRole("button", { name: "Personas y accesos" }));
  const irAAsignaciones = () => fireEvent.click(screen.getByRole("button", { name: "Asignaciones" }));
  await screen.findByRole("heading", { name: "Mis eventos" });
  irAAsignaciones();
  const selector = within(await screen.findByRole("combobox", { name: "Jurado" }));
  expect(selector.queryByRole("option", { name: "Lucía" })).toBeNull();

  irACuentas();
  fireEvent.change(await screen.findByRole("combobox", { name: "Rol para Lucía" }), { target: { value: "JURADO" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar", exact: true }));
  await screen.findByText("Rol Jurado asignado a Lucía.");
  irAAsignaciones();
  expect(await selector.findByRole("option", { name: "Lucía" })).toBeInTheDocument();

  irACuentas();
  fireEvent.click(await screen.findByRole("button", { name: "Quitar", exact: true }));
  await screen.findByText("Rol Jurado quitado a Lucía.");
  irAAsignaciones();
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

  expect(await screen.findByRole("button", { name: "Administrar evento Carnaval de Goya 2027" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Administrar evento Edición Histórica 2025" })).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar evento" }), { target: { value: "Goya" } });
  expect(screen.getByRole("button", { name: "Administrar evento Carnaval de Goya 2027" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Administrar evento Edición Histórica 2025" })).toBeNull();

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar evento" }), { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado" }), { target: { value: "CLOSED" } });
  expect(screen.queryByRole("button", { name: "Administrar evento Carnaval de Goya 2027" })).toBeNull();
  expect(screen.getByRole("button", { name: "Administrar evento Edición Histórica 2025" })).toBeVisible();

  fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado" }), { target: { value: "ALL" } });
  fireEvent.click(screen.getByRole("button", { name: "Más opciones de Carnaval de Goya 2027" }));
  fireEvent.click(screen.getByRole("button", { name: "Retirar del listado Carnaval de Goya 2027" }));
  const modal = within(screen.getByRole("dialog", { name: "Retirar edición" }));
  fireEvent.click(modal.getByRole("button", { name: "Confirmar retiro" }));
  await screen.findByText("Edición retirada.");
  expect(retirarEdicion).toHaveBeenCalledWith("e1");
  expect(screen.queryByRole("button", { name: "Administrar evento Carnaval de Goya 2027" })).toBeNull();
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

test("la sección activa de administración se conserva al recargar la página", async () => {
  window.sessionStorage.clear();
  const respuesta = (cuerpo) => ({ ok: true, cuerpo });
  const listar = async () => respuesta({ items: [], total: 0 });
  const api = {
    obtenerSesion: async () => respuesta({ user: { id: "admin", name: "Ana" } }),
    obtenerMisRoles: async () => respuesta({ roles: ["ADMINISTRADOR"] }),
    cerrarSesion: vi.fn().mockResolvedValue(respuesta({})),
    listarEdiciones: listar, listarJurados: listar, listarNoches: listar,
    listarEspecialidades: listar, listarAsignaciones: listar,
    listarUsuarios: listar, listarInvitaciones: listar,
  };

  const primeraCarga = render(<App api={api} />);
  expect(await screen.findByRole("heading", { name: "Mis eventos" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Personas y accesos" }));
  expect(await screen.findByRole("heading", { name: "Usuarios" })).toBeVisible();
  primeraCarga.unmount();

  const recarga = render(<App api={api} />);
  expect(await screen.findByRole("heading", { name: "Usuarios" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Personas y accesos" })).toHaveAttribute("aria-pressed", "true");
  recarga.unmount();
  window.sessionStorage.clear();
});
