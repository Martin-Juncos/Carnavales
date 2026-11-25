# API de configuración de una edición

**Estado:** implementado para noches, especialidades, padrón (sin pasadas), apertura
de edición, contenido de reglamento y publicación (sin catálogo de reglas de cálculo).
La apertura de noche está implementada. El cierre se realiza por separado
desde la [API del Escribano](cierre-noche-api.md).

## Retirar una edición

`POST /api/admin/ediciones/:edicionId/retiro` exige rol `ADMINISTRADOR` y el
cuerpo JSON `{ "confirmar": true }`. Retira definitivamente una edición en
`CONFIGURING` u `OPEN`, incluso con reglamento publicado. No borra datos ni
ofrece restauración. Devuelve `200` con `{ edicionId, retiradaEn }`; una
repetición devuelve el mismo resultado sin duplicar la auditoría.

Devuelve `400 confirmacion_retiro_requerida` sin confirmación, `404
edicion_inexistente` si no existe y `409 edicion_en_votacion` si tiene una
jornada competitiva en `OPEN`. La edición deja de aparecer en el listado
operativo. `GET /api/admin/ediciones/retiradas` permite consultar las ediciones
retiradas y su versión de reglamento; las escrituras sobre la edición quedan
bloqueadas. La consulta de cierre del Escribano sigue disponible para jornadas
cerradas y no revela puntajes. Un reenvío idéntico de una planilla ya recibida
puede recuperar su acuse sin escribir.

Para habilitar el retiro en un entorno, aplica la migración `0023` y verifica
que la cuenta de la API pueda actualizar la edición, bloquear la fila de
`usuario_rol` que acredita al administrador e insertar el registro en
`auditoria`. Si falla la auditoría, el retiro se revierte.

Antes de desplegar, verifica esos permisos con la cuenta de ejecución en una
base descartable y confirma por separado el entorno de destino. Prueba también
el cruce entre cierre y reintento de apertura con la versión que se desplegará.
Después del primer retiro, no reviertas únicamente la API a una versión que
desconozca `retirada_en`: volvería a listar ediciones retiradas como operativas.
Si falla el despliegue, suspende las escrituras afectadas y conserva la migración,
los marcadores de retiro y la auditoría mientras se prepara una corrección
compatible. No elimines esos registros ni reactives ediciones para recuperar
el servicio.

### Eliminación física completa de una edición

`DELETE /api/admin/ediciones/:edicionId` exige el rol `ADMINISTRADOR` y el
cuerpo JSON `{ "confirmar": true }`. Devuelve `204` sin cuerpo al eliminar
definitivamente la edición completa, incluidas noches abiertas que no estén en
votación, votos confirmados, cierres y reglamentos publicados.

Devuelve `400 confirmacion_eliminacion_requerida` sin la confirmación,
`404 edicion_inexistente` si no existe y `409 edicion_en_votacion` si una noche
competitiva está en `OPEN`. El borrado es atómico: un fallo conserva la
edición y todos sus datos. No se crea una auditoría de eliminación.

Se eliminan los registros auditables atribuibles con certeza a la edición. Los
registros heredados ambiguos permanecen. Las cuentas de usuario y demás
ediciones se conservan; si otra edición copió el reglamento eliminado, solo se
desvincula el origen y se preservan su contenido y estado. La inmutabilidad de
votos y la auditoría append-only siguen vigentes fuera de esta operación.

La ruta usa la conexión principal de la API (`DATABASE_URL`) invocando la rutina
`SECURITY DEFINER` `eliminar_edicion_completa` (instalada por `0025` y
habilitada sin cuenta dedicada en `0029-eliminar-edicion-sin-cuenta-dedicada.sql`),
protegida por sesión de `ADMINISTRADOR` y confirmación explícita en el modal.

## Reglamento en borrador

