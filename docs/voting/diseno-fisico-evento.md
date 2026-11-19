# Diseño físico: agregado de edición (evento)

**Estado:** borrador v3. Aprobado por el responsable del proyecto para `0006` (edición y versiones de reglamento). Implementadas además, según las secciones de este diseño, `0007` (noche, especialidad, asignaciones de jurado y auditoría) y `0008` (padrón: comparsas, participantes, sujetos evaluables, orden de presentación y pasadas). El resto del agregado sigue sin autorizar y guardado en `api/migrations/pendientes/` hasta resolver sus decisiones pendientes (§10).

**Base:**
- Diseños de este proyecto: [`database-design.md`](database-design.md) y [`flujo-creacion-evento.md`](flujo-creacion-evento.md).
- Reglas: [`decision-questions.md`](decision-questions.md), `AGENTS.md` §2 y el reglamento de Goya (`REGLAMENTO DE GOYA 2025 (ULTIMO).pdf`) como base general.
- Puntuación de **nominativos y aleatorios**: `Reglamento_Carnaval.pdf` (proyecto de reglamento 2027, secciones VI y VII), por alcance acordado con el usuario. Verificado en imagen en p. 9, 14 y 15.
- Forma real de la puntuación: planilla modelo `Planilla_Puntaje Modelo2026.xlsx` (hojas J1, J2 y J3).
- Referencia de implementación: `Carnavales2027` (`api/src/db/migrations/`, `docs/modelo-de-datos-tablas.md`). Se adapta, no se copia.

**Alcance:** configuración de la edición: edición, versiones de reglamento, noches, categorías, comparsas, participantes, especialidades, orden de presentación, sujetos evaluables, pasadas, rubros, filas de planilla, escalas, reglas de cálculo, premios y enmiendas.

**Fuera de alcance:** jurados y asignaciones, planillas firmadas, puntajes, sincronización, penalidades, resultados, actas y auditoría común.

Origen de cada decisión: **Confirmado** (decisión registrada o del usuario), **Verificado en fuente** (planilla, reglamento o referencia), **Propuesta** o **Pendiente** (bloquea la migración).

## 0. Qué cambió en v3 y por qué

- **Se eliminan los ítems y subítems.** La planilla modelo no tiene filas padre, subtotales ni fórmulas: las tres hojas no contienen ninguna fórmula. Cada fila se puntúa por separado. **Verificado en fuente.**
- **La unidad de puntuación es la fila de la planilla**: sujeto × rubro × especialidad. Una fila de la planilla es lo que el jurado escribe, y lo que se suma después.
- **La especialidad va en la fila, no en el rubro.** El mismo rubro aparece en dos juradurías: «Impacto visual» del carro está en J1 y en J3; «Vestuario» de la batería está en J1 y en J3. **Verificado en fuente.**
- **Hay sujetos que no son personas**: carro, carroza de la reina, batería, banda musical, tema inédito, grupos. Se modelan como `sujeto_evaluable`. **Verificado en fuente.**
- **Filas grises = no evaluables.** En la hoja J1, la fila «Solista Femenina» está en gris con la nota «no compite por nada». Es el estilo de celda con relleno `C8C8C8`. **Verificado en fuente.**
- **Escala por rubro.** El reglamento dice que la planilla lleva «puntaje máximo y mínimo por rubro», y que el `0` solo sirve cuando el rubro no se presenta. El Excel modelo no muestra esos valores, así que los valores concretos quedan pendientes.
- **Pasadas repetidas.** Un participante puede tener más de una pasada en la misma comparsa y noche. Cada entrada referencia al mismo `sujeto_evaluable` y tiene su propio orden; la forma de puntuar o consolidar esas apariciones sigue pendiente (D6).

## 1. Convenciones

- **Nombres de tablas y columnas en español**, `snake_case` (`database-design.md`). La referencia usa inglés; no se copia.
- **Valores de estado en tokens del código** (`DRAFT`, `OPEN`, `CLOSED`, `CONFIGURING`), como en la referencia y en `AGENTS.md`. Las etiquetas visibles van en español.
- **Claves primarias `uuid`** con `gen_random_uuid()` en las tablas de dominio (A12). Las referencias a `usuario(id)` son `text`, porque así está definida la identidad en `0001`.
- **Todas las tablas de dominio llevan `edicion_id`.** Las relaciones internas usan FK compuestas `(id, edicion_id)`, como la referencia, para no cruzar ediciones.
- **Tablas hijas de una versión** llevan `edicion_id` y `version_id`, con FK compuesta `(version_id, edicion_id)` hacia `version_reglamento(id, edicion_id)`.
- **`ON DELETE RESTRICT`** en todas las referencias. Nada con historial se borra en cascada.
- **Lo que un `CHECK` no puede expresar** va en triggers, como en `0003-roles.sql`.
- **Migraciones con el formato del proyecto** (`0006-...sql`). No se adopta el formato `001_...` de la referencia.
- **Apertura por servicio auditado e idempotente.** Un trigger impide abrir la edición o una noche por fuera del servicio (adoptado de 018). La operación lleva una clave de operación registrada (adoptado de 085).

## 2. Qué adoptamos, adaptamos o descartamos

