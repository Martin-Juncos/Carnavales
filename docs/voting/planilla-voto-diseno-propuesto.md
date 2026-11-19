# Propuesta de diseño: planilla de jurado, recepción de votos y cierres

**Estado:** propuesta para aprobación. **No autoriza migraciones ni implementación.**
Este documento no cambia el estado de las decisiones en
`decision-questions.md`: las recomendaciones aquí marcadas como *propuestas*
deben ser aceptadas expresamente antes de ejecutarse. Lo ya confirmado en
`AGENTS.md`, en los specs de `.scratch/votacion-offline/` y
`.scratch/cierre-resultados/` y en las decisiones D4, D9, D11, D12, D15 y D23
se respeta sin reabrirlo.

## 1. Objetivo y límites

Diseñar el camino mínimo para que un Jurado complete y confirme una planilla
sin conexión, la API la reciba de forma idempotente, y el cierre de una noche
pueda comprobar que no faltan planillas oficialmente recibidas.

**Queda fuera de esta propuesta:** fórmulas de resultado (D24), desempates
(D16), impugnaciones (D17), votos tardíos (D18), penalizaciones (D14), actas y
documentos oficiales, PDF imprimible (D20), retención (D21) y correcciones
excepcionales (D12, aún sin procedimiento aprobado).

## 2. Base: implementado y reglas confirmadas (no se reinventa)

| Elemento | Tipo | Dónde | Uso en la propuesta |
|---|---|---|---|
| `asignacion_jurado` (jurado, noche, especialidad, `ACTIVA`/`REVOCADA`) | Implementado | migración 0007 | Identifica la planilla esperada (D4: una por jurado, especialidad y noche). |
| `noche.estado` `DRAFT`/`OPEN`/`CLOSED` | Implementado | migración 0007 | Ya soporta transiciones. **No agregar una tabla `cierre` es una propuesta**, no un hecho. |
| `auditoria` append-only, actor de la sesión | Implementado | migración 0007 | Registra recepción, rechazo y cierre sin puntajes ni secretos. |
| FK `RESTRICT`, evidencia no borrable | Implementado | migración 0007 | Los votos recibidos tampoco se borran ni se modifican. |
| `operationId` estable generado en cliente, nunca timestamps | Regla confirmada | `AGENTS.md` §4, §5 | Clave de idempotencia del envío de la planilla. |
| Escala `1..5`, `0` = «No se presentó» separado | Regla confirmada | `AGENTS.md` §2, D22 | Validación de cada puntaje. |
| Planilla incompleta no se confirma | Regla confirmada | D23 | Regla de completitud antes del alta local y antes de recibir. |
| Sin puntajes numéricos antes del cierre total | Regla confirmada | D15, specs | La API no entrega valores. **Entregar además conteos sería una ampliación propuesta.** |

**No existe todavía:** catálogo de comparsas/participantes/rubros/escalas/filas
de planilla, tablas de planilla recibida o puntaje, endpoints del Jurado y
operaciones de cierre. La migración `pendientes/evento-configuracion-completa.sql`
**no se ejecuta** (`pendientes/README.md:4`) y excluye explícitamente planillas y
votos. Por tanto, el primer paso técnico es resolver los conflictos de diseño y
versionar ese catálogo como una migración nueva; no restaurar el archivo pendiente
tal cual.

## 3. Modelo propuesto

### 3.1 Planilla esperada (derivada, no entidad persistida)

Se calcula por consulta, siguiendo `database-design.md`: combinación de
`asignacion_jurado` activa + `noche` + `especialidad` + versión de reglamento
congelada según la regla confirmada + filas evaluables de esa especialidad. No se
propone una tabla `planilla_esperada`; el conjunto se deriva. La instantánea y su
momento de congelación son la propuesta P1, no una decisión aprobada.

> **Propuesta P1 (requiere aprobación):** conservar la instantánea de planillas
> esperadas al abrir la noche (identificadores de asignación y versión), para que
> el cierre no dependa de cambios posteriores en el catálogo. Sin esta
> instantánea, una revocación después de la apertura podría alterar retrospectivamente
> qué cuenta como «faltante». Esto no crea una planilla nueva: solo fija el conjunto
> derivado.

### 3.2 Recepción oficial

Tablas nuevas (nombres provisionales, `snake_case`):

- `planilla_recibida`: `id` UUID, `operation_id` UUID **UNIQUE**, `asignacion_id`
  FK `RESTRICT`, `edicion_id`, `noche_id`, `especialidad_id`, `version_id`,
  `hash_contenido`, `recibida_en` (servidor), `estado` (`RECIBIDA`/`CERRADA`,
  este último sujeto a D10), `actor_id` FK a `usuario`. UNIQUE (`asignacion_id`)
  para impedir una segunda planilla de la misma asignación.
