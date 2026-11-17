import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { bootstrapFirstAdmin, existePrimerAdministrador } from "./bootstrap.js";
import { loadAuthConfig, loadConfig } from "./config.js";
import { createPool } from "./database.js";

// Pide una contraseña sin mostrar lo que se escribe, leyendo tecla por tecla.
// Requiere una terminal interactiva (TTY); si no la hay, falla de inmediato.
function leerOculto(pregunta) {
  if (!process.stdin.isTTY) {
    throw new Error("Ejecutá este comando en una terminal interactiva.");
  }

  return new Promise((resolve, reject) => {
    process.stdout.write(pregunta);
    const { stdin } = process;
    let valor = "";

    // Procesa cada bloque de teclas que llega desde la terminal.
    const onData = (chunk) => {
      for (const caracter of chunk.toString("utf8")) {
        // Enter: termina la lectura y devuelve lo escrito.
        if (caracter === "\r" || caracter === "\n") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          stdin.pause();
          process.stdout.write("\n");
          resolve(valor);
          return;
        }
        // Ctrl+C: cancela la lectura.
        if (caracter === "\u0003") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          process.stdout.write("\n");
          reject(new Error("Cancelado."));
          return;
        }
        // Retroceso: borra el último carácter.
        if (caracter === "\u007f" || caracter === "\b") {
          valor = valor.slice(0, -1);
          continue;
        }
        valor += caracter;
      }
    };

    // Modo raw: la terminal entrega cada tecla sin esperar Enter y sin eco.
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

// Comando `npm run bootstrap-admin`: crea el primer administrador de forma interactiva.
async function main() {
  let pool;
  let lector;
  try {
    // Sin terminal interactiva no se pueden pedir los datos de forma segura.
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

    // Nombre y correo se leen normalmente; la contraseña, con leerOculto.
    lector = createInterface({ input: process.stdin, output: process.stdout });
    const nombre = (await lector.question("Nombre: ")).trim();
    const correo = (await lector.question("Correo: ")).trim();
    lector.close();
    lector = undefined;
    const contrasena = await leerOculto("Contraseña: ");

    // Crea la cuenta con su rol inicial de administrador.
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
    // Cierra la lectura si quedó abierta y muestra el motivo sin datos sensibles.
    lector?.close();
    console.error(`No se pudo crear el primer administrador: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool?.end();
  }
}

// Ejecuta main() solo cuando se corre este archivo directamente.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