| Elemento | Fuente | Decisión | Motivo |
|---|---|---|---|
| Ámbito por evento (`event_id`, FK compuestas) | Referencia | **Adoptado** (`edicion_id`) | Ya era la intención del diseño. |
| Comparsas y participantes por evento | Referencia (`event_troupe`); corrección del usuario | **Adoptado** | `database-design.md`: comparsas y participantes pertenecen a una edición. |
| Especialidades por evento | Referencia (`event_specialty`); planilla (J1, J2, J3) | **Adoptado** (`especialidad`) | Las tres juradurías del modelo 2026 son especialidades. Su catálogo 2027 sigue pendiente (H6). |
| Orden de presentación por noche | Referencia (`night_troupe_schedule`) | **Adoptado y renombrado** (`orden_presentacion`) | Se agrega `programado_en` para las penalidades por retraso (D14). |
| Estados de noche | Referencia y `AGENTS.md` | **Adoptado** (`DRAFT`, `OPEN`, `CLOSED`) | `CLOSED` queda pendiente de D10. |
| Noches nuevas en evento abierto | Referencia (116) y `AGENTS.md` línea 84 | **Adoptado** | Las asignaciones se crean con la noche en `DRAFT` aunque el evento esté `OPEN`. |
| Apertura auditada e idempotente | Referencia (018, 085) | **Adoptado** (`operacion_apertura`) | `AGENTS.md` §3 y §4 (operaciones idempotentes). |
| Borrado con historial | Referencia (073) y `AGENTS.md` §Comparsas | **Adoptado** | Preserva evidencia. |
| Etapa de resultados append-only | Referencia (053) | **Adoptado** para la etapa de resultados, fuera de este alcance | |
| Ítems y subítems con jerarquía | `AGENTS.md`; la referencia tiene ítems planos | **Descartado** | La planilla no usa jerarquía ni subtotales. Ver H10. |
| `criterio_rubro` (texto para el jurado) | Referencia (`rubric_criterion`) | **Descartado** | La planilla no tiene columna de criterio: solo rubro y puntaje. |
| Requerido por ítem y «no se presentó» por ítem | Referencia (`evaluation_item`) | **Reemplazado** por la fila de planilla y por el rubro | La planilla califica por fila; «0» aplica a un rubro no presentado (reglamento). |
| Tipo de rubro (`rubric_type`) | Referencia (`NOMINATIVE`, `RANDOM`, `GENERAL`, `CALCULATED`, `SPECIAL`) | **Adaptado**: la columna existe, catálogo pendiente (D24) | La columna cambió de nombre y de catálogo (053, 066, 081). El reglamento distingue rubros fijos, nominativos y aleatorios. |
| Tipo de noche (`COMPETITION` / `AWARDS`) | Referencia (`night.kind`) | **Propuesta** (`COMPETENCIA` / `PREMIACION`) | `AGENTS.md` habla de «noche competitiva». Falta confirmar. |
| Nominaciones (`troupe_nomination`) | Referencia | **Mapeado** a la fila de planilla (`objetivo_rubro`) | El reglamento da hasta cuatro nominados por rubro aleatorio (cargo 33). |
| Versionado del reglamento | No existe en la referencia | **Se mantiene** (`version_reglamento`) | Es lo que el proyecto necesita. |
| Congelación al abrir el evento | Referencia (014, 017) | **Descartado** (opción B, §6) | La congelación ocurre al abrir la primera noche, como dice `AGENTS.md`. |
| Logo en la fila (`bytea`) | Referencia (`event_troupe.logo_data`) | **Descartado** | `database-design.md`: los binarios van en almacenamiento de archivos. |
| Columnas en inglés; migraciones `001_...` | Referencia | **Descartado** | Convenciones del proyecto. |
| Sobre cerrado, voto secreto y firma con aclaración | Reglamento (procedimiento de puntuación) | **Fuera de este alcance** | Pertenece al flujo de planilla y evidencia. |

## 3. Supuestos

- **A1.** **Confirmado.** Una edición tiene a lo sumo una versión activa (`PUBLICADA` o `CONGELADA`) y a lo sumo un borrador a la vez. Cada edición tiene su propia versión, así que dos ediciones distintas no se cruzan. Si alguna vez una misma competencia necesita dos reglas vigentes, este supuesto habrá que revisarlo.
- **A2.** **Confirmado (opción B).** La versión y el padrón se congelan al abrir la primera noche. Abrir una noche exige una versión publicada.
- **A3.** **Confirmado.** Comparsa y participante pertenecen a una sola edición.
- **A4.** **Confirmado** (referencia 013 y `AGENTS.md`). La membresía y el orden se definen por noche.
- **A5.** **Confirmado.** La condición «no evaluable» se marca por fila de planilla (`objetivo_rubro.evaluable`), no por rubro. Un mismo rubro puede estar activo para un sujeto y en gris para otro. La solista femenina en gris es el caso de referencia.
- **A6.** **Confirmado.** Tipos de sujeto evaluable (diez, de la lista de cargos del reglamento de Goya, puntos 1 a 32): `PERSONA`, `PAREJA` (dos personas que se puntúan juntas: cordoneras, portabandera y maestro de sala, pareja de bailarines), `GRUPO` (comisión de frente, grupo de pasistas), `TRAJE` (el traje, no la persona), `CARRO`, `CARROZA_REINA`, `BATERIA`, `BANDA_MUSICAL`, `TEMA_INEDITO` y `COMPARSA`. Esto reemplaza la lista anterior de ocho. `PAREJA` y `TRAJE` se agregan.
- **A7.** **Confirmado.** Dos personas que se puntúan juntas (cordoneras, pareja de bailarines, portabandera y maestro de sala) son `PAREJA`. Tres o más personas (comisión de frente, grupos de pasistas, comisión de fondo) son `GRUPO`.
- **A8.** La edición se abre por acción explícita y auditada, no al abrir la primera noche.
- **A9.** **Confirmado.** El año es único por edición. No puede haber dos ediciones con el mismo año. Si alguna vez hubiera dos competencias en un mismo año, habría que revisarlo.
- **A10.** **Confirmado (reformulado).** Cada comparsa tiene una categoría: `PRIMERA` (compite por el resultado general) o `AGRUPACION` (solo compite en aleatorios). No hay categoría infantil de comparsa: lo infantil es atributo de la persona menor de edad y del rubro (`suma_a_comparsa = false`). La definición de edad queda pendiente (A14).
- **A14.** **Resuelto.** La edad la verifica cada comparsa, no el sistema. El sistema solo registra la declaración de que una persona es menor (`es_menor`), sin calcular ni validar la edad. El reglamento de Goya (5 a 11) y el proyecto 2027 (4 a 11) quedan fuera de esta base de datos.
- **A11.** *(Eliminado en v3: no hay jerarquía de ítems.)*
- **A12.** **Confirmado.** Claves primarias `uuid` en las tablas del dominio, como `Carnavales2027`. Las referencias a `usuario(id)` siguen en `text`, porque así están en nuestras migraciones.
- **A13.** **Verificado en imagen** (proyecto 2027, sección VI.B, p. 9 y 14). Un rubro aleatorio admite hasta TRES (3) nominados. Goya decía cuatro; por alcance se usa el proyecto. La «mejor pareja de baile» admite hasta 3 parejas por comparsa.

