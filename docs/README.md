# Documentación

Este índice separa el comportamiento implementado de los diseños y las decisiones
pendientes. La documentación no convierte una inferencia en una regla aprobada.

## Uso del sistema

- [Guía de uso](user-guide.md): preparación inicial, acceso, OTP, invitaciones,
  administración y recuperación de contraseña.

## Autenticación y cuentas

- [Estado, decisiones y alcance](authentication/README.md)
- [Flujos y administración](authentication/flows.md)
- [Esquema y migraciones](authentication/database.md)
- [Referencia de API](authentication/api-reference.md)
- [Guía de implementación y verificaciones](authentication/implementation-guide.md)

La API y el cliente de autenticación están implementados; el despliegue productivo
continúa pendiente.

## Votación

- [Preguntas de decisiones funcionales pendientes](voting/decision-questions.md)
- [Diseño de base de datos](voting/database-design.md): borrador conceptual **superado**; se conserva como registro histórico, no guía de implementación.
- [Diseño físico del agregado de edición](voting/diseno-fisico-evento.md): borrador v3; solo el alcance de edición y versiones (migración `0006`) está aplicado. El resto no autoriza migraciones.
- [Flujo de creación de un evento](voting/flujo-creacion-evento.md): propuesta de pasos del asistente, generación de planillas, publicación y apertura; no autoriza implementación.
- [Plan por etapas para documentar la base de datos del evento](voting/event-database-plan.md)
- [Diseño físico de asignaciones de jurado (0007)](voting/asignaciones-jurado-diseno.md): alcance mínimo aprobado y aplicado en la migración 0007.
- [API de asignaciones](voting/asignaciones-api.md): consulta, alta, revocación y reemplazo administrativos de jurados y asignaciones.
- [Diseño de planilla, voto y cierres](voting/planilla-voto-diseno-propuesto.md): decisiones principales aprobadas el 19/11/2026 (D9, actores de D10, P1 y resolución de conflictos); el cierre y la recepción de votos siguen pendientes de implementación.

Los documentos de diseño no sustituyen un reglamento aprobado. De esta sección
están implementadas la migración `0006` (edición y versiones de reglamento), la
migración `0007` (noches, especialidades, asignaciones y auditoría), la API de
ediciones (crear vacía y listar) con su panel, y la API de asignaciones (consulta,
alta, revocación y reemplazo) con su panel administrativo y confirmación. El
flujo general de configuración, la votación, la PWA de jurados y las funciones
de cierre, actas y resultados siguen pendientes.

## Fuentes de verdad y límites

- `AGENTS.md` contiene invariantes generales del dominio y pautas de trabajo.
- Las decisiones de autenticación se describen en `authentication/`.
- Los documentos de `voting/` no reemplazan un reglamento general aprobado.
- Las reglas pendientes (por ejemplo, desempates, impugnaciones y votos fuera de
  término) no deben inventarse durante la implementación. El conflicto de
  ítems/subítems D25 ya fue resuelto el 19/11/2026 a favor de `AGENTS.md` §2.
