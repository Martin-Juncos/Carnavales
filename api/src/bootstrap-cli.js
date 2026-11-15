import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { bootstrapFirstAdmin, existePrimerAdministrador } from "./bootstrap.js";
import { loadAuthConfig, loadConfig } from "./config.js";
import { createPool } from "./database.js";

// Lee una línea sin mostrar lo que se escribe. Requiere una terminal interactiva.
function leerOculto(pregunta) {
  if (!process.stdin.isTTY) {
    throw new Error("Ejecutá este comando en una terminal interactiva.");
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(pregunta);
    const { stdin } = process;
    let valor = "";

    const onData = (chunk) => {
      for (const caracter of chunk.toString("utf8")) {
        if (caracter === "\r" || caracter === "\n") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          stdin.pause();
          process.stdout.write("\n");
          resolve(valor);
          return;
        }
        if (caracter === "\u0003") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          process.stdout.write("\n");
          reject(new Error("Cancelado."));
          return;
        }
        if (caracter === "\u007f" || caracter === "\b") {
          valor = valor.slice(0, -1);
          continue;
        }
        valor += caracter;
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  let pool;
  let lector;
  try {
    if (!process.stdin.isTTY) {
      throw new Error("Ejecutá este comando en una terminal interactiva.");
    }
    const config = loadConfig();
    const { secret, baseUrl } = loadAuthConfig(process.env, config);

    // Se revisa antes de pedir datos: si ya hay un administrador, no se le pide nada a la persona.
    pool = createPool(config.databaseUrl);
    if (await existePrimerAdministrador(pool)) {
      throw new Error("Ya existe un primer administrador.");
    }

    lector = createInterface({ input: process.stdin, output: process.stdout });
    const nombre = (await lector.question("Nombre: ")).trim();
    const correo = (await lector.question("Correo: ")).trim();
    lector.close();
    lector = undefined;
    const contrasena = await leerOculto("Contraseña: ");

    await bootstrapFirstAdmin({
      pool,
      secret,
      baseUrl,
      name: nombre,
      email: correo,
      password: contrasena,
    });
    console.log("Primer administrador creado. Su primer inicio de sesión pedirá el código por correo.");
  } catch (error) {
    lector?.close();
    console.error(`No se pudo crear el primer administrador: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
