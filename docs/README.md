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
- [Diseño de base de datos](voting/database-design.md)
- [Diseño físico del agregado de edición](voting/diseno-fisico-evento.md): borrador de tablas, restricciones y congelación del reglamento; no autoriza migraciones.
- [Flujo de creación de un evento](voting/flujo-creacion-evento.md): pasos del asistente, generación de planillas, publicación y apertura.
- [Plan por etapas para documentar la base de datos del evento](voting/event-database-plan.md)
- [Diseño físico de asignaciones de jurado (0007)](voting/asignaciones-jurado-diseno.md): alcance mínimo aprobado y aplicado en la migración 0007.
- [API de asignaciones](voting/asignaciones-api.md): consulta y alta administrativa de jurados y asignaciones.

Los documentos de diseño no sustituyen un reglamento aprobado. De esta sección,
solo están implementadas la migración 0007, la consulta y el alta de asignaciones; el
flujo general de votación, la PWA de jurados y las funciones de
actas/resultados siguen pendientes.

## Fuentes de verdad y límites

- `AGENTS.md` contiene invariantes generales del dominio y pautas de trabajo.
- Las decisiones de autenticación se describen en `authentication/`.
- Los documentos de `voting/` no reemplazan un reglamento general aprobado.
- Las reglas pendientes (por ejemplo, desempates, impugnaciones y votos fuera de
  término) no deben inventarse durante la implementación.
