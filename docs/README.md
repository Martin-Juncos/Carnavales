# Documentación

La votación está implementada **hasta cálculo, empates y publicación de resultados (P6C)**:
configuración y apertura (unificadas sobre `DATABASE_URL`), planillas sin conexión
con logo opcional por comparsa, recepción oficial, suplencias, cierre de noche
(P5), cierre total irreversible (P6A), penalizaciones digitales (P6B) y cálculo
versionado, resolución manual de empates y publicación oficial (P6C). La
administración incluye asistente por 4 etapas, planillas por noche, consulta de
resultados post-cierre, retiro y eliminación completa de ediciones con
confirmación en modal. Quedan pendientes únicamente las actas oficiales PDF/CSV
con SHA-256 (P6D).

## Vigente: cómo usar y mantener el sistema

- [Guía de uso](user-guide.md): acceso y operación para Administración, Jurado y Escribano. Empieza aquí.
- [Autenticación y cuentas](authentication/README.md): estado, contratos y esquema.
- **API de votación:** [configuración y apertura](voting/configuracion-api.md),
  [asignaciones y suplencias](voting/asignaciones-api.md),
  [planilla y recepción del Jurado](voting/jurado-api.md),
  [cierre de noche](voting/cierre-noche-api.md),
  [cierre total de la votación](voting/cierre-total-api.md),
  [penalizaciones digitales](voting/penalizaciones-api.md) y
  [resultados y publicación](voting/resultados-api.md).
- [Reglas generales del repositorio](../AGENTS.md): integridad, seguridad y auditoría.

## Pendiente: decisiones antes de implementar

- [Registro de decisiones](voting/decision-questions.md): distingue reglas
  confirmadas de preguntas abiertas, como el reglamento definitivo 2027, las
  impugnaciones y los formatos de importación asistida.
- [Reglamento 2027](voting/feat-reglamento-2027-pendiente.md): trabajo diferido hasta contar con el reglamento actualizado.
- [Seguimiento de tareas](../.scratch/README.md): estado por funcionalidad
  y enlaces a los tickets originales. No es una referencia de la API.

## Histórico: consultar solo para entender el origen de una decisión

Estos documentos se conservan como antecedentes. No describen por sí solos el
comportamiento vigente ni autorizan nuevas reglas o migraciones.

- [Planilla, recepción y cierres](voting/planilla-voto-diseno-propuesto.md): diseño de P1–P5 y registro de decisiones.
- [Flujo de creación del evento](voting/flujo-creacion-evento.md): propuesta de asistente administrativo.
- [Modelo conceptual](voting/database-design.md), [plan de trabajo de base de datos](voting/event-database-plan.md)
  y [diseño físico del evento](voting/diseno-fisico-evento.md).
- [Diseño físico inicial de asignaciones](voting/asignaciones-jurado-diseno.md): alcance de la migración `0007`, anterior a las suplencias.