## 4. Hallazgos

- **H1. Padrón sin congelación definida.** El event design dice que la configuración publicada no debe alterar planillas creadas. Comparsas, participantes, sujetos, orden y filas de planilla pueden cambiar después de publicar. **Resuelto por la opción B** (§6): el padrón se congela al abrir la primera noche.
- **H2. Pasadas.** Resuelto: el orden del desfile es `orden_presentacion` por noche. `database-design.md` ya fue corregido.
- **H3. Enmiendas.** Su efecto sobre votos emitidos no está definido (D19). **Pendiente.**
- **H4. Catálogo de algoritmos.** Depende de D24. **Pendiente.** Bloquea `regla_calculo_version`.
- **H5. Cierre de noche.** Pendiente de D10.
- **H6. Especialidades 2027.** La planilla modelo es 2026. La lista J1, J2, J3 no es normativa para 2027. **Pendiente.**
- **H7. Conflicto entre documentos.** `database-design.md` (líneas 57-58) define comparsa y participante como «identidad estable». Resuelto a favor de A3. **Corregido en `database-design.md`.**
- **H8. Participantes por noche.** No definido. **Pendiente.**
- **H9. Tipo de rubro (resuelto).** El catálogo es `NOMINATIVO` y `ALEATORIO`. `Carnavales2027` no tiene tipo fijo (migraciones 066 y 081). Los fijos del proyecto 2027 son requisitos de presentación (§5.15b). Quedan sin mapear `GENERAL`, `CALCULATED` y `SPECIAL` de `Carnavales2027`, que no se importan hasta saber qué significan.
- **H10. Ítems: no se usan.** Goya y la planilla modelo califican por rubro y fila, sin ítems. El concepto de ítem por jurado del proyecto 2027 pertenece al procedimiento general de jurados, que se toma de Goya. Los sub-criterios del carro se modelan como rubros de la planilla. **Resuelto por alcance.** Queda una revisión: la planilla pone «Impacto visual» en J1 y en J3.
- **H11. Momento de nominar rubros aleatorios (resuelto).** Las nominaciones aleatorias se cargan en el padrón, antes de abrir la primera noche, y quedan congeladas con él (opción B). Antes de congelar se pueden cambiar; después, solo con cambio auditado. El máximo de nominados se cuenta por evento (H11b, confirmado).
- **H12. Consolidación de premios individuales.** El reglamento suma los puntajes de cada jurado durante las noches puntuables y gana el mayor puntaje. Eso excede este diseño, pero se relaciona con D6. **Pendiente.**
- **H13. Escala.** Se usa 1 a 5 de Goya, confirmada en D22. Fuera del alcance de nominativos y aleatorios, el proyecto 2027 dice 1 a 10; no se toma.
- **H14. Equidad.** Se usa la regla de Goya: si un jurado no puntúa un rubro, se elimina el puntaje de las demás comparsas en ese rubro (hallazgos de `decision-questions.md`). Confirmar, porque el proyecto 2027 asigna 5 en ese caso. Fuera del alcance acordado.
- **H15. Carros en nominativos.** Por alcance se usa el proyecto 2027: cuenta un solo carro por comparsa, el de mejor puntaje. Goya contaba dos. Confirmar que esa lectura es la que se quiere.
- **H16. Qué entra a la puntuación total de comparsa.** El proyecto 2027 suma los puntos válidos de los rubros fijos y, de los nominativos, solo el mejor nominado por comparsa y rubro. Los rubros aleatorios no entran a la competencia de comparsas. El texto del PDF es un escaneo y el OCR tiene errores en esa sección; hay que verificar la redacción en imagen antes de fijar la fórmula. **Pendiente** (bloquea `regla_calculo_version`, H4).

### 4.1 Cómo se puntúan nominativos y aleatorios

Fuente: `Reglamento_Carnaval.pdf` (proyecto 2027), secciones VI.A, VI.B, VII y VIII. Verificado en imagen en p. 9, 14 y 15. Lo demás del reglamento viene de Goya.

| Aspecto | Nominativo | Aleatorio |
|---|---|---|
| Quién compite | Solo comparsas de 1.ª categoría | Comparsas de 1.ª categoría y agrupaciones |
| Quién se nomina | Los sujetos que la comparsa presenta en el rubro (bailarines o grupos; carro) | Hasta 3 personas por rubro (A13). Mejor pareja de baile: hasta 3 parejas por comparsa |
| Cómo se puntúa | Suma de las notas de cada jurado en todas las noches puntuables (por alcance: proyecto; escala de Goya) | Igual |
| Qué entra a la comparsa ganadora | Solo el mejor sujeto de cada comparsa en cada rubro. En carros, solo el de mejor puntaje | No entra |
| Ganador del rubro | El de mayor puntaje del rubro | El de mayor puntaje del rubro |

