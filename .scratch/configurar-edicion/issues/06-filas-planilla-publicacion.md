# 06: Filas de planilla y publicación de versión

**What to build:** Generación de `objetivo_rubro` y publicación de la versión del reglamento con validación de errores bloqueantes.

**Blocked by:** Ninguna decisión pendiente en esta parte. Decisiones tomadas por el responsable del proyecto (19/11/2026):
- R7: nominados configurables desde la aplicación.
- R8/H11: las nominaciones se cargan en el padrón antes de abrir la primera noche.
- R11: cada fila es sujeto × rubro × especialidad.
- Un nominado es un sujeto distinto; los topes se aplican a las nominaciones manuales.

Queda pendiente para la publicación: la regla de cálculo (D24/H4), que el checklist no puede validar hasta cerrarla.

**Status:** planilla implementada (`0012` y API); publicación pendiente.

- [x] Generación de filas para rubros nominativos sin tocar filas manuales, grises o excluidas (`api/test/planilla.test.js`).
- [x] Nominación de aleatorios con topes por edición y por comparsa, contando sujetos distintos.
- [ ] Checklist de errores bloqueantes y advertencias.
- [ ] Publicación transaccional: versión nueva `PUBLICADA` y anterior `SUPERSEDIDA`.
- [ ] Vista previa sin campos de puntaje.
- [ ] Pruebas de la publicación.
