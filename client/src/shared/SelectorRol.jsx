import { useState } from "react";
import { etiquetaDeRol } from "./roles.js";

// Pantalla para elegir con qué rol entrar cuando la persona tiene más de uno.
// La elección solo cambia lo que se muestra; la API sigue autorizando con los roles reales.
export function SelectorRol({ roles, onElegir }) {
  const [seleccion, setSeleccion] = useState(roles[0]);

  function confirmar(evento) {
    evento.preventDefault();
    onElegir(seleccion);
  }

  return (
    <form onSubmit={confirmar}>
      <h2>Elegí con qué rol entrar</h2>
      {roles.map((codigo) => (
        <label key={codigo}>
          <input
            type="radio"
            name="rol"
            value={codigo}
            checked={seleccion === codigo}
            onChange={() => setSeleccion(codigo)}
          />{" "}
          {etiquetaDeRol(codigo)}
        </label>
      ))}
      <button type="submit">Entrar con este rol</button>
    </form>
  );
}
