import { AsyncLocalStorage } from "node:async_hooks";

// Datos de cada petición de autenticación que Better Auth no recibe directamente:
// la IP del cliente y si la entrega de un código OTP falló.
export const contextoPeticion = new AsyncLocalStorage();

export function iniciarContextoPeticion(request, _response, next) {
  contextoPeticion.run({ ip: request.ip ?? "desconocida", entregaFallida: false }, next);
}
