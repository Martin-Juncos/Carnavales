import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("loadConfig accepts a PostgreSQL URL and defaults to a local listener", () => {
  assert.deepEqual(
    loadConfig({ DATABASE_URL: "postgresql://user:secret@localhost:5432/app" }),
    {
      databaseUrl: "postgresql://user:secret@localhost:5432/app",
      port: 3000,
      host: "127.0.0.1",
    },
  );
});

test("loadConfig rejects non-PostgreSQL URLs without echoing their value", () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: "https://private.example/secret" }),
    {
      message: "DATABASE_URL must be a valid PostgreSQL connection URL.",
    },
  );
});

test("loadConfig rejects ports outside the valid TCP range", () => {
  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "postgres://localhost/app",
        PORT: "65536",
      }),
    { message: "PORT must be an integer between 1 and 65535." },
  );
});
