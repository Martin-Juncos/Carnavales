export function textoParticipante(rubroNombre, comparsaNombre, sujetoNombre) {
  if (!sujetoNombre) return null;
  const limpio = sujetoNombre.trim();
  if (!limpio) return null;
  const normal = limpio.toLowerCase();
  if (normal === comparsaNombre.trim().toLowerCase() || normal === rubroNombre.trim().toLowerCase()) return null;
  return limpio;
}

export function formatearFechaAcuse(iso) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}