**Cálculo de la comparsa** (sección VII): la comparsa ganadora se define sumando los rubros nominativos. Solo cuentan los sujetos de mayor puntaje de cada comparsa en cada rubro. El texto del escaneo dice «puntos válidos… en todos los rubros fijos», y la frase es ambigua respecto a qué se suma; pendiente de verificar (H16).

**Desempate** (sección VIII, solo para la comparsa ganadora): mayor cantidad de rubros nominativos ganados; si persiste, quién ganó el rubro «Mejor batería»; si persiste, sorteo.

Cuántos aleatorios y nominativos hay, y en qué noche se nominan, sigue pendiente (H11).

### 4.2 Qué cambia cuando cambia el reglamento

Cada reglamento nuevo es una **versión nueva** del mismo agregado; nunca se edita la anterior.

| Tipo de cambio | Dónde se resuelve | Requiere desarrollo |
|---|---|---|
| Rubros, tipo de rubro, nominados máximos, premios, objetivos | Datos de la versión (`rubro_version`, `premio_version`, `objetivo_rubro`) | No |
| Escala min/max de un rubro | `escala_puntaje_version` | No |
| Carros computables, modo de equidad, valor de equidad | `regla_calculo_version.parametros` | No, si la opción existe en el catálogo |
| Una fórmula o modo de cálculo nuevo | Nuevo código en `algoritmo_calculo` | Sí: código, migración y tests |
| Un tipo de rubro nuevo | Catálogo de tipos (H9) | Sí, si el tipo implica lógica nueva |

**Procedimiento:**

1. Copiar la versión vigente como borrador (`copiada_de_id`).
2. Editar el borrador: rubros, reglas y escalas.
3. Publicar. La versión anterior queda `SUPERSEDIDA` (A1).
4. La versión se congela al abrir la primera noche (§6).

Los votos, puntajes y resultados ya emitidos siguen apuntando a la versión que los originó. Un reglamento nuevo no los reescribe.

**Cambio después de congelar:** no se edita la versión congelada. Un cambio posterior se registra como enmienda (`enmienda_reglamento`, H3), y su efecto sobre votos ya emitidos queda pendiente de definir.

## 5. Modelo físico

Todas las tablas usan `uuid` como PK salvo indicación contraria, y todas llevan `edicion_id`.

### 5.1 `edicion`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `nombre` | text | NOT NULL |
| `anio` | integer | NOT NULL, `> 0`, UNIQUE (A9) |
| `estado` | text | NOT NULL, `CHECK (estado IN ('CONFIGURING','OPEN'))` |
| `creada_por` | text | NOT NULL, FK `usuario(id)` RESTRICT |
| `creada_en` | timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP |
| `abierta_por` | text | NULL, FK `usuario(id)` RESTRICT |
| `abierta_en` | timestamptz | NULL. `CHECK ((estado = 'OPEN') = (abierta_en IS NOT NULL))` |

Se usa `CONFIGURING` (no `DRAFT`) para la edición, como la referencia, porque `DRAFT` queda para las noches.

### 5.2 `version_reglamento`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `edicion_id` | uuid | NOT NULL, FK `edicion(id)` RESTRICT |
| `numero` | integer | NOT NULL, `> 0`, UNIQUE (`edicion_id`, `numero`) |
| `estado` | text | NOT NULL, `CHECK (estado IN ('BORRADOR','PUBLICADA','CONGELADA','SUPERSEDIDA'))` |
| `fuente` | text | NOT NULL. Referencia del reglamento (D1) |
| `copiada_de_id` | uuid | NULL, FK `version_reglamento(id)` RESTRICT |
| `creada_por`, `creada_en` | text, timestamptz | NOT NULL |
| `publicada_por`, `publicada_en` | text, timestamptz | NOT NULL si `estado <> 'BORRADOR'` |
| `congelada_en` | timestamptz | NOT NULL si `estado = 'CONGELADA'` |

**Índices únicos parciales:** `(edicion_id) WHERE estado = 'BORRADOR'` y `(edicion_id) WHERE estado IN ('PUBLICADA','CONGELADA')`. Para publicar una versión nueva, la transacción marca primero como `SUPERSEDIDA` a la anterior.

**Transiciones (trigger):** `BORRADOR → PUBLICADA`, `PUBLICADA → SUPERSEDIDA`, `PUBLICADA → CONGELADA`. Desde `CONGELADA` o `SUPERSEDIDA` no se sale. Un borrador puede eliminarse si no tiene dependencias.

### 5.3 `noche`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `edicion_id` | uuid | NOT NULL, FK `edicion(id)` RESTRICT |
| `orden` | integer | NOT NULL, `> 0`, UNIQUE (`edicion_id`, `orden`) |
| `nombre` | text | NOT NULL |
| `fecha` | date | NULL |
| `tipo` | text | NOT NULL, `CHECK (tipo IN ('COMPETENCIA','PREMIACION'))` (propuesta) |
| `cuenta_para_puntaje` | boolean | NOT NULL, DEFAULT true. Para 2027, tres de cuatro (D3, D13) |
| `estado` | text | NOT NULL, `CHECK (estado IN ('DRAFT','OPEN','CLOSED'))` |
| `abierta_en`, `cerrada_en` | timestamptz | NULL. `cerrada_en` se completa al cierre de la noche (D10) |

**Reglas:**

