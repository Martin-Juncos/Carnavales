import express from "express";
import { toNodeHandler } from "better-auth/node";

export function createApp({ pool, auth }) {
  const app = express();

  // Better Auth gestiona sus propias rutas. Se monta antes de cualquier middleware de cuerpo.
  if (auth) {
    app.all("/api/auth/*splat", toNodeHandler(auth));
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

  return app;
}
