# Flujo de creación de un evento

**Estado:** propuesta para revisión. No autoriza implementación.

**Base:** [`database-design.md`](database-design.md) define las invariantes de planillas y votos; [`diseno-fisico-evento.md`](diseno-fisico-evento.md) v3 detalla el modelo físico y la congelación (opción B); `AGENTS.md` contiene las reglas generales del dominio.

## 1. Principios del flujo

1. **Un solo lugar, avance no lineal.** El administrador ve todos los pasos en una barra lateral con su estado (`Pendiente`, `Incompleto`, `Con errores`, `Listo`). Puede ir y volver; solo **publicar** y **abrir** están condicionados.
2. **Guardado automático.** Todo se guarda como borrador al salir de cada campo. No existe «perder lo cargado».
3. **Generar, no cargar a mano.** Lo que puede derivarse se deriva: filas de planilla, orden inicial, escalas por defecto. El administrador corrige excepciones.
4. **Errores bloqueantes vs. advertencias.** Un error impide publicar; una advertencia se muestra pero no bloquea. Nunca se mezclan.
5. **Acciones sensibles con modal.** Borrar, publicar, abrir edición, abrir noche y guardar orden piden confirmación explícita (`AGENTS.md` §Comparsas).
6. **Lo congelado se ve congelado.** Tras abrir la primera noche, las pantallas de reglamento y padrón pasan a solo lectura con un aviso que indica desde cuándo y por qué.

## 2. Ciclo de vida

```
Edición CONFIGURING ──(abrir edición)──▶ Edición OPEN ──(abrir noche 1)──▶ CONGELADO
   │                                       │                                 │
   │ reglamento editable (borrador)        │ reglamento: solo si no          │ reglamento y padrón
   │ padrón editable                       │ hay noche abierta               │ en solo lectura
   │                                       │ padrón editable                 │ noches nuevas: DRAFT
   │                                       │ asignaciones de jurado          │ cambios: enmienda (H3)
```

- **Publicar versión** puede hacerse en `CONFIGURING` u `OPEN`, siempre antes de abrir la primera noche.
- **Abrir edición** no congela nada: habilita la operación (asignaciones de jurados, noches en `DRAFT`).
- **Abrir la primera noche** exige versión `PUBLICADA` y congela reglamento y padrón (opción B).

## 3. Pasos del asistente

### Paso 0 — Crear la edición

| Campo | Regla |
|---|---|
| Nombre | Obligatorio |
| Año | Obligatorio, único (A9) |
| Partir de… | `Edición vacía` o `Copiar reglamento de una edición anterior` |

- Copiar crea la **versión 1 en borrador** con especialidades, rubros, escalas, reglas y premios de la edición elegida. No copia comparsas ni participantes (A3: son propios de cada edición).
- Resultado: edición en `CONFIGURING` y versión 1 en `BORRADOR`.

### Paso 1 — Noches

Lista editable de noches con: orden, nombre, fecha, tipo (`COMPETENCIA` / `PREMIACION`) y «cuenta para el puntaje».

- **Ayuda:** al cargar 4 noches de competencia, el sistema sugiere marcar las 3 primeras como puntuables (D13) y lo muestra como advertencia si no coincide.
- **Validación:** orden único; al menos una noche de competencia.

### Paso 2 — Reglamento (versión en borrador)

Subpantallas en este orden, porque cada una alimenta a la siguiente:

1. **Especialidades** (jurados): nombre, código, orden. Ej. del modelo 2026: Vestuario, Puesta en escena y coreografía, Batería.
2. **Rubros:** nombre, código, tipo (`NOMINATIVO` / `ALEATORIO`), tipo de sujeto (persona, grupo, carro, carroza, batería, banda, tema, comparsa), **especialidades que lo evalúan**, nominados máximos (solo aleatorios), «admite No se presentó».
3. **Escalas:** por defecto se aplica la escala de la versión (2027: 1 a 5) a todos los rubros. Solo se edita el rubro que difiera.
4. **Reglas de cálculo:** se eligen del catálogo (`algoritmo_calculo`): cómputo de comparsa, carros computables, equidad. Los parámetros se validan en el formulario.
5. **Premios:** nombre, modalidad (individual o grupal) y orden.

- **Validación:** todo rubro tiene escala y al menos una especialidad; reglas con parámetros válidos.
- Mientras el reglamento 2027 no esté confirmado, las reglas de cálculo se cargan con los valores provisorios del feature diferido (`feat-reglamento-2027-pendiente.md`).

### Paso 3 — Comparsas y padrón

Por cada comparsa, una ficha con tres bloques:

1. **Datos:** nombre, categoría (`PRIMERA` o `AGRUPACION`), activa.
2. **Participantes:** personas de la comparsa (nombre completo).
3. **Sujetos evaluables:** qué presenta la comparsa. El sistema propone una lista inicial a partir de los tipos de sujeto que usan los rubros (por ejemplo, si hay rubros de carro, propone «Carro 1»). El administrador completa nombres, vincula personas y agrega o quita.

