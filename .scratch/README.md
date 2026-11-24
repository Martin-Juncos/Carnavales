# Seguimiento de tareas

Este índice separa el trabajo pendiente de los tickets originales. Para operar
el sistema o consultar su API, usa el [índice de documentación](../docs/README.md).

| Funcionalidad | Estado actual |
| --- | --- |
| [Crear edición](crear-edicion/spec.md) | Creación de una edición vacía implementada. El [ticket original](crear-edicion/issues/01-crear-consultar-edicion.md) conserva su pendiente de verificación de extremo a extremo. |
| [Configurar edición](configurar-edicion/spec.md) | Configuración, publicación y apertura implementadas dentro del [contrato vigente](../docs/voting/configuracion-api.md). |
| [Asignar jurados](asignaciones-jurado/spec.md) | Asignaciones y suplencias implementadas, incluido el traspaso de borradores. Consultar la [API vigente](../docs/voting/asignaciones-api.md). |
| [Votación sin conexión](votacion-offline/spec.md) | Confirmación local y recepción oficial idempotente implementadas. No hay excepción aprobada para dispositivos que no pueden sincronizar. |
| [Cierre y resultados](cierre-resultados/spec.md) | Cierre de noche implementado en P5. Cierre total, resultados, penalizaciones digitales y actas oficiales pendientes. |

Los detalles de los tickets conservan el alcance y la evidencia de su etapa.
Para decidir qué implementar después, consulta las [decisiones funcionales pendientes](../docs/voting/decision-questions.md).