- Se puede crear en `CONFIGURING` o en `OPEN` (como `DRAFT`).
- `DRAFT → OPEN` solo por el servicio de apertura, y exige versión `PUBLICADA`, que pasa a `CONGELADA` (§6).
- `OPEN → DRAFT` queda prohibido. `CLOSED` es terminal.
- **Cierre de noche (D10, confirmado):** lo hacen el fiscal y el escribano, juntos. Exige que todas las planillas esperadas de la noche estén recibidas por el servidor (D11). El cierre de una comparsa no es una acción separada: se deriva del cierre de la noche. Cerrar la votación completa del evento exige que todas las noches estén `CLOSED`.
- Con la noche `OPEN`, no cambian `tipo` ni `cuenta_para_puntaje` (propuesta).

### 5.5 `comparsa`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `edicion_id` | uuid | NOT NULL, FK `edicion(id)` RESTRICT |
| `categoria` | text | NOT NULL, `CHECK (categoria IN ('PRIMERA','AGRUPACION'))` (A10) |
| `nombre` | text | NOT NULL |
| `activa` | boolean | NOT NULL, DEFAULT true |
| `creada_en` | timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP |

**Trigger:** una comparsa inactiva (`activa = false`) no entra en el padrón, el orden de presentación ni las pasadas, y una comparsa con padrón cargado no se desactiva (adoptado de 009; implementado en la migración 0006).

### 5.6 `participante`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `edicion_id` | uuid | NOT NULL, FK `edicion(id)` RESTRICT |
| `nombre_completo` | text | NOT NULL |
| `es_menor` | boolean | NOT NULL, DEFAULT false. Declaración de la comparsa; el sistema no valida la edad (A14) |
| `activo` | boolean | NOT NULL, DEFAULT true |

No se guardan documentos ni datos personales adicionales hasta definir retención (D21).

### 5.7 `especialidad`

Adoptado de `event_specialty`. Ejemplo del modelo 2026: «Vestuario» (J1), «Puesta en escena y coreografía» (J2) y «Batería» (J3).

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `edicion_id` | uuid | NOT NULL, FK `edicion(id)` RESTRICT |
| `nombre` | text | NOT NULL |
| `codigo` | text | NOT NULL, UNIQUE (`edicion_id`, `codigo`) |
| `orden` | integer | NOT NULL, `> 0` |
| `activa` | boolean | NOT NULL, DEFAULT true |

### 5.8 `orden_presentacion`

Adoptado de `night_troupe_schedule`, renombrado. Es la membresía y el orden de cada comparsa en una noche (A4).

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `edicion_id` | uuid | NOT NULL |
| `noche_id` | uuid | NOT NULL. FK compuesta (`noche_id`, `edicion_id`) → `noche` |
| `comparsa_id` | uuid | NOT NULL. FK compuesta (`comparsa_id`, `edicion_id`) → `comparsa` |
| `orden_presentacion` | integer | NOT NULL, `> 0` |
| `estado` | text | NOT NULL, `CHECK (estado IN ('SCHEDULED','CANCELLED'))`, DEFAULT `'SCHEDULED'` |
| `programado_en` | timestamptz | NULL. Hora prevista de ingreso (penalidades, D14) |

- UNIQUE (`noche_id`, `comparsa_id`) y UNIQUE (`noche_id`, `orden_presentacion`).
- **Trigger:** solo modificable con la noche en `DRAFT` (propuesta).

### 5.9 `sujeto_evaluable`

Nuevo en v3. Es quien o qué recibe la puntuación: una persona, un carro, una batería, una banda, un tema o un grupo. La planilla lo muestra en la columna «INTEGRANTE» (A) y en las columnas de nombre.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `edicion_id` | uuid | NOT NULL |
| `comparsa_id` | uuid | NOT NULL. FK compuesta (`comparsa_id`, `edicion_id`) → `comparsa` |
| `tipo_sujeto` | text | NOT NULL, `CHECK (tipo_sujeto IN ('PERSONA','PAREJA','GRUPO','TRAJE','CARRO','CARROZA_REINA','BATERIA','BANDA_MUSICAL','TEMA_INEDITO','COMPARSA'))` (A6) |
| `participante_id` | uuid | NULL. FK compuesta (`participante_id`, `edicion_id`) → `participante` |
| `nombre` | text | NULL |
| `activo` | boolean | NOT NULL, DEFAULT true |

**Reglas:**

- `CHECK`: si `tipo_sujeto = 'PERSONA'`, `participante_id` no es NULL y `nombre` puede ser NULL. En cualquier otro caso, `nombre` no es NULL y `participante_id` es NULL.
- UNIQUE parcial (`edicion_id`, `comparsa_id`, `participante_id`) para participantes: una identidad por comparsa dentro de la edición; las apariciones repetidas se guardan en `pasada`.
- Una persona puede ser sujeto de varias filas de planilla.
- Dos personas que se puntúan juntas son `PAREJA`; tres o más son `GRUPO` (A7).

### 5.10 `pasada`

Una aparición de un sujeto evaluable dentro del orden de su comparsa en una noche. `orden_presentacion` (§5.8) conserva el orden de las comparsas; `pasada` ordena las entradas dentro de cada comparsa. Un participante que aparece más de una vez reutiliza el mismo sujeto e identidad.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `edicion_id` | uuid | NOT NULL |
| `orden_presentacion_id` | uuid | NOT NULL. FK compuesta (`orden_presentacion_id`, `edicion_id`, `comparsa_id`) → `orden_presentacion` |
| `comparsa_id` | uuid | NOT NULL; debe coincidir con la comparsa del orden y del sujeto evaluable |
| `sujeto_id` | uuid | NOT NULL. FK compuesta (`sujeto_id`, `edicion_id`, `comparsa_id`) → `sujeto_evaluable` |
| `orden` | integer | NOT NULL, `> 0`; posición dentro de la comparsa |

