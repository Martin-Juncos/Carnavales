// Espera mínima entre dos envíos de código, en segundos. Debe coincidir con el límite del servidor.
export const esperaOtpSegundos = 30;

// Segundos que faltan para poder pedir otro código.
// ultimoEnvioMs: momento del último envío en milisegundos, o null si no hubo envío.
// ahoraMs: momento actual en milisegundos. Nunca devuelve un número negativo.
export function segundosRestantes(ultimoEnvioMs, ahoraMs, esperaSegundos = esperaOtpSegundos) {
  if (ultimoEnvioMs === null) return 0;
  const transcurridos = Math.floor((ahoraMs - ultimoEnvioMs) / 1000);
  return Math.max(0, esperaSegundos - transcurridos);
}
