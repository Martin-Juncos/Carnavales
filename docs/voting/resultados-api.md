# API de cálculo de resultados, empates y publicación (P6C)

Todas las rutas devuelven `Cache-Control: no-store`. Ningún endpoint devuelve
puntajes ni permite calcular antes del cierre total (`409 edicion_no_cerrada`,
invariante `D15`). El rol `JURADO` recibe siempre `403 sin_permiso`.

## Operación exclusiva del Escribano (`/api/escribano`)

Todas exigen sesión activa con rol `ESCRIBANO` (`401`/`403`) y cuerpo JSON con
`confirmar: true` (`400 confirmacion_requerida` si falta).

### Calcular nuevo snapshot de resultados

`POST /api/escribano/ediciones/:edicionId/resultados/calcular`

Parámetros opcionales: `{ maxCarrosComparsa?: 1..20 (default 2), categoriasGenerales?: ["PRIMERA" | "AGRUPACION"] (default ["PRIMERA"]), confirmar: true }`.

- Ejecuta el motor `GOYA_2026_V1` sobre noches `COMPETENCIA` con
  `cuenta_para_puntaje = true` y `estado = 'CLOSED'`, sus planillas oficiales
  de la versión congelada y las penalizaciones `ACTIVA` de esas noches.
- Crea un nuevo snapshot inmutable (`numero` incremental) con `hashEntradas`
  SHA-256, tablas `resultado_comparsa`, `resultado_rubro_sujeto` y los empates
  en primer puesto (`posicion = 1`) del ranking general y de cada rubro raíz.
- Responde `201` con el snapshot completo; `409 edicion_no_cerrada`,
  `409 resultado_ya_publicado`, `409 edicion_retirada` o `409 sin_datos_calculo`.

### Resolver un empate manualmente (`D16`)

`POST /api/escribano/ediciones/:edicionId/resultados/:calculoId/empates/:empateId/resolver`

Cuerpo JSON: `{ ganadorId, motivoResolucion, referenciaActa, confirmar: true }`.

- Valida que `ganadorId` pertenezca a los candidatos empatados
  (`422 candidato_empate_invalido`), registra la resolución sin alterar votos
  ni puntajes y audita `empate_resuelto`.
- Responde `200` con el empate resuelto (idempotente si se repite con los
  mismos datos; `409 empate_ya_resuelto` si difieren; `409 resultado_ya_publicado`
  si el snapshot ya fue publicado).

### Publicar resultados oficiales

`POST /api/escribano/ediciones/:edicionId/resultados/:calculoId/publicar`

- Bloquea si existen empates pendientes (`409 empates_pendientes`) o si la
  edición ya tiene otro snapshot publicado (`409 resultado_ya_publicado`).
- Transiciona `CALCULADO → PUBLICADO`, audita `resultado_publicado` en la misma
  transacción y responde `200` (idempotente sobre el mismo snapshot).

## Consulta post-cierre (`/api/resultados`, `ESCRIBANO` y `ADMINISTRADOR`)

### Consultar resultados y snapshots

`GET /api/resultados/ediciones/:edicionId` (acepta `?calculoId=<uuid>`).

- `401` sin sesión, `403` para `JURADO`, `404` si no existe o está retirada,
  `409 edicion_no_cerrada` antes del cierre total.
- Responde `200` con `{ edicion, snapshots, activo }` (el snapshot publicado,
  el solicitado o el último calculado).

### Consultar puntajes detallados del escrutinio

`GET /api/resultados/ediciones/:edicionId/puntajes`

- Mismo RBAC (`ESCRIBANO` o `ADMINISTRADOR`) y barrera `CLOSED`.
- Devuelve el detalle completo de notas recibidas por noche, especialidad,
  jurado, comparsa, rubro y sujeto para verificación del escrutinio.
