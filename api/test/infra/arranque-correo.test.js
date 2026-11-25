import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { startServer } from "../../src/index.js";

// Necesita TEST_DATABASE_URL: el arranque abre la base para comprobar la conexión.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

// Puerto libre del sistema, para no chocar con una API que esté corriendo.
function puertoLibre() {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

const silencio = { log() {} };

async function arrancar(extra) {
  const port = await puertoLibre();
  const env = {
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: "un-secreto-de-prueba-de-al-menos-32-caracteres",
    PORT: String(port),
    HOST: "127.0.0.1",
    NODE_ENV: "development",
    ...extra,
  };
  const running = await startServer({ env, logger: silencio });
  await running.close();
}

test("arranca con el proveedor de consola", { skip }, async () => {
  await arrancar({ EMAIL_PROVIDER: "console" });
});

test("arranca con Gmail configurado (el transporte no se conecta hasta enviar)", { skip }, async () => {
  await arrancar({ EMAIL_PROVIDER: "gmail", GMAIL_USER: "cuenta@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" });
});
