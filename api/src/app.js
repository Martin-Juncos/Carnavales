import express from "express";

export function createApp({ pool }) {
  const app = express();

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
