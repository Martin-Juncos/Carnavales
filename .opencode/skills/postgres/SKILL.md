---
name: postgres
description: Usar al diseñar, revisar o modificar esquemas PostgreSQL, consultas estructurales e índices, y al planificar migraciones versionadas.
---

# Desarrollo de bases de datos PostgreSQL

Guía para el PostgreSQL directo del proyecto (`pg` y SQL versionado; no usa
ORM). Antes de cambiar el modelo, consulta `AGENTS.md`, `docs/README.md`, los
documentos aplicables de `docs/voting/` y el historial existente en
`api/migrations/`.

## Elegir la referencia adecuada

- [Diseño de esquemas](references/diseno-esquemas.md): relaciones, tipos,
  restricciones, integridad e índices.
- [Migraciones seguras](references/migraciones-seguras.md): cambios compatibles,
  locks, transacciones, pruebas y despliegue.
- [Exploración de esquema](references/exploracion-esquema.md): inspección
  estructural de PostgreSQL con consultas de solo lectura.

## Límites para este proyecto

- PostgreSQL es la autoridad final de integridad persistida; aplica restricciones
  en la base además de validación en la API.
- Sigue las convenciones establecidas en el esquema existente; no cambies
  nombres, tipos o estrategia de IDs por preferencia personal.
- Los nombres nuevos de tablas, columnas, índices, restricciones, secuencias y
  demás objetos propios de la base deben estar en español, usando `snake_case`
  y términos del dominio ya documentados. Mantén nombres técnicos de terceros
  solo cuando sean necesarios por compatibilidad (por ejemplo, tablas
  administradas por una biblioteca).
- Los cambios estructurales van mediante migraciones versionadas. No apliques SQL
  ad hoc desde el código de aplicación ni a una base productiva.
- Las pruebas de integración usan exclusivamente una base descartable mediante
  `TEST_DATABASE_URL`.
- `api/src/migrate.js` serializa migraciones con advisory lock y ejecuta cada
  archivo SQL en su propia transacción. Por eso, `CREATE INDEX CONCURRENTLY` no
  puede agregarse sin más a una migración actual: PostgreSQL no permite esa
  sentencia dentro de una transacción. Detente y plantea un cambio explícito al
  mecanismo de migración antes de requerirla.
- El diseño conceptual `docs/voting/event-database-design.md` está pendiente de
  revisión/aprobación. No lo conviertas en DDL ni resuelvas mediante el esquema
  reglas funcionales que allí siguen pendientes.
- Preserva historia y auditoría. No propongas cascadas o borrados que puedan
  eliminar votos confirmados, cierres, penalizaciones, actas u otra evidencia.

## Origen

Adaptación y traducción de la skill `postgres` de
[Timescale pg-aiguide](https://github.com/timescale/pg-aiguide), licencia
Apache-2.0, instalada desde el commit `1aef6e452b97fae580d57677a807fd0d601ddc7b`.
Se conservaron los principios generales aplicables a PostgreSQL y se omitieron
referencias específicas de TimescaleDB, PostGIS y búsqueda vectorial, que el
proyecto no utiliza.