- UNIQUE (`orden_presentacion_id`, `orden`); el mismo sujeto puede tener varias pasadas con órdenes distintos.
- La identidad de una persona se registra una vez por edición y comparsa; sus pasadas referencian el mismo sujeto evaluable.
- **Trigger:** las pasadas solo se modifican mientras la noche está en `DRAFT`; el bloqueo de la noche serializa la edición con su apertura.
- Esta tabla no define si cada pasada recibe un puntaje independiente ni cómo se consolida (D6).

### 5.11 `rubro_version`

Corresponde a las filas de la columna «RUBRO» (B) de la planilla y al «rubro a puntuar» del reglamento.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `version_id` | uuid | NOT NULL. FK compuesta (`version_id`, `edicion_id`) → `version_reglamento` |
| `edicion_id` | uuid | NOT NULL |
| `codigo` | text | NOT NULL, UNIQUE (`version_id`, `codigo`) |
| `nombre` | text | NOT NULL |
| `tipo_sujeto` | text | NOT NULL. Mismo catálogo que `sujeto_evaluable.tipo_sujeto`. Un rubro aplica a un solo tipo |
| `suma_a_comparsa` | boolean | NOT NULL, DEFAULT true. `false` para rubros infantiles: solo premio individual, no suma al resultado de la comparsa (A10) |
| `tipo_rubro` | text | NULL, `CHECK (tipo_rubro IN ('NOMINATIVO','ALEATORIO'))` (H9). Los fijos son requisitos de presentación, ver §5.15b |
| `nominados_maximos` | integer | NULL, `> 0`. Máximo de nominados del rubro en toda la edición (H11b). Aleatorios: 3 (proyecto 2027) o 4 (Goya 2026), según A13. NULL si no aplica |
| `nominados_maximos_por_comparsa` | integer | NULL, `> 0`. Límite por comparsa, solo si el reglamento lo fija (ej.: «Mejor pareja de baile», hasta 3 parejas por comparsa) |
| `permite_no_presentado` | boolean | NOT NULL, DEFAULT true. Cuando el rubro no se presenta, la nota es `0` |
| `orden` | integer | NOT NULL, `> 0` |

**Trigger:** insertar, modificar o eliminar solo si la versión está en `BORRADOR`.

### 5.12 `escala_puntaje_version`

| Columna | Tipo | Reglas |
|---|---|---|
| `rubro_version_id` | uuid | PK, FK compuesta (`rubro_version_id`, `edicion_id`) → `rubro_version` (1:1) |
| `edicion_id` | uuid | NOT NULL |
| `minimo` | integer | NOT NULL, `CHECK (minimo >= 1)` |
| `maximo` | integer | NOT NULL, `CHECK (maximo >= minimo)`. El reglamento habla de máximo y mínimo por rubro; 2027 usa 1 a 5 (D22) |

**Trigger:** solo borrador.

### 5.12b `rubro_especialidad`

Qué especialidades evalúan cada rubro. Es la configuración que usa el generador de planillas (`flujo-creacion-evento.md`, paso 5). Ejemplo: «Impacto visual» del carro, evaluado por J1 y J3.

| Columna | Tipo | Reglas |
|---|---|---|
| `rubro_version_id` | uuid | NOT NULL. FK compuesta (`rubro_version_id`, `edicion_id`) → `rubro_version` |
| `especialidad_id` | uuid | NOT NULL. FK compuesta (`especialidad_id`, `edicion_id`) → `especialidad` |
| `edicion_id` | uuid | NOT NULL |

- PK (`rubro_version_id`, `especialidad_id`).
- Al publicar, todo rubro tiene al menos una especialidad (validación de publicación).
- **Trigger:** solo borrador.

### 5.13 `objetivo_rubro` (fila de planilla)

Cada fila de la planilla: un sujeto, un rubro y una especialidad. El mismo sujeto y rubro pueden aparecer en dos especialidades (sección 0).

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `edicion_id` | uuid | NOT NULL |
| `rubro_version_id` | uuid | NOT NULL. FK compuesta (`rubro_version_id`, `edicion_id`) → `rubro_version` |
| `sujeto_id` | uuid | NOT NULL. FK compuesta (`sujeto_id`, `edicion_id`) → `sujeto_evaluable` |
| `especialidad_id` | uuid | NOT NULL. FK compuesta (`rubro_version_id`, `especialidad_id`) → `rubro_especialidad`: solo especialidades configuradas para el rubro |
| `origen` | text | NOT NULL, `CHECK (origen IN ('GENERADA','MANUAL'))`. `MANUAL` = creada por el administrador (por ejemplo, un nominado en aleatorio) |
| `excluida` | boolean | NOT NULL, DEFAULT false. `true` = el administrador la quitó. Se conserva para que la regeneración no la vuelva a crear |
| `evaluable` | boolean | NOT NULL, DEFAULT true. `false` = fila gris, no compite (sin puntaje, no cuenta como faltante, no entra al cálculo) |
| `orden` | integer | NOT NULL, `> 0` |

- UNIQUE (`rubro_version_id`, `sujeto_id`, `especialidad_id`).
- Una fila con `excluida = true` no aparece en la planilla ni cuenta como faltante.
- **Triggers:**
  - El padrón no está congelado (no hay noche abierta). Las nominaciones se editan aunque la versión ya esté `PUBLICADA` (H11). Así lo implementa la migración 0006.
  - `sujeto_evaluable.tipo_sujeto` coincide con `rubro_version.tipo_sujeto`.
  - Los nominados (filas no excluidas) de un rubro no superan `nominados_maximos` en toda la edición, ni `nominados_maximos_por_comparsa` por comparsa cuando ese valor existe (H11b, confirmado).

**Regeneración** (servicio, no trigger):

