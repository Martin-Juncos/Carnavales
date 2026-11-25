# 06: Filas de planilla y publicación de versión

**What to build:** Generación de `objetivo_rubro` y publicación de la versión del reglamento con validación de errores bloqueantes.

**Blocked by:** Ninguna decisión pendiente en esta parte. Decisiones tomadas por el responsable del proyecto (19/11/2026):
- R7: nominados configurables desde la aplicación.
- R8/H11: las nominaciones se cargan en el padrón antes de abrir la primera noche.
- R11: cada fila es sujeto × rubro × especialidad.
- Un nominado es un sujeto distinto; los topes se aplican a las nominaciones manuales.

D24 está resuelta: sumar requisitos fijos que puntúan, mejor nominativo por comparsa y los dos carros de mayor puntaje. El catálogo/tablas de reglas de cálculo siguen pendientes por H4; el checklist de esta issue no valida parámetros de algoritmos.

**Status:** planilla, checklist y publicación implementados; regla de cálculo persistida queda en otra issue.

- [x] Generación de filas para rubros nominativos sin tocar filas manuales, grises o excluidas (`api/test/modules/reglamento/planilla.test.js`).
- [x] Nominación de aleatorios con topes por edición y por comparsa, contando sujetos distintos.
- [x] Checklist de errores bloqueantes y advertencias.
- [x] Publicación transaccional: versión nueva `PUBLICADA` y anterior `SUPERSEDIDA`.
- [x] Vista previa sin campos de puntaje.
- [x] Pruebas de publicación y auditoría (`api/test/modules/reglamento/publicacion.test.js`).
