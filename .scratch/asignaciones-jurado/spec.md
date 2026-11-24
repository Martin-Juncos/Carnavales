# Especificación: asignar Jurados a noches y especialidades

**Estado actual:** asignaciones y suplencias implementadas. Para los bloqueos
vigentes y el traspaso, consulta el [contrato de asignaciones](../../docs/voting/asignaciones-api.md).
El problema y las historias siguientes corresponden a la planificación inicial.

## Problema

El Administrador aún no puede asignar Jurados a las noches competitivas y especialidades que deben evaluar. Sin asignaciones activas, el sistema no puede determinar qué planillas espera, qué puede abrir cada Jurado ni cuándo se puede cerrar una noche.

## Solución

Permitir que el Administrador gestione asignaciones entre un Jurado, una noche competitiva y una especialidad. Los Jurados solo pueden trabajar en contextos con asignación activa. La asignación puede cambiarse mientras la noche siga en `DRAFT`, siempre que no altere una planilla ya confirmada.

## Historias de usuario

1. Como Administrador, quiero consultar los Jurados disponibles y las asignaciones de cada noche, para detectar coberturas faltantes antes de abrirla.
2. Como Administrador, quiero asignar un Jurado a una noche competitiva y una especialidad, para definir quién evalúa cada planilla.
3. Como Administrador, quiero que el sistema rechace asignaciones a una noche inexistente o a un Jurado inválido, para mantener la configuración consistente.
4. Como Administrador, quiero crear nuevas asignaciones mientras la noche competitiva permanezca en `DRAFT`, incluso si la edición ya está `OPEN`, para preparar jornadas futuras.
5. Como Administrador, no quiero poder crear asignaciones nuevas una vez abierta la noche, para impedir cambios tardíos a la cobertura de evaluación.
6. Como Administrador, quiero revocar o reemplazar asignaciones existentes mientras no tengan una planilla confirmada, para corregir la preparación sin afectar evidencia.
7. Como Administrador, quiero que un cambio que alteraría una planilla confirmada sea rechazado, para preservar su asignación y trazabilidad.
8. Como Jurado, quiero ver únicamente noches competitivas y especialidades con asignación activa, para saber qué trabajo me corresponde.
9. Como Jurado, quiero que la API valide mi asignación activa para cada operación de votación, para impedir que una interfaz manipulada envíe votos fuera de mi alcance.
10. Como Escribano, quiero que las asignaciones definan las planillas esperadas para cada noche, para verificar que ninguna falte al cerrar.
11. Como Administrador, quiero confirmar explícitamente una modificación sensible de asignación antes de enviarla, para evitar cambios accidentales.
12. Como auditor, quiero que la creación, revocación y reemplazo de asignaciones sensibles dejen evidencia del actor y la operación, para reconstruir quién cambió la cobertura.

## Decisiones de implementación

- Una asignación identifica un Jurado, una noche y una especialidad; el modelo debe permitir determinar las planillas esperadas a partir de esas relaciones.
- La identidad del actor y sus permisos provienen de la sesión autenticada. No confiar en un usuario o rol declarado por el cliente.
- La API valida que la asignación esté activa, que la noche exista y que la comparsa activa pertenezca a esa noche antes de aceptar votos o cierres.
- Las asignaciones nuevas para una noche competitiva solo se crean mientras esa noche permanezca en `DRAFT`, aunque la edición esté `OPEN`.
- Las asignaciones existentes pueden revocarse o reemplazarse mientras no tengan una planilla confirmada. Una planilla presentada conserva su evidencia y bloquea cualquier cambio que la altere.
- Las modificaciones administrativas sensibles requieren confirmación explícita en la interfaz.
- Las asignaciones y sus referencias históricas no deben borrar en cascada planillas, votos ni cierres.
- La asignación sirve para determinar elegibilidad y cobertura; no define reglas aún pendientes sobre suplencias, cambios excepcionales ni resolución de faltantes.

## Decisiones de pruebas

- Probar el recorrido observable desde la administración de asignaciones a través de la interfaz, API y PostgreSQL.
- Verificar creación de una asignación válida y persistencia del Jurado, noche y especialidad relacionados.
- Verificar que la identidad sin rol de Administrador no puede crear, modificar o revocar asignaciones.
- Verificar que una nueva asignación se permite en una noche `DRAFT` aunque la edición esté `OPEN`, y se rechaza después de abrir la noche.
- Verificar que se pueden revocar o reemplazar asignaciones sin planillas confirmadas y que el mismo cambio se rechaza cuando alteraría evidencia confirmada.
- Verificar que las operaciones de voto rechazan asignaciones inexistentes, revocadas o fuera de la noche/especialidad habilitadas.
- Verificar que el cierre usa el conjunto correcto de planillas esperadas.
- Verificar auditoría de los cambios administrativos sin incluir credenciales ni secretos.
- Como antecedentes existen pruebas de rutas administrativas, gestión de roles, invitaciones y persistencia de ediciones.

## Fuera de alcance

- Invitar o crear cuentas de Jurados; se usa el flujo de invitaciones y usuarios existente.
- Definir suplencias, reasignaciones excepcionales después de abrir una noche o cambios posteriores a una planilla confirmada.
- La captura de puntuaciones y el envío offline de planillas.
- Resolver quién autoriza una excepción reglamentaria o cómo se registra una ausencia.

## Notas adicionales

Las asignaciones son requisito para generar planillas esperadas y abrir una noche, pero no sustituyen el checklist de apertura. Una noche no se cierra mientras haya planillas esperadas que no hayan sido recibidas oficialmente por el servidor.