- `puntaje_recibido`: `id` UUID, `planilla_id` FK `RESTRICT`, `fila_id`,
  `valor` (smallint), `no_presentado` boolean. UNIQUE (`planilla_id`, `fila_id`).
  Trigger que rechaza `UPDATE` y `DELETE`, igual que el de `asignacion_jurado`.
- `operacion_sincronizacion`: `operation_id` UUID PK, `hash_contenido`,
  `recibida_en`, `resultado` (`ACEPTADA`/`CONFLICTIVA`), para que un reintento
  con el mismo identificador devuelva el acuse original. El hash se calcula sobre
  una serialización canónica del contenido, no sobre los bytes de un archivo.

La auditoría registra `planilla_recibida`, `planilla_rechazada` y
`planilla_cerrada` en `auditoria`, sin copias de puntajes, tokens ni OTP.

### 3.3 Flujo de idempotencia

1. El cliente genera `operationId` (UUID) al confirmar localmente y lo conserva
   junto con la planilla bloqueada y el hash del contenido.
2. `POST /api/jurado/planillas` con `{ operationId, asignacionId, versionId,
   puntajes: [{ filaId, valor, noPresentado }] }`. La identidad sale de la sesión.
3. La API valida: sesión Jurado; asignación activa y de ese jurado; noche
   existente; versión congelada; comparsa/fila perteneciente a la noche;
   completitud; valores `1..5` o `0` con `noPresentado=true`.
4. Después, en transacción:
   - mismo `operationId` y mismo hash → devolver el acuse ya existente (sin
     insertar nada);
   - mismo `operationId` y hash distinto → `409 operacion_conflictiva`, sin
     modificar el voto original, con evento de auditoría de rechazo;
   - `operationId` nuevo pero la asignación ya tiene planilla recibida →
     `409 planilla_ya_recibida` (coherente con D12: no hay corrección ordinaria);
   - en cualquier otro caso, insertar planilla + puntajes + acuse + auditoría y devolver el
     acuse con `recibidaEn`.

Nunca se deduplica por timestamp. Nunca se sobrescribe un voto.

### 3.4 Estados visibles

- **Dispositivo:** `BORRADOR` → `CONFIRMADA_LOCALMENTE` (bloqueada) →
  `RECIBIDA` (cuando el acuse llega y persiste tras reinicio).
- **Servidor:** estados propuestos `RECIBIDA` / `CERRADA` (este último depende de
  D10). El servidor no conoce ni informa el estado local. Una confirmación local
  no equivale a recepción oficial y, en particular, **no satisface el cierre de
  noche** (D11 / `AGENTS.md` §5). D10 no define aún si el cierre de la planilla
  del Jurado depende de esa recepción; no se asume que sí.

Antes del cierre total, la API no entrega valores numéricos a ningún rol (D15).
La propuesta P2 prevé devolver **solo estados**; devolver además conteos sería
una ampliación que requiere aprobación. Los roles se resolverán con el catálogo
real: no se usa `FISCAL` como alias de `COMISARIO` (ver conflicto 4).

## 4. Recomendaciones para decisiones abiertas

Estas son **propuestas**, no decisiones aprobadas. Cada una debe confirmarse
antes de implementar la parte que depende de ella.

| ID | Recomendación | Por qué |
|---|---|---|
| D9 | Reintento automático con espera exponencial acotada durante la sesión, más un botón manual «Reintentar ahora». El `operationId` nunca cambia; ante `409` se detiene y se informa, sin reintentos ciegos. | Evita duplicados y hace reversible la pérdida de red sin inventar excepciones. |
| D9 (conflictos) | Conflicto = mismo `operationId` con contenido distinto o planilla ya recibida. Se bloquea la planilla local, se muestra el error y se requiere un procedimiento autorizado (hoy inexistente). | No se corrige ni se sobrescribe nada (D12). |
| D10 | Mantener etapas separadas, pero **no fijar actores ni condiciones**: D10 dice que el fiscal junto con el escribano hace «los demás cierres», mientras el spec de cierre-resultados asigna el cierre de la votación completa al Administrador. Requiere decisión. | No modificar una respuesta recibida ni inventar permisos (`AGENTS.md` §1, §6). |
| D10 (roles) | El catálogo implementado tiene `COMISARIO`, no `FISCAL`. **No crear un alias por inferencia**: hay que decidir si el cierre lo ejecuta `COMISARIO` o se incorpora `FISCAL` al catálogo. | `AGENTS.md` §6 prohíbe inventar roles. |
| D11 | El cierre de noche exige que todas las planillas esperadas estén `RECIBIDA`; si se aprueba P1, se consulta la instantánea. Una confirmación local no cuenta. No se propone excepción sin autoridad ni evidencia definida. | Es la regla confirmada; la excepción sigue pendiente. |
| D12 | Sin correcciones: ante un error, conservar la planilla original y, si se aprueba un procedimiento, registrarlo como un evento/apéndice nuevo que apunte a la original, nunca como `UPDATE`. | Mantiene inmutabilidad y trazabilidad. |

