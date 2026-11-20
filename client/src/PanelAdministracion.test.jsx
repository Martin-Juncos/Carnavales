import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "./App.jsx";

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