- Para rubros `NOMINATIVO`: inserta como `GENERADA` cada combinación rubro × sujeto del tipo × especialidad del rubro que no exista. No modifica filas existentes, sean generadas, manuales, excluidas o grises.
- Para rubros `ALEATORIO`: no genera filas; el administrador nomina (filas `MANUAL`).
- Si una fila existente dejó de corresponder (el rubro ya no tiene esa especialidad, o el sujeto se desactivó), se informa como desactualizada y el administrador confirma su eliminación. Nunca se borra en silencio.

### 5.14 `regla_calculo_version`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `edicion_id` | uuid | NOT NULL |
| `version_id` | uuid | NOT NULL. FK compuesta (`version_id`, `edicion_id`) → `version_reglamento` |
| `ambito` | text | NOT NULL, `CHECK (ambito IN ('COMPARSA_GENERAL','RUBRO_NOMINATIVO','RUBRO_ALEATORIO','EQUIDAD'))` (propuesta; el desempate se agrega si se confirma) |
| `algoritmo` | text | NOT NULL. FK compuesta a `algoritmo_calculo(codigo)`. Solo puede elegirse un código del catálogo |
| `parametros` | jsonb | NOT NULL, DEFAULT `'{}'`. La API valida el contenido contra el esquema del `algoritmo` elegido |

UNIQUE (`version_id`, `ambito`).

**Catálogo `algoritmo_calculo`** (sembrado por migración; el administrador no lo edita):

| Código | Qué calcula | Parámetros admitidos |
|---|---|---|
| `SUMA_FIJOS` | Suma de puntos de rubros fijos | Ninguno |
| `MEJOR_POR_COMPARSA` | Para cada rubro nominativo, solo el mejor nominado de la comparsa | `carros_computables`: 1 o 2 (H15) |
| `SUMA_JURADOS_NOCHES` | Suma de notas de todos los jurados en las noches puntuables | Ninguno |
| `EQUIDAD_QUITAR` | Si un jurado no puntúa un rubro, quita ese puntaje a las demás comparsas | Ninguno |
| `EQUIDAD_VALOR` | Si un jurado no puntúa, asigna un valor fijo | `valor`: entero dentro de la escala del rubro (H14) |

**Regla:** los parámetros cambian entre versiones; los códigos del catálogo cambian solo con desarrollo y migración. Si un reglamento pide una fórmula que no está en el catálogo, no se puede cargar como dato: hay que agregar el código (H4 y R3).

`jsonb` se valida con un esquema por código de algoritmo. Si D24 se cierra con parámetros fijos, pueden pasar a columnas.

### 5.15 `premio_version`

Corresponde a los «cargos a puntuar» del reglamento, que son los premios. No son ítems.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `edicion_id` | uuid | NOT NULL |
| `version_id` | uuid | NOT NULL. FK compuesta (`version_id`, `edicion_id`) → `version_reglamento` |
| `nombre` | text | NOT NULL, UNIQUE (`version_id`, `nombre`) |
| `modalidad` | text | NOT NULL, `CHECK (modalidad IN ('INDIVIDUAL','GRUPAL'))` |
| `orden` | integer | NOT NULL, `> 0` |

La relación premio ↔ rubro depende de H10 y de la sección 0. **Trigger:** solo borrador.

### 5.15b `requisito_version` (requisitos de presentación, antes «fijos»)

Lo que la comparsa debe presentar en la noche (proyecto 2027, sección E). No es un rubro puntuable, salvo que se confirme R4b.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. UNIQUE (`id`, `edicion_id`) |
| `edicion_id` | uuid | NOT NULL |
| `version_id` | uuid | NOT NULL. FK compuesta (`version_id`, `edicion_id`) → `version_reglamento` |
| `codigo` | text | NOT NULL, UNIQUE (`version_id`, `codigo`) |
| `nombre` | text | NOT NULL. Ej.: «Reina de Comparsa», «Cinco grupos de pasistas» |
| `cantidad_minima` | integer | NOT NULL, `> 0` |
| `puede_puntuar` | boolean | NOT NULL, DEFAULT false (R4b). Si `true`, el requisito puede generar filas de planilla |
| `orden` | integer | NOT NULL, `> 0` |

**Trigger:** solo borrador. Su cumplimiento por comparsa (cuántos presentó) queda para el diseño de inscripción, fuera de este alcance.

### 5.16 `enmienda_reglamento`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `edicion_id` | uuid | NOT NULL, FK `edicion(id)` RESTRICT |
| `version_id` | uuid | NOT NULL. FK compuesta (`version_id`, `edicion_id`) → `version_reglamento` |
| `contenido` | text | NOT NULL |
| `motivo` | text | NOT NULL |
| `responsable_id` | text | NOT NULL, FK `usuario(id)` RESTRICT |
| `creada_en` | timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP |

**Trigger:** solo registro. `UPDATE` y `DELETE` prohibidos. Su efecto es H3.

### 5.17 `operacion_apertura`

Adoptado de `event_open_operation_claim` y `event_open_operation_receipt` (085). Da idempotencia a la apertura de edición o noche.

**Estado:** reservada. La tabla existe en la migración 0006, pero todavía no hay servicio de apertura ni función que la escriba. Hasta implementarlo, repetir una apertura con la misma clave no tiene efecto garantizado.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK |
| `edicion_id` | uuid | NOT NULL, FK `edicion(id)` RESTRICT |
| `noche_id` | uuid | NULL. FK compuesta (`noche_id`, `edicion_id`) → `noche` |
| `clave_operacion` | text | NOT NULL, UNIQUE. Clave estable enviada por el cliente |
| `resultado` | text | NULL. Se completa al terminar |
| `solicitada_por` | text | NOT NULL, FK `usuario(id)` RESTRICT |
| `solicitada_en` | timestamptz | NOT NULL, DEFAULT CURRENT_TIMESTAMP |

