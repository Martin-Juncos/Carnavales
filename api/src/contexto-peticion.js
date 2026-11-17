import { AsyncLocalStorage } from "node:async_hooks";

// Datos de cada petición de autenticación que Better Auth no recibe directamente:
// la IP del cliente y si la entrega de un código OTP falló.
// AsyncLocalStorage mantiene estos datos asociados a la petición actual, aunque haya
// muchas peticiones en paralelo.
export const contextoPeticion = new AsyncLocalStorage();

// Middleware de Express: abre el contexto de la petición con su IP y sin fallo de entrega,
// y luego sigue con la siguiente función de la cadena (next).
export function iniciarContextoPeticion(request, _response, next) {
  contextoPeticion.run({ ip: request.ip ?? "desconocida", entregaFallida: false }, next);
}
