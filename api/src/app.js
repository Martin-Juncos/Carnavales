import { join } from "node:path";
import express from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { crearRutasAdminAsignaciones } from "./modules/votacion/admin-asignaciones.routes.js";
import { crearRutasAdminEdiciones } from "./modules/ediciones/admin-ediciones.routes.js";
import { crearRutasAdminPadron } from "./modules/padron/admin-padron.routes.js";
import { crearRutasAdminApertura } from "./modules/ediciones/admin-apertura.routes.js";
import { crearRutasAdminReglamento } from "./modules/reglamento/admin-reglamento.routes.js";
import { crearRutasAdminPlanilla } from "./modules/reglamento/admin-planilla.routes.js";
import { crearRutasAdminInvitaciones } from "./modules/usuarios/admin-invitaciones.routes.js";
import { crearRutasMiCuenta } from "./modules/auth/mi-cuenta.routes.js";
import { crearRutasAdminUsuarios } from "./modules/usuarios/admin-usuarios.routes.js";
import { crearRutaAceptarInvitacion } from "./modules/usuarios/invitaciones-publicas.routes.js";
import { iniciarContextoPeticion } from "./http/contexto-peticion.js";
import { crearRutasJurado } from "./modules/votacion/jurado.routes.js";
import { crearRutasEscribano } from "./modules/escribano/escribano.routes.js";
import { crearRutasResultados } from "./modules/resultados/resultados.routes.js";
import { manejarErrores } from "./http/manejo-errores.js";

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

    // Lectura del Jurado: contextos y planilla esperada, sin puntajes.
    app.use(
      "/api/jurado",
      crearRutasJurado({
        pool,
        obtenerSesion,
      }),
    );

    app.use("/api/escribano", crearRutasEscribano({ pool, obtenerSesion }));
    app.use("/api/resultados", crearRutasResultados({ pool, obtenerSesion }));

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

    // Padrón de la edición: comparsas, participantes, sujetos y orden de presentación.
    app.use(
      "/api/admin/ediciones",
      crearRutasAdminPadron({
        pool,
        obtenerSesion,
      }),
    );

    // Contenido del reglamento en borrador: rubros, escala, requisitos y premios.
    app.use(
      "/api/admin/ediciones",
      crearRutasAdminReglamento({
        pool,
        obtenerSesion,
      }),
    );

    // Filas de planilla: generación, nominaciones manuales, exclusiones y filas grises.
    app.use(
      "/api/admin/ediciones",
      crearRutasAdminPlanilla({
        pool,
        obtenerSesion,
      }),
    );

    // Apertura de la edición y noches.
    app.use(
      "/api/admin/ediciones",
      crearRutasAdminApertura({
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

  // Último middleware: cualquier error no manejado responde JSON controlado,
  // sin stack traces ni detalles de infraestructura.
  app.use(manejarErrores);

  return app;
}
