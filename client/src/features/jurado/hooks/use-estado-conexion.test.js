import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useEstadoConexion } from "./use-estado-conexion.js";

test("refleja la conectividad inicial, escucha cambios y libera los listeners", () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const quitar = vi.spyOn(window, "removeEventListener");
  try {
    const { result, unmount } = renderHook(() => useEstadoConexion());
    expect(result.current).toBe(false);
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current).toBe(true);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current).toBe(false);
    unmount();
    expect(quitar).toHaveBeenCalledWith("online", expect.any(Function));
    expect(quitar).toHaveBeenCalledWith("offline", expect.any(Function));
  } finally { online.mockRestore(); quitar.mockRestore(); }
});
