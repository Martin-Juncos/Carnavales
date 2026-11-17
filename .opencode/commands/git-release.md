---
description: Revisa los cambios integrados y abre un PR de developer a main
---

Carga la skill `git-workflow` y ejecuta «Preparar una publicación».

Actualiza las referencias de `origin` y revisa qué cambios de
`origin/developer` entrarían en `origin/main`. Ejecuta las pruebas sobre
la revisión exacta de `origin/developer`, usando un worktree temporal
si hace falta para conservar el directorio de trabajo actual.

Si hay cambios pendientes de integrar y pasan las pruebas, crea o
reutiliza el PR con base `main` y origen `developer`. Devuelve el enlace,
el resumen de cambios y el resultado de las pruebas. Deja el PR abierto
para revisión.