El detalle fino queda para el diseño de auditoría común (fuera de alcance).

## 6. Congelación (decidida: opción B)

**Decisión:** el reglamento y el padrón se congelan al abrir la **primera noche**. Así lo dice el texto de `AGENTS.md` («al abrir la jornada»). Abrir la edición no congela nada.

- Mientras la edición está `OPEN` y ninguna noche se abrió, el padrón (comparsas, participantes, sujetos, orden de presentación y filas de planilla) puede ajustarse.
- Al abrir la primera noche, quedan congelados el reglamento vigente y el padrón. Esto resuelve H1.
- Las noches siguientes se abren sin cambiar lo congelado.

| Acción | Efecto |
|---|---|
| Editar padrón (comparsas, participantes, sujetos, orden de presentación) | Permitido hasta abrir la primera noche |
| Editar reglamento (rubros, escalas, reglas, premios, filas de planilla) | Solo versión en `BORRADOR` |
| Publicar versión | Antes de abrir la primera noche |
| Abrir edición | No congela nada |
| Abrir primera noche | Exige versión `PUBLICADA`; la pasa a `CONGELADA` y congela el padrón |
| Crear noche | Permitido en `CONFIGURING` u `OPEN` (queda `DRAFT`) |

**Costo aceptado:** hay dos fronteras (edición y primera noche) y una ventana en la que el padrón todavía cambia.

## 7. Índices

Postgres no crea índices para las FK. Se agregan explícitamente:

- `version_reglamento(edicion_id)`: cubierto por los únicos parciales.
- `noche(edicion_id)`: cubierto por UNIQUE (`edicion_id`, `orden`).
- `comparsa(edicion_id)`, `participante(edicion_id)`, `especialidad(edicion_id)`, `sujeto_evaluable(edicion_id)`.
- `orden_presentacion(comparsa_id)`.
- `sujeto_evaluable(comparsa_id)`, `sujeto_evaluable(participante_id)`.
- `pasada(sujeto_id)`.
- `rubro_version(version_id)`: cubierto por el UNIQUE de `codigo`.
- `objetivo_rubro(sujeto_id)`, `objetivo_rubro(especialidad_id)`.
- `rubro_especialidad(especialidad_id)`.

## 8. Orden de creación para `0006` (cuando se apruebe)

1. `edicion`
2. `version_reglamento`
3. `especialidad`, `participante`
4. `comparsa`
5. `noche`
6. `orden_presentacion`
7. `sujeto_evaluable`
8. `pasada`
9. `rubro_version`, `escala_puntaje_version`, `regla_calculo_version`, `premio_version`
10. `rubro_especialidad`, luego `objetivo_rubro`
11. `enmienda_reglamento`, `operacion_apertura`
12. Funciones y triggers, que dependen de las tablas anteriores.

## 9. Pruebas previstas

Se escriben antes que la migración, con base PostgreSQL descartable (`TEST_DATABASE_URL`):

- Un único borrador y una única versión activa por edición.
- Transiciones válidas e inválidas de versión, noche y edición.
- Congelación al abrir la primera noche (§6).
- Abrir una noche sin versión publicada falla; con versión publicada la congela (opción B).
- Apertura por fuera del servicio falla (adoptado de 018).
- `sujeto_evaluable`: un `PERSONA` sin `participante_id` falla; un `CARRO` sin `nombre` falla.
- FK compuestas: no se puede asociar una comparsa de otra edición a una noche.
- `objetivo_rubro`: un sujeto de tipo distinto al del rubro falla; el mismo sujeto y rubro en dos especialidades se permite.
- `objetivo_rubro`: una especialidad no configurada en `rubro_especialidad` falla.
- Regeneración: no recrea filas excluidas ni modifica filas manuales o grises; no genera filas para rubros aleatorios.
- `objetivo_rubro`: fila gris (`evaluable = false`) no admite puntaje (tabla de puntajes, fuera de alcance).
- `orden_presentacion`: solo modificable con la noche en `DRAFT`.
- `pasada`: un participante puede tener dos entradas en la misma comparsa/noche, con identidad compartida y orden distinto; no se puede modificar durante la apertura concurrente.
- `enmienda_reglamento` no admite `UPDATE` ni `DELETE`.
- Operación de apertura repetida con la misma `clave_operacion` no duplica efectos.
- Un borrador sin dependencias puede eliminarse; uno con dependencias no.

## 10. Decisiones que bloquean `0006`

1. **Feature diferido (R1 a R11):** las reglas de nominativos y aleatorios quedan en `feat-reglamento-2027-pendiente.md` hasta tener el reglamento 2027 actualizado. Bloquea solo `regla_calculo_version` y el catálogo de `tipo_rubro`.
2. ~~Elegir la opción de congelación~~ **Resuelto: opción B** (§6).
3. Ya están confirmados todos los supuestos: A1 a A14 (A14 resuelto: la edad la verifica la comparsa).
4. Resolver H4 (algoritmos de cálculo) y D24. Confirmar si los requisitos fijos puntúan (R4b, `puede_puntuar`).
5. ~~Resolver H5 (cierre de noche, D10)~~ **Hecho** (§5.3). ~~H8~~ **Hecho** (por la programación). ~~H11~~ **Hecho** (nominaciones en el padrón). **H11b confirmado:** el máximo de nominados es por evento; la pareja de baile tiene límite por comparsa.
6. ~~Corregir `database-design.md`~~ **Hecho:** comparsa y participante por edición, `sujeto_evaluable` y `pasada` en el modelo conceptual (H2, H7).
