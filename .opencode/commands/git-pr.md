---
description: Prueba la rama actual y abre un PR hacia developer
---

Carga la skill `git-workflow` y ejecuta «Abrir el PR de una tarea».

Usa la rama actual como origen y `developer` como base. Si la rama actual
es `main` o `developer`, detente e indica desde qué rama debe ejecutarse.

Si hay cambios sin commit, muestra los archivos pendientes y detente para
que el usuario pueda decidir cuáles incluir. Revisa los commits y ejecuta
las pruebas del proyecto. Si pasan, sube la rama y crea o reutiliza su PR
hacia `developer`. Devuelve el enlace y el resultado de las pruebas.