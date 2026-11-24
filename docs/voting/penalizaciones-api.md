# API de penalizaciones digitales (P6B)

Todas las rutas exigen una sesión activa con rol `ESCRIBANO` (`401` sin sesión,
`403` sin rol), validación UUID de `:edicionId` y `:penalizacionId` (`404` si
está mal formado) y devuelven `Cache-Control: no-store`. Ninguna respuesta
expone puntajes de jurados (`D15`).

## Consultar contexto de penalizaciones

`GET /api/escribano/ediciones/:edicionId/penalizaciones/contexto` devuelve la
edición, sus noches `COMPETENCIA` en `OPEN` o `CLOSED` (con las comparsas
programadas en `SCHEDULED`) y los rubros evaluables de la versión publicada o
congelada (usados al cargar `EXCESO_SHOW_BATERIA`).

Responde `404 edicion_inexistente` si la edición no existe o está retirada.

## Listar penalizaciones de una edición

`GET /api/escribano/ediciones/:edicionId/penalizaciones` devuelve
`{ items: [...] }` ordenadas por `registradaEn DESC`, incluyendo activas y
anuladas (con detalle de anulación cuando corresponde).

## Registrar una penalización

`POST /api/escribano/ediciones/:edicionId/penalizaciones` requiere JSON con
`confirmar: true`, `operationId` (UUID), `nocheId`, `comparsaId`, `tipo`,
`motivo`, `referenciaActa` y, según el tipo (`D14`):

- `RETRASO_INGRESO`: `minutos` entero `> 0`, `rubroVersionId` ausente/nulo →
  `0,50` pts/min con tope de `30` min (`15,00` pts máx.) y `cedioTurno = minutos > 30`.
- `RETRASO_SALIDA`: `minutos` entero `> 0`, `rubroVersionId` ausente/nulo →
  `0,50` pts/min.
- `EXCESO_SHOW_BATERIA`: `minutos` entero `> 0` y `rubroVersionId` evaluable de
  la versión vigente → `0,50` pts/min descontados de ese rubro en P6C.
- `MINIMO_INTEGRANTES`: sin `minutos` ni `rubroVersionId` → `puntosDescuento = 0`
  e `impidePremiosComparsa = true` (mantiene premios individuales).

Respuestas:
- `201` creada; `200` si se repite exactamente el mismo `operationId` con los
  mismos datos (idempotente, sin duplicar auditoría).
- `400 confirmacion_requerida` / `400 campos_invalidos` / `422 penalizacion_invalida`.
- `404 edicion_inexistente` / `noche_inexistente` / `comparsa_inexistente`.
- `409 operacion_conflictiva` (mismo `operationId` con otros datos),
  `edicion_cerrada`, `edicion_retirada`, `edicion_no_abierta`,
  `noche_no_penalizable`, `comparsa_no_programada_en_noche` o
  `rubro_penalizacion_invalido`.

## Anular una penalización (append-only)

`POST /api/escribano/ediciones/:edicionId/penalizaciones/:penalizacionId/anular`
requiere JSON con `confirmar: true`, `motivoAnulacion` y
`referenciaActaAnulacion`.

Nunca borra la fila original ni altera sus datos; transiciona `ACTIVA → ANULADA`
y registra `penalizacion_anulada` en `auditoria` dentro de la misma transacción.

- `200` anulada (o repetición idempotente con el mismo motivo y acta).
- `400 confirmacion_requerida` / `campos_invalidos`.
- `404 penalizacion_inexistente`.
- `409 edicion_cerrada`, `edicion_retirada`, `edicion_no_abierta` o
  `penalizacion_ya_anulada`.

Al cerrar la votación completa (`CLOSED`), tanto el registro nuevo como la
anulación quedan bloqueados definitivamente (`409 edicion_cerrada`), mientras
que el listado permanece en solo lectura y los reenvíos idempotentes exactos de
un `operationId` ya registrado antes del cierre devuelven `200` sin mutar datos.
