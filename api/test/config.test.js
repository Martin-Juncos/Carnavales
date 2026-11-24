import assert from "node:assert/strict";
import test from "node:test";
import { loadAuthConfig, loadConfig } from "../src/infra/config.js";

test("loadConfig accepts a PostgreSQL URL and defaults to a local listener", () => {
  assert.deepEqual(
    loadConfig({ DATABASE_URL: "postgresql://user:secret@localhost:5432/app" }),
    {
      databaseUrl: "postgresql://user:secret@localhost:5432/app",
      port: 3000,
      host: "127.0.0.1",
      trustProxy: false,
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

const validSecret = "a".repeat(32);

test("loadAuthConfig requires BETTER_AUTH_SECRET", () => {
  assert.throws(() => loadAuthConfig({}), {
    message: "BETTER_AUTH_SECRET is required.",
  });
});

test("loadAuthConfig rejects secrets shorter than 32 characters", () => {
  assert.throws(() => loadAuthConfig({ BETTER_AUTH_SECRET: "a".repeat(31) }), {
    message: "BETTER_AUTH_SECRET must be at least 32 characters.",
  });
});

test("loadAuthConfig rejects the development placeholder secret", () => {
  assert.throws(
    () =>
      loadAuthConfig({
        BETTER_AUTH_SECRET: "spike-only-secret-change-me-0123456789",
      }),
    {
      message: "BETTER_AUTH_SECRET must not use a development placeholder.",
    },
  );
});

test("loadAuthConfig defaults the public URL to the local listener", () => {
  assert.deepEqual(loadAuthConfig({ BETTER_AUTH_SECRET: validSecret }), {
    secret: validSecret,
    baseUrl: "http://127.0.0.1:3000",
    appUrl: "http://127.0.0.1:5173",
  });
});

test("loadAuthConfig rejects an invalid APP_URL", () => {
  assert.throws(
    () =>
      loadAuthConfig({
        BETTER_AUTH_SECRET: validSecret,
        APP_URL: "no es una url",
      }),
    { message: "APP_URL must be a valid URL." },
  );
});

test("loadAuthConfig rejects an invalid BETTER_AUTH_URL", () => {
  assert.throws(
    () =>
      loadAuthConfig({
        BETTER_AUTH_SECRET: validSecret,
        BETTER_AUTH_URL: "no es una url",
      }),
    { message: "BETTER_AUTH_URL must be a valid URL." },
  );
});