Implementación: `api/src/modules/reglamento/reglamento-borrador.js` y `api/src/modules/reglamento/admin-reglamento.routes.js`. Todas las rutas
viven bajo `/api/admin/ediciones/:edicionId/versiones/:versionId/` y exigen rol `ADMINISTRADOR`.
Toda escritura exige que la versión esté en `BORRADOR`; si no, responde `409 version_no_borrador`.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` / `POST` | `rubros` | Lista o crea un rubro. |
| `PATCH` / `DELETE` | `rubros/:rubroId` | Modifica o borra un rubro (el borrado se bloquea si tiene especialidades). |
| `PUT` | `rubros/orden` | Reordena todos los rubros de la versión en una sola operación (`{ "items": [{ "rubroId", "orden" }] }`). Permite intercambiar posiciones. |
| `PUT` | `rubros/:rubroId/especialidades` | Reemplaza las especialidades que evalúan el rubro (`{ "especialidadIds": [...] }`). |
| `GET` / `PUT` | `escala` | Lee o guarda la escala de la versión (`{ "minimo", "maximo" }`). Una sola por versión. |
| `GET` / `POST` | `requisitos` | Lista o crea un requisito de presentación. `puedePuntuar` es `false` por defecto. |
| `PATCH` / `DELETE` | `requisitos/:requisitoId` | Modifica o borra un requisito. |
| `GET` / `POST` | `premios` | Lista o crea un premio. |
| `PATCH` / `DELETE` | `premios/:premioId` | Modifica o borra un premio. |

- Un rubro tiene `tipoSujeto` del catálogo de sujetos. Su `tipoRubro` es `NOMINATIVO` o `ALEATORIO`;
  un rubro `ALEATORIO` exige `nominadosMaximosPorComparsa` o `nominadosMaximos` (R7: configurable). La interfaz web configura `nominadosMaximosPorComparsa` (migración `0030`).
- En 2027 la única escala por versión es `minimo: 1, maximo: 5`. Otro rango devuelve `400 escala_invalida`.
- Cada rubro define `evaluable` (por defecto `true`). Todas sus filas heredan ese valor.
- Las especialidades de un rubro deben pertenecer a la misma edición.
- El orden de los rubros es único dentro de la versión (migración `0011`). Un orden repetido responde
  `409 orden_existente`; para cambiarlo de varios rubros a la vez, usar `PUT rubros/orden`.
- Códigos nuevos: `version_inexistente` (404), `rubro_inexistente`, `requisito_inexistente`,
  `premio_inexistente` (404), `version_no_borrador` (409), `codigo_existente` (409),
  `nombre_existente` (409), `con_dependencias` (409), y validaciones 400 como `tipo_sujeto_invalido`,
  `tipo_rubro_invalido`, `nominados_requeridos`, `escala_invalida`, `modalidad_invalida`.
- Los premios son independientes: no existe relación premio ↔ rubro (decisión del responsable del proyecto).

## Planilla

Implementación: `api/src/modules/reglamento/planilla.js` y `api/src/modules/reglamento/admin-planilla.routes.js`, con la migración `0012`.
Cada fila es sujeto × rubro × especialidad. Las nominaciones `MANUAL` se pueden editar aunque
la versión esté publicada, hasta abrir la primera noche (H11); las filas generadas solo se
pueden generar o excluir mientras la versión está en `BORRADOR`.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/:edicionId/versiones/:versionId/planilla` | Lista las filas con nombres de rubro, comparsa y especialidad. |
| `POST` | `/:edicionId/versiones/:versionId/planilla/generar` | Crea las filas `GENERADA` de los rubros nominativos. No toca lo existente. |
| `POST` | `/:edicionId/versiones/:versionId/rubros/:rubroId/nominaciones` | Nomina un sujeto en un rubro aleatorio (`{ "sujetoId", "especialidadId" }`). Fila `MANUAL`. |
| `PATCH` | `/:edicionId/versiones/:versionId/planilla/:filaId` | Cambia `excluida`. Enviar `evaluable` devuelve `400 evaluable_por_rubro`; se configura en el rubro. |
| `DELETE` | `/:edicionId/versiones/:versionId/planilla/:filaId` | Borra una nominación `MANUAL`. Las generadas se excluyen, no se borran. |

- Con la versión publicada, solo se nominan y modifican las filas `MANUAL` (H11); generar o
  excluir filas generadas responde `409 version_no_borrador`.
- El orden de las filas generadas continúa después de las existentes al regenerar.
- Un identificador de ruta que no es UUID responde `404` con el código de su recurso.
- Un nominado es un sujeto distinto: el mismo sujeto en J1 y en J3 cuenta una vez para el tope.
- Los topes (`nominadosMaximos` por edición y `nominadosMaximosPorComparsa`) se aplican solo a
  las nominaciones manuales. La generación automática no se limita por topes.
- Solo se nomina manualmente en rubros `ALEATORIO` o en rubros `NOMINATIVO` de tipo `PERSONA` (evitando cruces entre personas y rubros distintos); un sujeto debe ser del tipo del rubro. `POST .../planilla/generar` genera automáticamente solo rubros `NOMINATIVO` cuyo tipo de sujeto no es `PERSONA`.
- Códigos nuevos: `fila_inexistente` (404), `padron_congelado`, `sujeto_no_corresponde`,
  `nominados_excedidos`, `nominados_comparsa_excedidos`, `fila_existente`, `rubro_no_aleatorio`,
  `solo_manual_se_borra` (409).