## 5. Conflictos de diseño que deben resolverse antes de la migración

El inventario de documentos muestra siete contradicciones. Esta propuesta solo
toma partido donde se indica expresamente; en todos los casos requiere aprobación:

1. **Ítems/subítems**: `AGENTS.md` §2 exige suma de subítems; el diseño físico
   descarta esa jerarquía. **Propuesta:** priorizar la regla confirmada y adaptar
   el diseño físico, no debilitarla.
2. **Evaluabilidad**: D7 dice «por rubro»; el diseño físico la define por fila.
   **Propuesta:** la fila hereda la condición del rubro; requiere confirmación.
3. **Escala**: 1–5 confirmada frente a la propuesta 1–10 de
   `feat-reglamento-2027-pendiente.md:26` (R5); no es una escala fijada por ninguna
   migración. El borrador debe corregirse antes de restaurarse.
4. **Rol Fiscal**: en `AGENTS.md` y specs frente a `COMISARIO` en la base. Requiere
   decisión expresa (ver D10).
5. **Nomenclatura**: `puntaje_planilla` frente a `objetivo_rubro`/fila de planilla.
   Unificar antes de escribir DDL.
6. **Actor del cierre final**: D10 y `database-design.md` describen al fiscal con
   el escribano para «los demás cierres», mientras el spec de cierre-resultados
   asigna el cierre de la votación completa al Administrador. Requiere decisión;
   la propuesta no elige actor.
7. **Congelación**: `AGENTS.md` §2 congela rubros y escalas al abrir la jornada,
   pero los diseños difieren sobre qué se congela y cuándo (P1). La instantánea de
   planillas esperadas es solo una propuesta.

## 6. Secuencia sugerida (cada paso con sus pruebas)

| Paso | Contenido | Bloqueado por |
|---|---|---|
| P0 | Aprobar/ajustar las recomendaciones de las secciones 4 y 5. | Decisión del usuario. |
| P1 | Reconciliar los diseños y versionar como migración `0008-*.sql` nueva el catálogo de comparsas, participantes, sujetos, orden de presentación, pasadas, rubros, escalas, premios, requisitos y enmiendas, junto con las filas de planilla. | P0; no restaurar `pendientes/` tal cual. |
| P2 | API de lectura del Jurado: contextos con asignación activa y planilla esperada, sin puntajes. | P1 |
| P3 | PWA: completar, validar completitud, confirmar localmente y persistir el estado. | P2, estrategia D9 |
| P4 | Endpoint de recepción idempotente + tablas + triggers + auditoría. | P2, P3 |
| P5 | Comprobación de cierre de noche sobre planillas recibidas (sin cálculo de resultados). | P1, D10, D11 |

Pruebas obligatorias, según `AGENTS.md` §11 y los specs: asignación activa y
contexto inválido; completitud; escala `1..5`/`0`; idempotencia con el mismo y con
distinto contenido; concurrencia; inmutabilidad del voto; persistencia local tras
reinicio; conectividad; bloqueo de cierre con planillas pendientes; auditoría sin
secretos; y ausencia de puntajes en respuestas antes del cierre total.

## 7. Lo que este documento NO autoriza

- Crear ni ejecutar migraciones.
- Agregar roles, alias de roles ni excepciones reglamentarias.
- Definir desempates, impugnaciones, votos tardíos ni correcciones de votos.
- Implementar penalizaciones, resultados, actas ni documentos oficiales.
- Marcar como respondidas las decisiones D9–D12 en `decision-questions.md`.

## Comentarios

- 2026-11-19: propuesta solicitada por el usuario tras completar los tickets
  01–08. Se basa en `AGENTS.md`, `docs/voting/`, `api/migrations/pendientes/README.md`
  y los specs `.scratch/votacion-offline/spec.md` y `.scratch/cierre-resultados/spec.md`.
- 2026-11-19: el hallazgo central es que **no falta solo una tabla de planilla**:
  falta el catálogo de filas evaluables, y su diseño pendiente contradice varias
  reglas ya confirmadas. Por eso la propuesta separa la resolución de conflictos
  (P0/P1) de la recepción de votos (P4).
