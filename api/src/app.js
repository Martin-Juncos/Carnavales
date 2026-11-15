import { join } from "node:path";
import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { crearRutasAdminInvitaciones } from "./admin-invitaciones.js";
import { crearRutasAdminUsuarios } from "./admin-usuarios.js";
import { crearRutaAceptarInvitacion } from "./invitaciones-publicas.js";
import { iniciarContextoPeticion } from "./contexto-peticion.js";

export function createApp({ pool, auth, appUrl, enviarInvitacion, secret, baseUrl, clienteDir }) {
  const app = express();

  // Better Auth gestiona sus propias rutas. Se monta antes de cualquier middleware de cuerpo.
  if (auth) {
    app.use("/api/auth", iniciarContextoPeticion);
    app.all("/api/auth/*splat", toNodeHandler(auth));

    app.use("/api/invitaciones", crearRutaAceptarInvitacion({ pool, secret, baseUrl }));

    app.use(
      "/api/admin/usuarios",
      crearRutasAdminUsuarios({
        pool,
        obtenerSesion: (request) => auth.api.getSession({ headers: fromNodeHeaders(request.headers) }),
      }),
    );

    app.use(
      "/api/admin/invitaciones",
      crearRutasAdminInvitaciones({
        pool,
        appUrl,
        enviar: enviarInvitacion,
        obtenerSesion: (request) => auth.api.getSession({ headers: fromNodeHeaders(request.headers) }),
      }),
    );
  }

  app.get("/health", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
      response.status(200).json({ status: "ok", database: "ok" });
    } catch {
      response.status(503).json({
        status: "error",
        database: "unavailable",
      });
    }
  });

  // Mismo origen en producción: Express sirve el cliente compilado y su fallback de aplicación.
  // Las rutas /api que no existen responden 404 y nunca reciben index.html.
  if (clienteDir) {
    app.use(express.static(clienteDir));
    app.get("/*splat", (request, response, next) => {
      if (request.path.startsWith("/api/") || request.path === "/api") {
        next();
        return;
      }
      response.sendFile(join(clienteDir, "index.html"));
    });
  }

  return app;
}
