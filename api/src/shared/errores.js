// Base de los errores de dominio. manejo-errores.js traduce cualquier instancia de esta clase
// a una respuesta HTTP según su código; las clases concretas viven en cada módulo.
export class ErrorDominio extends Error {
  constructor(codigo, mensaje = codigo, status = undefined) {
    super(mensaje);
    this.codigo = codigo;
    if (status !== undefined) this.status = status;
  }
}
