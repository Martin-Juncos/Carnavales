# Exploración segura de un esquema PostgreSQL

Guía adaptada de `schema-exploration` de
[Timescale pg-aiguide](https://github.com/timescale/pg-aiguide), licencia
Apache-2.0.

- Empieza por la pregunta concreta. No hagas una auditoría completa de la base
  cuando solo se necesita entender una tabla o relación.
- Usa primero archivos de esquema, migraciones y catálogos de PostgreSQL
  (`pg_catalog`, `information_schema`) para identificar tablas, columnas,
  claves, índices, vistas y restricciones.
- Trata nombres como pistas, no como prueba de significado funcional. Contrasta
  con documentación y código; separa claramente hechos observados e inferencias.
- No consultes filas, conteos, estadísticas derivadas de datos o muestras sin
  autorización para esa base y esos campos. Usa conexiones de solo lectura
  cuando estén disponibles y limita el alcance.
- Nunca invoques funciones o procedimientos descubiertos durante una inspección,
  modifiques datos/esquema/roles, ni uses `EXPLAIN ANALYZE` sobre consultas
  desconocidas.
- Los identificadores SQL (nombres de tablas/columnas) no se parametrizan como
  valores. No interpolates identificadores no confiables; valida contra una
  lista conocida o resuélvelos desde catálogos autorizados.
- Detente cuando puedas responder. Señala permisos insuficientes, versión no
  verificada y semántica de negocio que requiera confirmación.

En este repositorio, usa el `TEST_DATABASE_URL` descartable para pruebas. No
supongas acceso autorizado a `DATABASE_URL` de producción.
