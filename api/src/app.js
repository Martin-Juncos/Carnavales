import { join } from "node:path";
import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { crearRutasAdminAsignaciones } from "./admin-asignaciones.js";
import { crearRutasAdminEdiciones } from "./admin-ediciones.js";
import { crearRutasAdminInvitaciones } from "./admin-invitaciones.js";
import { crearRutasMiCuenta } from "./mi-cuenta.js";
import { crearRutasAdminUsuarios } from "./admin-usuarios.js";
import { crearRutaAceptarInvitacion } from "./invitaciones-publicas.js";
import { iniciarContextoPeticion } from "./contexto-peticion.js";

// Crea la aplicación Express con todas sus rutas.
// auth es opcional: sin él solo quedan /health y, si hay clienteDir, el cliente web.
export function createApp({ pool, auth, appUrl, enviarInvitacion, secret, baseUrl, clienteDir, trustProxy = false }) {
  const app = express();
  // Con un proxy delante, request.ip sale de X-Forwarded-For solo si el número de saltos es confiable.
  // Sin esto, todos los usuarios detrás del proxy compartirían la IP y el límite por IP sería injusto.
  app.set("trust proxy", trustProxy);

  // Better Auth gestiona sus propias rutas. Se monta antes de cualquier middleware de cuerpo.
  if (auth) {
    // Una sola fuente de la sesión para todos los routers: la identidad siempre
    // se deriva de las cabeceras de la petición, nunca de datos enviados por el cliente.
    const obtenerSesion = (request) => auth.api.getSession({ headers: fromNodeHeaders(request.headers) });

    // Abre el contexto (IP, fallo de entrega) para cada petición de autenticación.
    app.use("/api/auth", iniciarContextoPeticion);
    // Todas las rutas /api/auth/* las responde Better Auth.
    app.all("/api/auth/*splat", toNodeHandler(auth));

    // Ruta pública para aceptar invitaciones.
    app.use("/api/invitaciones", crearRutaAceptarInvitacion({ pool, secret, baseUrl }));

    // Datos propios de la persona con sesión (sus roles), para el selector de rol.
    app.use(
      "/api/mi-cuenta",
      crearRutasMiCuenta({
        pool,
        obtenerSesion,
      }),
    );

    // Administración de usuarios. La sesión se lee con las cabeceras de la petición.
    app.use(
      "/api/admin/usuarios",
      crearRutasAdminUsuarios({
        pool,
        obtenerSesion,
      }),
    );

    // Administración de ediciones: crear una edición vacía y consultar su estado.
    app.use(
      "/api/admin/ediciones",
      crearRutasAdminEdiciones({
        pool,
        obtenerSesion,
      }),
    );

    // Consulta de asignaciones de jurados y de jurados disponibles.
    app.use(
      "/api/admin",
      crearRutasAdminAsignaciones({
        pool,
        obtenerSesion,
      }),
    );

    // Administración de invitaciones.
    app.use(
      "/api/admin/invitaciones",
      crearRutasAdminInvitaciones({
        pool,
        appUrl,
        enviar: enviarInvitacion,
        obtenerSesion,
      }),
    );
  }

  // Comprobación de salud: responde 200 si la base contesta y 503 si no.
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
    // Sirve los archivos estáticos (JS, CSS, imágenes) del cliente compilado.
    app.use(express.static(clienteDir));
    // Cualquier otra ruta devuelve index.html, para que el cliente resuelva su propio ruteo.
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