- `GET /:edicionId/versiones/:versionId/checklist-publicacion` devuelve `publicable`, `bloqueantes`,
  `advertencias` y `resumen`. Bloquea escala inexistente, rubros sin especialidad, filas
  nominativas faltantes y noches de competencia sin orden. Advierte especialidades sin rubros
  y comparsas activas sin noche de competencia.
- `GET /:edicionId/versiones/:versionId/vista-previa` agrupa filas por especialidad y comparsa;
  no devuelve campos de puntaje.
- `POST /:edicionId/versiones/:versionId/publicar` publica solo si no hay bloqueantes, cambia la
  versión activa anterior a `SUPERSEDIDA` y audita en la misma transacción. Errores: `409
  publicacion_con_bloqueantes` o `version_no_borrador`.
- D24 (la fórmula general y los dos carros de mayor puntaje) está confirmada, pero el esquema
  `regla_calculo_version`/`algoritmo_calculo` aún no está aplicado; este checklist no valida
  parámetros de algoritmos.

## Planilla por noche y especialidad

`GET` y `PUT /:edicionId/versiones/:versionId/noches/:nocheId/planilla/:especialidadId`
requieren `ADMINISTRADOR`. Ambos devuelven `{ "configurada": true, "filaIds": [...] }`
si hay una selección guardada. Si la noche está en `DRAFT` y aún no se guardó,
`GET` devuelve `configurada: false` y propone filas del catálogo de comparsas
activas programadas en su orden de desfile. En una noche ya abierta sin
configuración histórica devuelve `configurada: false` y `filaIds: []`.

`PUT` reemplaza toda la selección con `{ "filaIds": ["<UUID>", ...] }`, en el
orden enviado, y audita el cambio. Enviar `filaIds: []` confirma explícitamente
que no hay nada para evaluar en esa especialidad. Devuelve `400 filas_invalidas` para IDs mal formados o
repetidos, `409 filas_fuera_de_contexto` para filas inelegibles y
`409 noche_no_editable` si la noche ya no está en `DRAFT`.
Si se elimina del catálogo una nominación que todavía es editable, se quita
también de las selecciones en borrador que la incluían.

Para el panel de planillas por noche, dos rutas de lectura de apoyo:

- `GET /api/admin/ediciones/:edicionId/versiones` devuelve `{ "items": [{ "id", "numero", "estado" }] }`, de la versión más nueva a la más antigua. Exige `ADMINISTRADOR`; una edición inexistente responde `404 edicion_inexistente`.
- `GET /api/admin/ediciones/:edicionId/versiones/:versionId/noches/:nocheId/planilla/:especialidadId/candidatas` devuelve `{ "items": [{ "id", "rubroNombre", "comparsaNombre" }] }` en orden de desfile. Lista las filas elegibles aunque ya haya una selección guardada; el `GET` de la planilla por noche no cambia su contrato. Usa los mismos códigos de error que esa ruta (`noche_inexistente`, `version_inexistente`, `especialidad_inexistente`).

## Apertura de noche

