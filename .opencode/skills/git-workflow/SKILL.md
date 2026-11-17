---
name: git-workflow
description: Gestiona ramas de tareas desde developer, abre PRs hacia developer y prepara PRs de publicación hacia main.
---

# Flujo de ramas del proyecto

Usa `developer` para integrar tareas y `main` para las versiones estables.
Ejecuta la operación solicitada y reutiliza las instrucciones del repositorio
para elegir las pruebas y el formato de los PRs.

## Iniciar una tarea

1. Revisa `git status --short --branch` y actualiza las referencias con
   `git fetch origin`.
2. Crea una rama `feat/<tarea>` o `fix/<tarea>` desde `origin/developer`.
   Si hay cambios locales que podrían terminar en la rama equivocada,
   informa qué archivos están pendientes antes de cambiar de rama.
3. Si la rama ya existe, informa dónde existe y conserva su historial.

## Abrir el PR de una tarea

1. Revisa la rama actual y las diferencias contra `origin/developer`.
2. Ejecuta las pruebas que correspondan al cambio. Si fallan, informa el
   resultado y deja pendiente la apertura del PR.
3. Si el usuario pidió publicar la tarea y hay cambios sin commit, incluye
   únicamente los archivos de esa tarea en el commit.
4. Publica la rama y usa `gh` para abrir un PR con base `developer`. Si ya
   existe un PR para esa rama y esa base, devuelve su enlace.
5. Incluye en el PR qué cambió, cómo se probó y qué quedó sin verificar.

## Preparar una publicación

1. Ejecuta `git fetch origin` y revisa los commits y el diff de
   `origin/main...origin/developer`.
2. Si hay cambios pendientes, resume qué tareas entran y comprueba
   las pruebas de la versión integrada. Si hay pruebas fallidas o
   pendientes, informa cuáles y deja pendiente la apertura del PR.
3. Si el usuario pidió abrirlo, crea o reutiliza el PR con base `main`
   y rama de origen `developer`. Incluye pruebas, migraciones y pasos
   de despliegue cuando correspondan.
4. Deja el PR listo para revisión. Haz el merge solo si el usuario lo
   pide expresamente y GitHub permite integrarlo.