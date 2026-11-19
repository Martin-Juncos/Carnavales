# Migraciones PostgreSQL seguras

Principios resumidos y adaptados de `postgres-database-migration` de
[Timescale pg-aiguide](https://github.com/timescale/pg-aiguide), licencia
Apache-2.0.

## Flujo del repositorio

1. Revisa el estado y el orden de `api/migrations/`; usa el nombre
   `NNNN-descripcion.sql` y no edites una migración ya aplicada.
2. Añade una migración nueva y las pruebas pertinentes. `api/src/migrate.js`
   serializa el proceso con un advisory lock y envuelve cada archivo en una
   transacción independiente.
3. Ejecuta `npm test` desde `api/` con `TEST_DATABASE_URL` apuntando únicamente a
   una base PostgreSQL descartable.
4. Verifica el esquema y las restricciones después de aplicar la migración en
   una base de prueba. Nunca uses producción como entorno experimental.
5. Documenta el impacto operativo y un plan de recuperación antes de un cambio
   destructivo o difícil de revertir.

## Evaluar el riesgo

Antes de escribir DDL, confirma la versión de PostgreSQL, el tamaño/uso de la
tabla, las transacciones largas y las dependencias de aplicación. Los locks y
costos de reescritura dependen de la operación y la versión; no asumas que un
cambio rápido en una base vacía será inocuo con datos reales.

- `ALTER TABLE` puede necesitar un lock fuerte incluso si solo cambia
  metadatos; puede esperar por transacciones abiertas.
- Cambiar tipos, añadir restricciones validadas o introducir defaults volátiles
  puede escanear o reescribir datos.
- Crear un índice normal puede bloquear escrituras durante su construcción.
- Añadir una columna nullable y sin default suele ser un cambio de menor riesgo,
  pero debe evaluarse contra la versión y el contexto de despliegue.

Para DDL sensible, evalúa `lock_timeout` y `statement_timeout` apropiados y
verifica con datos representativos. No ejecutes `EXPLAIN ANALYZE` ni pruebas
costosas contra una base desconocida o productiva sin autorización.

## Compatibilidad y backfills

- Para renombres o cambios incompatibles, considera una migración por etapas:
  agregar campo nuevo, desplegar código compatible, copiar/validar datos y
  retirar el anterior en un paso posterior.
- Para tablas grandes, evita un `UPDATE` monolítico: planifica lotes reanudables,
  impacto de WAL, locks y consistencia entre escrituras concurrentes.
- Antes de agregar `NOT NULL`, unicidad o FK a datos existentes, comprueba
  nulos, duplicados y filas huérfanas. Considera validar gradualmente si el
  volumen y la versión lo justifican.
- Una reversión no siempre recupera datos eliminados o transformados con pérdida.
  Distingue entre rollback transaccional y restauración real de datos.

## Particularidad del runner actual

`CREATE INDEX CONCURRENTLY` y `DROP INDEX CONCURRENTLY` no pueden ejecutarse
dentro de una transacción. El runner actual envuelve cada migración en
`BEGIN`/`COMMIT`; por lo tanto, no incluyas esas sentencias en un `.sql` aplicado
por `npm run migrate`. Si se vuelven necesarias, el cambio de runner y su
tratamiento de fallos parciales deben diseñarse y probarse explícitamente.

No evadas esta limitación mediante SQL ad hoc en el código, ejecución manual
silenciosa o migraciones parcialmente registradas.

## Verificación y autorización

- Prueba migrar desde un esquema anterior realista y desde una instalación
  limpia, cuando las pruebas del proyecto permitan ambos caminos.
- Comprueba integridad de datos y esquema después de migrar, no solo el código de
  salida del comando.
- No apliques migraciones a una base productiva sin autorización explícita y un
  plan de despliegue/recuperación aprobado.
- Para la futura base del evento, el diseño conceptual documentado sigue sin
  aprobación: una skill técnica no autoriza convertirlo en esquema físico ni
  decidir reglas de negocio pendientes.