Implementación: `api/src/modules/ediciones/apertura-noche.js`, `api/src/modules/ediciones/admin-apertura.routes.js` y migraciones `0013` y `0031`.
La ruta usa la conexión principal `DATABASE_URL`, requiere rol `ADMINISTRADOR` y recibe
`{ "claveOperacion": "<UUID>" }`:

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/:edicionId/noches/:nocheId/apertura` | Abre la noche y fija su versión y sus asignaciones activas en una instantánea, en la misma transacción que la auditoría. Un reenvío equivalente no la duplica. |

Bloquea si no hay versión publicada, si faltan condiciones del checklist de publicación,
si alguna especialidad usada por un rubro no tiene jurado activo asignado a esa noche
(salvo en una noche competitiva si su lista está confirmada como vacía),
o si alguna comparsa activa carece de fila `SCHEDULED` en el orden. Al abrir la primera
noche, la versión pasa a `CONGELADA`; la propia noche abierta congela el padrón por las
restricciones existentes. Errores de checklist: `409 apertura_con_bloqueantes` (incluye
`bloqueantes`). Una noche competitiva también necesita una selección guardada
para cada especialidad requerida por el reglamento o por una asignación activa
(`especialidades_sin_planilla`). Una lista vacía bloquea si tiene un jurado
asignado activamente o si quedó vacía sin confirmación explícita
(`especialidades_con_planilla_vacia`). Las listas vacías en borrador anteriores
a la migración `0016` deben confirmarse de nuevo. Si alguna fila guardada ya no corresponde al
desfile, la apertura se bloquea con `filas_planilla_fuera_de_contexto`. No se
usa la propuesta automática como respaldo. Repetir la misma clave y noche devuelve el resultado idempotente; reutilizarla
en otra operación responde `409 clave_reutilizada`. Abrir la noche no la habilita
para cerrar automáticamente: el Escribano debe confirmar el cierre cuando el
servidor haya recibido todas las planillas esperadas.

## Apertura de edición

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `POST` | `/:edicionId/apertura` | Pasa la edición de `CONFIGURING` a `OPEN`. Cuerpo: `{ "claveOperacion": "<UUID>" }`. |

- Usa la conexión principal `DATABASE_URL` (migración `0031`).
- Repetir la misma `claveOperacion` sobre la misma edición responde `200` con `repetida: true`
  y el mismo `abiertaEn`, sin volver a escribir.
- Abrir no congela reglamento ni padrón: eso ocurre al abrir la primera noche.
- Respuestas de error: `clave_operacion_invalida` (400), `edicion_inexistente` (404),
  `clave_reutilizada` (409, la clave ya se usó con otra edición), `edicion_ya_abierta` (409).
- Permisos que usa la apertura según el código: `edicion` (lectura y actualización),
  `operacion_apertura` (lectura e inserción) y `auditoria` (inserción).

Todas las rutas viven bajo `/api/admin/ediciones` y exigen sesión autenticada con
rol `ADMINISTRADOR`, verificado en la base en cada petición. Sin sesión responden
`401`; con sesión sin el rol, `403`.

## Noches

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/:edicionId/noches` | Lista las noches de la edición por `orden`. |
| `POST` | `/:edicionId/noches` | Crea una noche en `DRAFT`. |
| `PATCH` | `/:edicionId/noches/:nocheId` | Modifica una noche en `DRAFT`. |
| `DELETE` | `/:edicionId/noches/:nocheId` | Borra una noche en `DRAFT` sin asignaciones. |

Cuerpo de creación:

```json
{
  "orden": 1,
  "nombre": "Primera noche",
  "fecha": "2027-02-06",
  "tipo": "COMPETENCIA",
  "cuentaParaPuntaje": true
}
```

- `orden` es un entero positivo y único por edición.
- `fecha` es opcional, con formato `AAAA-MM-DD`.
- `tipo` acepta `COMPETENCIA` o `PREMIACION`, los valores ya aplicados en la
  migración `0007`. Su confirmación funcional para 2027 sigue pendiente.
- `cuentaParaPuntaje` es booleano y vale `true` por defecto.
- La noche nace en `DRAFT`; esta API no abre ni cierra noches.
- Una noche que no está en `DRAFT` no se modifica ni se borra.
- El borrado se bloquea si la noche tiene asignaciones de jurado.

## Especialidades

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/:edicionId/especialidades` | Lista las especialidades por `orden`. |
| `POST` | `/:edicionId/especialidades` | Crea una especialidad activa. |
| `PATCH` | `/:edicionId/especialidades/:especialidadId` | Modifica nombre, código, orden o estado. |
| `DELETE` | `/:edicionId/especialidades/:especialidadId` | Borra una especialidad sin asignaciones. |

Cuerpo de creación:

```json
{ "nombre": "Vestuario", "codigo": "J1", "orden": 1 }
```

- `nombre` y `codigo` son obligatorios; `codigo` y `orden` son únicos por edición.
- `activa` se puede cambiar con `PATCH`.
- Si alguna noche de la edición ya no está en `DRAFT`, el padrón está congelado:
  crear, modificar o borrar responde `409 padron_congelado`.
- El borrado se bloquea si la especialidad tiene asignaciones de jurado.

## Padrón

Implementación: `api/src/modules/padron/padron-evento.js` (servicio) y `api/src/modules/padron/admin-padron.routes.js` (rutas),
montadas bajo el mismo prefijo `/api/admin/ediciones`. Mismas reglas de sesión y rol.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` / `POST` | `/:edicionId/comparsas` | Lista o crea una comparsa (`nombre`, `categoria` `PRIMERA`/`AGRUPACION`, `activa`, `logoDataUrl` opcional PNG/JPG/WebP hasta 300 KB). |
| `PATCH` / `DELETE` | `/:edicionId/comparsas/:comparsaId` | Modifica o borra. El borrado se bloquea si hay historial. |
| `GET` / `POST` | `/:edicionId/participantes` | Lista o crea un participante (`nombreCompleto`, `esMenor`, `activo`). |
| `PATCH` | `/:edicionId/participantes/:participanteId` | Modifica un participante. |
| `GET` / `POST` | `/:edicionId/comparsas/:comparsaId/sujetos` | Lista o crea un sujeto evaluable de la comparsa. |
| `PATCH` / `DELETE` | `/:edicionId/sujetos/:sujetoId` | Cambia el nombre, o borra un sujeto sin historial. |
| `GET` / `PUT` | `/:edicionId/noches/:nocheId/orden` | Lee o reemplaza el orden de presentación de una noche. |

