# Diseño físico y contrato API: actas oficiales de resultados PDF/CSV con SHA-256 (P6D)

> **Aprobado e implementado en la migración `0035`.** El responsable del
> proyecto aprobó este diseño y la biblioteca `pdf-lib`, emitiendo el acta
> directamente sobre las clasificaciones publicadas sin tabla adicional de
> vinculación de premios. El contrato vigente está en [actas-api.md](actas-api.md).

**Base aprobada (decisiones de producto, no se reabren aquí):**

- **Alcance (pregunta 1):** «Solo actas de resultados — recomendado». La
  planilla imprimible individual queda para otra etapa; P6D se concentra en
  los documentos oficiales de resultados.
- **Acceso (pregunta 2):** «Escribano y Administrador — recomendado». Descarga
  y verificación dentro del sistema, con sesión y autorización. La emisión
  sigue reservada al `ESCRIBANO`.
- **Momento de emisión (pregunta 3):** «Solo resultados publicados —
  recomendado». Después del cierre total y de la publicación oficial; el acta
  identifica exactamente la versión de resultados utilizada.
- **Contenido (pregunta 4):** «Resultados y fundamento — recomendado».
  Edición, versión publicada, fecha y emisor; clasificación y ganadores por
  premio; desglose por rubro, penalizaciones y resoluciones de empates
  aplicadas. Sin notas individuales por jurado.
- **Fuente de premios (pregunta 5):** «Usar los premios del catálogo».
  No alcanza con renombrar los rankings por rubro como premios.
- **Adjudicación (pregunta 6):** «Según una clasificación calculada — recomendado».
  Cada premio se vincula a una clasificación general o por rubro; el ganador
  surge de ese resultado y de las resoluciones oficiales de empate. No se
  incluye adjudicación manual alternativa ni modalidad mixta.

