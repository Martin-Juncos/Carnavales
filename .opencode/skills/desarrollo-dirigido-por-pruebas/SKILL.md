---
name: desarrollo-dirigido-por-pruebas
description: Aplicar TDD al agregar funciones, corregir errores o cambiar comportamientos; adaptar el ciclo a las pruebas nativas de Node.js del proyecto.
---

# Desarrollo dirigido por pruebas

Escribe primero una prueba que describa el comportamiento esperado, comprueba que
falla por la razón correcta, implementa el cambio mínimo y vuelve a ejecutar las
pruebas. Refactoriza solo con la suite en verde.

## Cuándo aplicarla

- Al agregar o corregir comportamiento de la API o el cliente.
- Al refactorizar lógica con efectos funcionales observables.
- Al cambiar permisos, autenticación, persistencia o migraciones.

Para cambios puramente documentales o de formato no hace falta inventar pruebas.
Si un cambio de infraestructura no se presta a una prueba unitaria, identifica
antes la verificación reproducible más adecuada.

## Ciclo rojo-verde-refactor

1. **Rojo:** agrega una prueba pequeña que describa una conducta pública.
   Prefiere `node:test`, ya utilizado en `api/test/` y `client/test/`.
2. Ejecuta la prueba enfocada con el comando del módulo (`npm test --
   test/archivo.test.js`) y confirma que falla por la ausencia del comportamiento,
   no por un error de sintaxis, configuración o datos.
3. **Verde:** realiza el cambio mínimo para satisfacer el caso. No debilites la
   expectativa para hacer pasar la prueba.
4. Ejecuta de nuevo la prueba enfocada y luego la suite completa pertinente.
5. **Refactoriza:** elimina duplicación o mejora nombres sin cambiar el
   comportamiento; vuelve a verificar.

Si se escribió implementación antes de la prueba, no borres ni sobrescribas
cambios ajenos o existentes. Escribe la prueba de regresión y comprueba que
detecta el comportamiento defectuoso antes de dar por validada la corrección.

## Calidad de las pruebas

- Prueba comportamientos y resultados observables, no detalles accidentales.
- Usa nombres que expliquen el caso y una expectativa principal por prueba.
- Usa dependencias reales cuando sea razonable; simula solo límites externos
  difíciles de controlar, como correo o servicios de terceros.
- Cubre errores, permisos y entradas límite cuando sean parte del contrato.
- En API con PostgreSQL, usa únicamente la base descartable configurada para
  pruebas (`TEST_DATABASE_URL`); nunca apuntes las pruebas a producción.

## Reglas críticas de este proyecto

- Para votos, cierres u otras operaciones críticas, cubre autorización,
  idempotencia, inmutabilidad y concurrencia según corresponda.
- No inventes reglas de negocio para cubrir un caso no especificado. Señala el
  bloqueo documental y pregunta antes de fijar el resultado esperado.
- Una prueba verde no reemplaza las verificaciones de autorización e integridad
  que correspondan en API y base de datos.

## Origen

Adaptación al proyecto de `test-driven-development` de
[obra/superpowers](https://github.com/obra/superpowers), licencia MIT. La guía
original registra más de 283 mil instalaciones en skills.sh y el repositorio
más de 318 mil estrellas (consulta: noviembre de 2026).