- **Carga masiva:** importación de comparsas, participantes y sujetos desde planilla (CSV o Excel) con una **pantalla de revisión** antes de guardar (D8). Nada importado se guarda sin revisión.
- **Validación:** sujeto `PERSONA` con participante; los demás con nombre; un sujeto con varias personas es `GRUPO` (A7).

### Paso 4 — Orden

Dos vistas en la misma pantalla:

1. **Orden por noche:** qué comparsas desfilan cada noche y en qué orden, con hora programada (sirve para penalidades). Arrastrar y soltar; «copiar orden de la noche anterior».
2. **Entradas dentro de la comparsa:** cada pasada tiene un orden propio y referencia al mismo sujeto evaluable. Un participante puede aparecer más de una vez en la misma comparsa y noche sin duplicar su identidad. Esto organiza el desfile, pero no decide si las apariciones se puntúan por separado o se consolidan (D6).

- Guardar el orden pide confirmación (modal).
- **Validación:** orden sin huecos ni duplicados; toda comparsa activa aparece en al menos una noche (advertencia, no error).

### Paso 5 — Planillas

El sistema **genera** las filas de planilla con la regla:

> para cada rubro × cada sujeto de su tipo × cada especialidad que evalúa el rubro → una fila.

El administrador solo ajusta excepciones:

- **Marcar «no compite»** (fila gris, `evaluable = false`): por ejemplo, la solista femenina.
- **Nominar en aleatorios:** elegir hasta el máximo de nominados por comparsa; el contador muestra «2 de 3».
- **Quitar una fila** que no aplica.

Si después cambia un rubro o un sujeto, el sistema avisa qué filas quedaron desactualizadas y ofrece regenerar **solo esas**, sin borrar las excepciones ya marcadas.

### Paso 6 — Vista previa y checklist

- **Vista previa** por especialidad y comparsa, con el mismo aspecto que la planilla en papel (columnas Integrante, Rubro, Puntaje; filas grises). Sin campos de puntaje activos.
- **Checklist** agrupado por paso, con enlace directo al error:

| Tipo | Ejemplos |
|---|---|
| Bloqueante | Rubro sin escala; rubro sin especialidad; sujeto `PERSONA` sin participante; aleatorio con más nominados que el máximo; noche sin orden; regla de cálculo con parámetros inválidos |
| Advertencia | Comparsa sin orden de presentación; especialidad sin rubros; comparsa activa sin noche asignada; noches puntuables distintas de la sugerencia |

### Paso 7 — Publicar la versión

- Botón habilitado solo sin errores bloqueantes.
- Modal: resumen (n.º de rubros, comparsas, filas de planilla por especialidad) y aviso de que una versión publicada **no se edita**; los cambios requieren una versión nueva.
- Resultado: versión `PUBLICADA`; si había otra publicada, pasa a `SUPERSEDIDA`.

### Paso 8 — Abrir la edición y operar

1. **Abrir edición** (modal, auditado, idempotente). No congela nada.
2. **Asignar jurados** por noche y especialidad (fuera del alcance de este documento).
3. **Abrir noche 1** (modal con checklist propio: versión publicada, al menos un jurado activo para cada especialidad que evalúa rubros de esa versión y orden para cada comparsa activa). La cobertura por especialidad y el orden completo fueron confirmados por el responsable del proyecto el 19/11/2026. Al confirmar:
   - la versión pasa a `CONGELADA`;
   - el padrón queda en solo lectura;
   - se muestra el aviso de congelación en todas las pantallas de configuración.
4. **Noches siguientes:** se abren con el mismo checklist, sin efecto de congelación.

## 4. Cambios después de publicar

| Momento | Qué puede hacer el administrador |
|---|---|
| Versión publicada, ninguna noche abierta | Crear versión nueva desde la publicada, editarla y publicarla (reemplaza a la anterior). El padrón sigue editable |
| Primera noche abierta | Nada sobre reglamento ni padrón. Solo noches nuevas en `DRAFT` y operación. Un cambio reglamentario va por enmienda (H3, pendiente) |

## 5. Implicaciones para el diseño físico

El flujo agregó dos necesidades, ya incorporadas en `diseno-fisico-evento.md` (§5.12b `rubro_especialidad` y columnas `origen` y `excluida` en §5.13):

1. **Especialidades por rubro como configuración.** Para generar filas automáticamente, el rubro necesita saber qué especialidades lo evalúan. Propuesta: tabla `rubro_especialidad` (rubro de la versión × especialidad), y la fila de planilla se genera a partir de ella.
2. **Marca de origen en la fila de planilla.** Para regenerar sin perder excepciones, la fila necesita saber si fue generada o ajustada a mano (por ejemplo, `origen`: `GENERADA` / `MANUAL`, y `evaluable` marcado a mano).

## 6. Pendientes que afectan el flujo

- Copia asistida de comparsas entre ediciones (A3): hoy no se copia.
- Formato de importación (D8).
- Enmiendas después de congelar (H3).
- Reglas de cálculo definitivas: feature diferido R1 a R11.
