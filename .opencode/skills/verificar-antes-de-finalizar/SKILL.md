---
name: verificar-antes-de-finalizar
description: Usar antes de afirmar que un cambio está terminado, corregido o verificado; exige ejecutar comandos actuales y reportar evidencia.
---

# Verificar antes de finalizar

No afirmes que algo funciona, compila o está completo sin evidencia obtenida en
esta tarea. La confianza, una ejecución anterior o una revisión visual no
reemplazan la verificación.

## Puerta de verificación

Antes de comunicar un resultado:

1. Define qué comando demuestra cada afirmación.
2. Ejecuta el comando completo y pertinente en el estado actual de los archivos.
3. Revisa salida y código de salida; identifica fallos y advertencias relevantes.
4. Limita la afirmación a lo que esa evidencia confirma.
5. Informa explícitamente lo que no se pudo ejecutar o quedó pendiente.

## Comandos habituales de este repositorio

- API: `npm test` desde `api/`.
- Cliente: `npm test` y, si aplica, `npm run build` desde `client/`.
- Migraciones: ejecuta las pruebas existentes que verifican el historial; no
  apliques migraciones a una base productiva como mecanismo de prueba.

Si cambió ambos módulos, verifica ambos. Para una prueba enfocada, ejecuta
también la suite completa del módulo antes de afirmar que no hay regresiones.

## Evidencia requerida según la afirmación

| Afirmación | Evidencia mínima |
| --- | --- |
| «Las pruebas pasan» | Comando de pruebas completo y cero fallos. |
| «El cliente compila» | `npm run build` con salida exitosa. |
| «El error está corregido» | Prueba que reproduce el error y pasa tras el cambio. |
| «Se cumplen los requisitos» | Revisión de cada requisito; las pruebas por sí solas no prueban todos los requisitos. |

No ocultes fallos preexistentes que aparezcan en una verificación. Distingue lo
que se verificó, lo que falló y lo que no pudo comprobarse. No digas «debería
funcionar» como sustituto de ejecutar la verificación disponible.

## Origen

Adaptación al proyecto de `verification-before-completion` de
[obra/superpowers](https://github.com/obra/superpowers), licencia MIT. La guía
original registra más de 280 mil instalaciones en skills.sh y el repositorio
más de 318 mil estrellas (consulta: noviembre de 2026).
