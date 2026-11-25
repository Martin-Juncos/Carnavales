import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "../../../../App.jsx";

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