- Un sujeto `PERSONA` exige `participanteId` y no lleva nombre; el resto de tipos exige `nombre`.
  El tipo y el participante se fijan al crear; para cambiarlos se borra y se crea de nuevo.
- Un sujeto no se desactiva: `activo` no se acepta al crear ni al modificar (`400 sujeto_activo_no_editable`).
  Un error de carga se corrige borrando el sujeto, lo que solo se permite sin historial (`409 con_dependencias`).
  Las sanciones se registran como penalizaciones, no cambiando el sujeto.
- `PUT .../orden` recibe `{ "items": [{ "comparsaId", "orden" }] }`, reemplaza el orden completo
  y solo funciona con la noche en `DRAFT`. El intercambio de lugares se resuelve en una sola transacción.
- Con una noche fuera de `DRAFT`, el padrón completo (comparsas, participantes, sujetos y orden)
  queda congelado: las escrituras responden `409 padron_congelado` o `409 noche_no_editable`.
- Una comparsa inactiva no admite sujetos ni orden (`409 comparsa_inactiva`), y una con padrón
  cargado no se desactiva (`409 comparsa_con_padron`).
- Las pasadas (apariciones repetidas de un sujeto) todavía no tienen API; quedan para una issue propia.

Códigos nuevos: `categoria_invalida`, `tipo_sujeto_invalido`, `sujeto_datos_invalidos`,
`es_menor_invalido`, `activo_invalido` (400); `comparsa_inexistente`, `participante_inexistente`,
`sujeto_inexistente`, `referencia_inexistente` (404); `comparsa_con_padron`, `comparsa_inactiva`,
`participante_ya_en_comparsa`, `con_dependencias` (409).

## Errores

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `nombre_invalido` | 400 | Nombre vacío. |
| `codigo_invalido` | 400 | Código vacío. |
| `orden_invalido` | 400 | Orden no entero o menor que 1. |
| `fecha_invalida` | 400 | Fecha con formato o calendario inválido. |
| `tipo_invalido` | 400 | Tipo de noche desconocido. |
| `cuenta_para_puntaje_invalido` | 400 | Valor no booleano. |
| `activa_invalida` | 400 | Valor no booleano. |
| `sin_cambios` | 400 | `PATCH` sin campos conocidos. |
| `edicion_inexistente` | 404 | La edición no existe. |
| `noche_inexistente` | 404 | La noche no pertenece a la edición. |
| `especialidad_inexistente` | 404 | La especialidad no pertenece a la edición. |
| `orden_existente` | 409 | Ya hay una fila con ese orden en la edición. |
| `codigo_existente` | 409 | Ya hay una especialidad con ese código. |
| `noche_no_editable` | 409 | La noche no está en `DRAFT`. |
| `noche_con_dependencias` | 409 | La noche tiene asignaciones de jurado. |
| `especialidad_con_dependencias` | 409 | La especialidad tiene asignaciones de jurado. |
| `padron_congelado` | 409 | Hay una noche abierta en la edición. |

## Auditoría

Crear, modificar y borrar noches o especialidades registra una fila en
`auditoria` dentro de la misma transacción, con el actor de la sesión y la
entidad afectada. No se guardan secretos, tokens ni datos sensibles.

## Implementación

- Servicio de dominio: `api/src/modules/ediciones/configuracion-edicion.js`.
- Rutas: `api/src/modules/ediciones/admin-ediciones.routes.js`.
- Pruebas: `api/test/modules/ediciones/noches.test.js` y `api/test/modules/ediciones/especialidades.test.js`.