El modelo de tablas, columnas, triggers, bloqueos, idempotencia, formato de
PDF/CSV, biblioteca y plan de pruebas quedaron aprobados e implementados. No
implica un flujo de firma digital:
ver [§7](#7-emisión-sin-firma-digital-ni-certificación-diseñada).

El contrato detallado de endpoints vive en [actas-api.md](actas-api.md) (mismo
estado de borrador); este documento no repite esa tabla.

---

## 1. Alcance y límites

- **Incluye (propuesto):** generación de un acta oficial de resultados en PDF
  y CSV por cada snapshot `PUBLICADO` de `calculo_resultado` (P6C,
  `0028-resultados-publicacion.sql`), con hash SHA-256 por representación,
  versionado sin sobrescritura, listado/descarga/verificación para
  `ESCRIBANO`/`ADMINISTRADOR`, y compatibilidad con
  `eliminar_edicion_completa` (`0025`/`0028`).
- **Excluye (fuera de P6D, según decisiones confirmadas):** planilla
  imprimible individual (diferida), verificación pública sin sesión, e
  impugnaciones digitales (`D17`).
- **Invariante `D15` heredada:** el acta no incluye notas individuales por
  jurado; solo expone el resultado consolidado ya publicado.

## 2. Qué datos existen hoy para el contenido del acta

El motor v1 (`resultados.engine.js`, `0028`) ya calcula y persiste, por
snapshot publicado: cabecera (edición, versión de reglamento, algoritmo,
parámetros, fechas) en `calculo_resultado`; ranking general de comparsas con
desglose en `resultado_comparsa`; ranking por rubro/sujeto en
`resultado_rubro_sujeto`; y empates con su resolución manual (candidatos,
ganador, motivo, referencia de acta) en `empate_resultado`.

**Catálogo de premios:** existe hoy un catálogo de premios (`premio_version`, migración `0010`;
contrato en [configuracion-api.md](configuracion-api.md#reglamento-en-borrador),
tabla de rutas `premios`/`premios/:premioId`). Ese catálogo **sí** existe, de
forma independiente de los rubros **a nivel de modelo de datos**: «los
premios son independientes: no existe relación premio ↔ rubro (decisión del
responsable del proyecto)» (`configuracion-api.md`, comentario `H10` en
`0010-rubros-escalas-premios.sql`). Esa independencia es una decisión de
esquema (sin tabla ni columna de vínculo); no significa que el reglamento
carezca de reglas propias de asignación entre cargos, rubros, clasificaciones
y premios. El reglamento aportado ya documenta al menos dos patrones
distintos (hallazgos verificados en
[decision-questions.md](decision-questions.md#hallazgos-del-reglamento-aportado);
ver también el [glosario](../../GLOSSARY.md)):

- **Premios individuales por rubro:** la regla general de la fuente suma
  los puntajes de cada jurado durante las noches puntuables y adjudica al
  mayor puntaje. No convierte cada componente puntuable en un premio aparte.
- **Elección de reina:** una única clasificación de las candidatas
  adjudica tres premios distintos a partir de sus tres primeros puestos:

  | Puesto de la clasificación | Premio |
  | --- | --- |
  | 1.º | Reina del Carnaval |
  | 2.º | Primera Princesa del Carnaval |
  | 3.º | Segunda Princesa del Carnaval |

  El cargo que ocupa cada candidata (Reina de Comparsas, Anunciadora,
  Solista, etc.) no determina el premio: distintos cargos compiten por el
  mismo premio «Reina del Carnaval».

Ningún premio se adjudica siempre al primer puesto de su clasificación por el
solo hecho de ser premio.

El motor v1 no referencia `premio_version` en sus tablas de resultados.
Esto describe la implementación, no demuestra que falte una regla de
adjudicación: las fuentes ya definen los casos anteriores. No se deduce una
correspondencia por nombres coincidentes ni se presume una relación 1:1.

### 2.1 Vinculación de premios a resultados (propuesta técnica)

La propuesta anterior de introducir una configuración genérica nueva como
prerrequisito universal queda retirada. Primero debe contrastarse cada caso
reglamentario con la cobertura real del motor y de los resultados publicados:

- identificar al sujeto y al rubro sin confundirlos con su cargo;
- distinguir la elección de Reina del Carnaval de Reina de Comparsas;
- comprobar los premios derivados de los puestos segundo y tercero;
- comprobar los premios con varios componentes puntuables, sin inventar
  agregaciones nuevas ni tratar cada componente como un premio separado;
- conservar las resoluciones oficiales de empate aplicables, sin introducir
  reglas nuevas para puestos premiados.

Solo una brecha técnica concreta y verificada requiere ampliar el diseño y
obtener su aprobación. No se afirma aquí que todos esos casos ya estén
cubiertos por el motor. La ausencia de un vínculo genérico no constituye por
sí sola un bloqueo de emisión para ediciones congeladas. Se conserva la
inmutabilidad del reglamento: esta corrección no autoriza cambiarlo después
de la apertura.

El acta registra directamente las clasificaciones publicadas del snapshot (el
ranking general de comparsas y el ranking de cada rubro evaluado, con sus
penalizaciones y resoluciones de empate), sin introducir una tabla paralela de
vinculación de premios.

**Penalizaciones:** quedan congeladas al cerrar la votación completa (`D14`,
P6B: «habilitadas hasta el cierre total y congeladas al cerrar la votación
completa»), por lo que el acta puede derivar con seguridad el detalle de cada
penalización `ACTIVA` de la edición desde la tabla `penalizacion` existente,
sin inventar un corte temporal adicional. Queda como propuesta técnica (no
aprobada, sin impacto en datos) si el acta lista cada penalización por
separado o solo el monto agregado que ya calculan `resultado_comparsa`/
`resultado_rubro_sujeto`; ambas opciones son derivables de datos ya
persistidos.

## 3. Modelo de datos propuesto

Cabecera + representaciones binarias, siguiendo el patrón de snapshot
inmutable ya usado en `calculo_resultado`/`resultado_comparsa` (`0028`).

### 3.1 `acta_resultado` (cabecera de una versión de acta, propuesta)

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `edicion_id uuid NOT NULL REFERENCES edicion (id) ON DELETE RESTRICT`
- `calculo_id uuid NOT NULL`, FK compuesta `(calculo_id, edicion_id)` →
  `calculo_resultado (id, edicion_id)` — esa FK compuesta ya está respaldada
  hoy por `calculo_resultado.UNIQUE (id, edicion_id)` (`0028`, verificado).
  Solo se permite apuntar a un snapshot `PUBLICADO` (pregunta 3), validado por
  trigger, no por `CHECK` declarativo (requiere consultar otra tabla).
- `numero integer NOT NULL CHECK (numero > 0)`, `UNIQUE (edicion_id, numero)`
  — versión incremental; una nueva versión nunca reemplaza la anterior.
- `UNIQUE (id, edicion_id)` — necesaria para que `acta_representacion` pueda
  tener su propia FK compuesta con `edicion_id` (mismo patrón que
  `calculo_resultado`).
- `generada_por text NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT`
  (`ESCRIBANO` en el momento de generación; ver [§4.2](#42-idempotencia-propuesta-con-vínculo-al-actor)
  sobre el uso de esta columna en la comparación de reenvíos).
- `generada_en timestamptz NOT NULL DEFAULT clock_timestamp()`
- `operation_id uuid NOT NULL UNIQUE` — mismo patrón exacto que
  `penalizacion.operation_id` (`0027-penalizaciones.sql`: `uuid NOT NULL
  UNIQUE`, sin alcance declarado por edición): una sola fila en todo el
  sistema por `operationId`. Ver [§4.2](#42-idempotencia-propuesta-con-vínculo-al-actor)
  para cómo se usa junto con `generada_por` y `edicion_id`/`calculo_id` en la
  comparación de reenvíos, sin ampliar el alcance de la columna en sí.

### 3.2 `acta_representacion` (archivo binario por formato, propuesta)

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `acta_id uuid NOT NULL`
- `edicion_id uuid NOT NULL` — columna explícita (no implícita vía `acta_id`)
  para sostener la FK compuesta y permitir que los triggers de purga y de
  inmutabilidad filtren directamente por `edicion_id`, igual que
  `resultado_comparsa`/`resultado_rubro_sujeto` en `0028`.
- FK compuesta `(acta_id, edicion_id)` → `acta_resultado (id, edicion_id)`,
  respaldada por el `UNIQUE (id, edicion_id)` de [§3.1](#31-acta_resultado-cabecera-de-una-versión-de-acta-propuesta).
- `formato text NOT NULL CHECK (formato IN ('PDF', 'CSV'))`
- `UNIQUE (acta_id, formato)` — como máximo una representación por formato y
  versión de acta.
- `contenido bytea NOT NULL` — bytes exactos del archivo generado. Esta
  diseño aprobado usa `bytea` en PostgreSQL para que la cabecera y ambas
  representaciones queden en la misma transacción atómica
  ([§4.1](#41-atomicidad)); no hay un mandato del responsable del proyecto
  sobre el mecanismo de almacenamiento ni una alternativa externa ya
  descartada por él. Un almacenamiento de objetos fuera de PostgreSQL sigue
  siendo una alternativa técnica abierta si se prioriza otro trade-off
  (tamaño de fila, replicación) al aprobar el diseño.
- `hash_sha256 text NOT NULL CHECK (hash_sha256 ~ '^[0-9a-f]{64}$')` —
  calculado sobre los bytes exactos de `contenido`, **no** sobre
  `hash_entradas` del cálculo (que certifica las entradas del motor, no el
  archivo emitido).
- `tamanio_bytes integer NOT NULL CHECK (tamanio_bytes > 0)` — `octet_length(contenido)`,
  columna redundante para validar integridad sin recalcular el hash en cada
  lectura de metadatos.
- `content_type text NOT NULL` — `application/pdf` o `text/csv; charset=utf-8`;
  debe ser estable para una misma generación (mismo valor leído en el
  metadato de listado, en la descarga y en la verificación; no se deriva de
  forma distinta en cada endpoint).

### 3.3 Inmutabilidad propuesta (triggers, estilo P6C)

- `acta_resultado` y `acta_representacion`: `INSERT` únicamente en la misma
  transacción (misma `pg_current_xact_id()`, patrón de `0028`), con edición
  `CLOSED`, snapshot `PUBLICADO` y actor `ESCRIBANO`. `UPDATE`/`DELETE`/
  `TRUNCATE` bloqueados, salvo `DELETE` bajo
  `edicion_eliminacion_autorizada(edicion_id)` (compatibilidad `0025`/`0028`).
- No se propone ningún mecanismo de "versión vigente" que oculte u anule
  automáticamente una versión anterior: todas las versiones generadas quedan
  accesibles, salvo que el responsable del proyecto apruebe expresamente un
  estado de anulación auditable (no asumido aquí).

## 4. Generación: atomicidad e idempotencia (propuesta)

### 4.1 Atomicidad

La generación arma el `acta_resultado` y **ambas** representaciones (PDF y
CSV) en una única transacción. Si falla la generación de cualquiera de las
dos, la transacción revierte por completo: no se propone guardar un acta con
solo PDF o solo CSV.

### 4.2 Idempotencia propuesta con vínculo al actor

`operation_id` propone el patrón de `penalizacion.operation_id` (`0027`):
`UNIQUE` global. La comparación de un reenvío incluye actor, edición y cálculo;
una colisión entre actores no devuelve datos del acta original. Toda solicitud
valida primero sesión, rol y acceso a una edición cerrada y no retirada.

Orden de verificación propuesto en la operación (antes de cualquier
precondición de estado del snapshot):

1. Buscar una fila existente de `acta_resultado` por `operation_id`.
2. Si existe: comparar, contra los valores recibidos en la solicitud actual,
   el `edicion_id`, el `calculo_id` **y** que `generada_por` coincida con el
   actor de la sesión que repite la llamada.
   - Si los tres coinciden: responder `200` con los metadatos ya generados,
     **sin reevaluar** si el snapshot sigue siendo el único publicado o si se
     publicó uno distinto después (el acta generada referencia su
     `calculo_id` original de forma inmutable).
   - Si alguno no coincide (edición distinta, cálculo distinto, o actor
     distinto): responder `409 operacion_conflictiva` con un mensaje genérico,
     sin incluir ningún dato del acta original (ni número, ni hashes, ni
     fecha) para no filtrar contenido de otro actor u otra edición.
3. Si no existe ninguna fila con ese `operation_id`: recién ahí validar las
   precondiciones de generación (edición cerrada y no retirada, snapshot
   `PUBLICADO`) y generar una fila nueva.

El reenvío conserva el resultado de la emisión exitosa original sin generar
nuevos archivos ni auditoría de emisión. No omite las comprobaciones vigentes
de sesión, rol ni acceso a la edición.

## 5. Bloqueos y concurrencia (propuesta, no heredada verbatim)

No existe en el repositorio un patrón de bloqueo ya verificado para una
operación de post-publicación idéntica a la emisión de actas; el precedente
más cercano es el de P6C para calcular un snapshot
([resultados-diseno.md §4.1](resultados-diseno.md#4-contrato-de-api), texto:
«Bloquea `edicion FOR SHARE` + advisory lock por edición para serializar
cálculos concurrentes»). El orden de P6A (`noche` antes que `edicion`,
[cierre-total-diseno.md §2.4](cierre-total-diseno.md#24-concurrencia-y-orden-de-bloqueos-anti-deadlock))
no aplica aquí: la generación de actas no toca la tabla `noche`.

Propuesta para P6D, siguiendo el precedente de P6C y no uno inventado:

1. `SELECT id, estado, retirada_en FROM edicion WHERE id = $1 FOR SHARE`.
2. Adquirir un advisory lock transaccional por edición para serializar emisiones
   y asignar `numero` sin carreras. La implementación debe verificar la
   compatibilidad de su clave y orden con los bloqueos existentes de resultados.
3. Buscar un reenvío y aplicar la comparación de §4.2; si no existe,
   bloquear el cálculo de esa edición con `FOR SHARE`.
4. Revalidar `estado = 'CLOSED'`, `retirada_en IS NULL` y snapshot `PUBLICADO`
   antes de insertar. Ante una colisión concurrente de `operation_id`, recuperar
   el registro confirmado y comparar actor/edición/cálculo: coincidencia devuelve
   el acta original; diferencia devuelve conflicto sin filas ni auditoría nuevas.

Esto es compatible con `eliminar_edicion_completa` (`0028`), que toma
`edicion ... FOR UPDATE`: una eliminación en curso bloquea el `FOR SHARE` de
este paso 1 hasta que termine; si la eliminación ya confirmó, los `SELECT`
posteriores no encuentran la edición o el cálculo y la operación responde
`404` en vez de generar un acta huérfana. Este documento no afirma haber
verificado un bloqueo equivalente dentro del código JavaScript de
`publicarResultadoEdicion`; la inmutabilidad de `calculo_resultado` tras
`PUBLICADO` ([0028 §3.2](resultados-diseno.md#32-triggers-auditoría-y-compatibilidad-con-0025))
es lo que impide que una publicación posterior altere el `calculo_id` ya
referenciado por un acta existente, no un bloqueo adicional de esta
propuesta.

## 6. Verificación de integridad

- El hash SHA-256 se calcula sobre los bytes exactos de `acta_representacion.contenido`
  en el momento de generarlos, antes de insertar la fila.
- La verificación recalcula SHA-256 sobre los bytes almacenados leídos en ese
  momento de PostgreSQL y lo compara contra `hash_sha256` guardado. Esto
  certifica **integridad de lo almacenado** (detecta corrupción de los bytes
  guardados en la base, por ejemplo un fallo de almacenamiento), no
  **autenticidad de una copia descargada**: si alguien modifica un archivo
  después de descargarlo, el sistema no lo detecta a menos que se vuelva a
  verificar contra el valor almacenado. No se propone una firma criptográfica
  que permita autenticar el archivo fuera del sistema sin consultar la base.
- La respuesta de verificación siempre expone la misma forma, coincida o no
  el hash (ver [actas-api.md](actas-api.md#verificar-integridad-de-una-representación)
  para la forma exacta): no se omiten campos según el resultado.

## 7. Emisión sin firma digital ni certificación diseñada

El acta usa "emitir" en sentido técnico: generar y registrar de forma
inmutable un archivo oficial con su hash. No diseña firma electrónica ni un
mecanismo de certificación digital. El reglamento aportado menciona que «el
escribano certifica el resultado» en el acto presencial de apertura de
sobres (hallazgo de página 9, registrado en
[decision-questions.md](decision-questions.md#hallazgos-del-reglamento-aportado));
esta propuesta no digitaliza ese acto ni decide qué rol cumple esa función en
el flujo digital. No es una decisión aprobada que el `ESCRIBANO` quede
excluido de certificar en el futuro; es, simplemente, que ningún mecanismo de
firma o certificación está diseñado todavía. Ningún texto generado por una
futura implementación debe decir "documento certificado" o "firmado
digitalmente" mientras esa semántica siga sin especificarse.

## 8. Retención y eliminación completa (`D21`)

Conservación indefinida de solo lectura, sin purga automática, igual que el
resto de la evidencia de la edición. `eliminar_edicion_completa` (`0025`/`0028`)
fue extendida en `0035` para purgar `acta_representacion` y `acta_resultado`
antes de `calculo_resultado`, agregando las entradas correspondientes a
`auditoria_atribuible_a_edicion` y los `GRANT`/`OWNER` de
`carnavales_propietario_eliminacion`, siguiendo el patrón de P6C en `0028`.

## 9. Seguridad y RBAC

- Generación: solo `ESCRIBANO` (coherente con `D10`/`D14`/P6C).
- Listado, descarga y verificación: `ESCRIBANO` y `ADMINISTRADOR` (pregunta 2).
  Sin verificador público ni endpoint sin sesión.
- Ningún endpoint de este diseño expone notas individuales por jurado ni
  puntajes que no estén ya consolidados en el snapshot publicado (`D15`).
- Auditoría: `acta_generada` en la misma transacción, con `edicion_id` siempre
  informado para purga completa vía `eliminar_edicion_completa`.
- Reenvíos con `operationId` reutilizado por otro actor u otra edición nunca
  devuelven datos del acta original (ver [§4.2](#42-idempotencia-propuesta-con-vínculo-al-actor)).

## 10. Re-emisión de una versión de acta: aprobada

Se aprobó generar una **nueva versión adicional** de acta sobre el mismo
`calculo_id` publicado (por ejemplo, tras corregir un error de maquetación),
compatible con el modelo de versiones inmutables de
[§3.1](#31-acta_resultado-cabecera-de-una-versión-de-acta-propuesta)
(`UNIQUE (edicion_id, numero)` permite varias versiones sin sobrescribir
ninguna). Ninguna versión anterior se oculta ni se anula automáticamente.

## 11. Mapeo de contenido PDF/CSV (propuesta)

Ambas representaciones se generan desde los mismos datos de
[§2](#2-qué-datos-existen-hoy-para-el-contenido-del-acta); el PDF es para
lectura humana y el CSV para procesamiento posterior, sin agregar datos
exclusivos a uno u otro formato.

- **Decimales:** los montos numéricos (`numeric(10,2)` en el motor) se
  serializan con punto decimal y dos decimales fijos en ambos formatos.
- **Escaping/CSV:** cada celda de texto se escribe entre comillas dobles con
  escape RFC 4180; cualquier celda que comience con `=`, `+`, `-` o `@` se
  antepone con un apóstrofe (`'`) para evitar inyección de fórmulas al abrir
  el CSV en una planilla de cálculo.
- **Codificación:** UTF-8 con BOM en el CSV; PDF con fuente embebida que
  soporte los caracteres del español (acentos, eñe).
- **Biblioteca de generación de PDF:** `pdf-lib` (aprobada), sin dependencias
  nativas, con Helvetica/WinAnsi para acentos y eñe.
- **Determinismo:** no se proponen bytes idénticos entre dos generaciones del
  mismo `calculo_id` (por ejemplo, la fecha de generación cambia); el hash se
  ata a la representación efectivamente generada y almacenada, no a una
  función recalculable bajo demanda.

## 12. Brechas resueltas y riesgos restantes

- El responsable confirmó emitir las actas directamente con las
  clasificaciones publicadas (ranking general de comparsas y por rubro), sin
  introducir una tabla paralela de vinculación de premios ni modificar
  reglamentos congelados.
- La re-emisión de versiones quedó aprobada ([§10](#10-re-emisión-de-una-versión-de-acta-aprobada)).
- La biblioteca de PDF quedó resuelta con `pdf-lib` ([§11](#11-mapeo-de-contenido-pdfcsv-propuesta)).
- La migración es `0035-actas-oficiales.sql`.
- Semántica de certificación/firma digital futura: sin especificar
  ([§7](#7-emisión-sin-firma-digital-ni-certificación-diseñada)); no se asume
  ninguna decisión sobre las funciones del `ESCRIBANO` en ese flujo futuro.

## 13. Plan de pruebas (ejecutado)

1. **PostgreSQL:** inmutabilidad de `acta_resultado`/`acta_representacion`,
   `UNIQUE` de versión y de formato por acta, generación solo sobre snapshot
   `PUBLICADO`, y purga completa vía `eliminar_edicion_completa` actualizada.
2. **API y RBAC:** `403` para `JURADO`, `409` por snapshot no publicado o
   edición no cerrada, `404` por edición inexistente o retirada, reenvío
   idempotente del mismo `operationId` con el mismo actor/edición/cálculo sin
   duplicar generación, `409 operacion_conflictiva` ante `operationId`
   reutilizado por otro actor o para otra edición/cálculo sin filtrar datos
   del acta original.
3. **Concurrencia:** emisiones simultáneas con la misma clave convergen en una
   sola acta; claves distintas reciben números únicos. Probar generación contra
   publicación y eliminación completa, sin actas huérfanas ni interbloqueos.
4. **Integridad:** SHA-256 recalculado coincide con el guardado; una
   corrupción simulada de `contenido` hace que `verificar` responda
   `coincide: false` manteniendo la misma forma de respuesta.
5. **Atomicidad:** un fallo forzado en la generación de una de las dos
   representaciones no deja un acta con una sola representación.
6. **CSV seguro:** celdas que empiezan con `=`, `+`, `-` o `@` quedan
   neutralizadas con apóstrofe inicial.
7. **Regresión:** comportamiento existente de `resultados.routes.js` y
   `escribano.routes.js` no cambia para las rutas ya implementadas de P6C.
