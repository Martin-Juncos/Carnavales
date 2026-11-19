# Decisiones funcionales pendientes de votación

**Estado:** registro de decisiones y preguntas pendientes. Las propuestas de
`docs/voting/` no autorizan por sí solas implementación ni migraciones.

**Propósito:** reunir las decisiones de producto que faltan para completar el
diseño funcional de Carnavales 2027. Las preguntas no presuponen una respuesta.
Cuando una regla ya está confirmada en `AGENTS.md`, se registra como tal y no se
reabre aquí salvo que se quiera cambiarla expresamente.

## Reglas confirmadas que este cuestionario respeta

- Para Carnavales 2027 se adoptó la escala de `1` a `5`; `No se presentó` es una
  decisión separada registrada con valor `0`.
- Una puntuación confirmada es inmutable. No se editan ni eliminan votos
  confirmados por operaciones ordinarias.
- Los totales se calculan por suma. Un ítem padre con hijos suma sus resultados;
  no recibe nota manual.
- No se descarta automáticamente la nota más alta ni la más baja.
- Las penalizaciones confirmadas descuentan puntos según la regla aplicable.
- La PWA permite confirmar una planilla en el dispositivo sin conexión. Ese
  estado local queda pendiente de recepción y no es oficial hasta que la API lo
  acepte o reconozca un reenvío idempotente equivalente.
- Las reglas no aprobadas —incluidos desempates, impugnaciones y votos fuera de
  término— no se deben inferir durante el diseño o la implementación.

## Preguntas para resolver

Se puede responder por identificador (por ejemplo, `D1: ...`). Si una respuesta
depende de un reglamento o documento oficial, indicar el nombre, edición y
artículo, o compartir el archivo.

### Respuestas recibidas

| ID | Respuesta | Estado |
|---|---|---|
| D1 | Usar como base provisional el PDF proporcionado; su nombre de archivo dice 2025, pero el título impreso en el documento dice «Reglamento del Carnaval de Ciudad de Goya 2026». Todavía no está 100 % definido ni aprobado para 2027. | Provisional; confirmar año/edición de referencia |
| D2 | Las reglas serán iguales para todas las noches y comparsas; no se prevén variantes. | Respondida, pendiente de contrastar con el reglamento |
| D3 | Habrá varias noches con la misma configuración. La base prevé cuatro noches de participación; se puntúan las tres primeras noches oficiales. | Respondida; falta confirmar calendario y cantidad exacta para 2027 |
| D4 | Una planilla por jurado, especialidad y noche. | Respondida |
| D5 | Al abrir se congelan rubros y escalas y no se permiten cambios al reglamento. Los demás cambios no pueden alterar planillas confirmadas; faltan restricciones por tipo y excepciones auditables. | Parcial |
| D6 | Se permiten varias pasadas del mismo participante en una comparsa y noche, vinculadas a la misma identidad. La forma de puntuarlas o consolidarlas en el resultado individual sigue pendiente. | Parcial; requiere aprobación reglamentaria |
| D7 | La condición evaluable/no evaluable se determina por rubro. | Respondida |
| D8 | Se requiere carga manual e importación asistida con revisión antes de publicar. Los formatos aún no están definidos. | Parcial |
| D9 | Se permite confirmar en el dispositivo sin internet, con dos estados: confirmado localmente/pendiente de recepción y recibido oficialmente por el servidor. El 2026-11-19 se eligió reintento automático con espera exponencial acotada más botón manual; el `operationId` no cambia y ante `409` se informa sin reintentar. | Respondida; excepción por dispositivo irrecuperable sigue pendiente |
| D10 | El jurado cierra su planilla; el escribano cierra la noche y la votación completa. No se crea el rol `FISCAL`. Faltan condiciones y definición precisa de cada etapa. | Parcial (actores respondidos el 2026-11-19; condiciones pendientes) |
| D11 | No se permite cerrar una noche mientras haya planillas confirmadas localmente pero no recibidas por el servidor. | Respondida |
| D12 | No se corrigen planillas recibidas; se mantiene la inmutabilidad del voto. | Respondida |
| D13 | Para 2027 se cuentan las tres primeras noches oficiales para los puntajes; la participación base comprende cuatro noches. | Respondida; falta confirmar calendario y cantidad exacta |
| D14 | Se adoptan para 2027, tal como están en el reglamento aportado, las penalidades por retraso de ingreso/salida, exceso del show de batería, retraso mayor a 30 minutos e incumplimiento del mínimo de integrantes. | Respondida; documentar flujo digital |
| D15 | Nadie puede ver puntajes numéricos antes del cierre total; antes solo se muestran estados. | Respondida |
| D16 | El reglamento aportado no define el desempate; se deja pendiente hasta aprobar un procedimiento. | Pendiente |
| D17 | El procedimiento para reclamos/impugnaciones todavía no está definido. | Pendiente |
| D18 | El tratamiento de planillas recibidas después del límite todavía no está definido. | Pendiente |
| D19 | No se permiten cambios al reglamento después de abrir la jornada. | Respondida |
| D20 | No está definido si el PDF imprimible es requisito para 2027. | Pendiente |
| D21 | La política de conservación de votos, auditoría, actas y documentos oficiales queda pendiente. | Pendiente |
| D22 | Para 2027 se adopta la escala 1–5 del reglamento aportado; 0 se reserva para “no se presentó”. | Respondida; reflejada en `AGENTS.md` y diseños |
| D23 | El sistema no permitirá saltear puntuaciones requeridas; no se podrá confirmar una planilla incompleta. | Respondida; reflejada en los diseños |
| D24 | Pendiente confirmar si para el resultado general de comparsas se adopta el tratamiento del reglamento base: sumar rubros fijos, contar el mayor puntaje de cada comparsa en rubros nominativos y contar solo sus dos carros de mejor puntaje. | Pendiente |
| D25 | Conflicto entre fuentes: `AGENTS.md` §2 confirma que un ítem padre con hijos no recibe nota manual y suma sus subítems; `diseno-fisico-evento.md` v3 (§0 y H10) descarta esa jerarquía porque la planilla modelo puntúa cada fila por separado. Requiere decisión expresa; no se resuelve por inferencia. | Respondida el 2026-11-19: priorizar `AGENTS.md`; el diseño físico debe adaptarse |

### Decisiones recibidas el 2026-11-19

| ID | Decisión | Estado |
|---|---|---|
| D9 (estrategia) | Reintento automático con espera exponencial acotada durante la sesión y botón manual «Reintentar ahora». El `operationId` nunca cambia; ante `409` se detiene y se informa, sin reintentos ciegos. | Aprobada |
| D9 (conflictos) | Conflicto = mismo `operationId` con contenido distinto o planilla ya recibida. La planilla local queda bloqueada; no se corrige ni se sobrescribe. | Aprobada; procedimiento excepcional pendiente |
| D10 (actores) | Cierre de planilla: Jurado. Cierre de noche y de la votación completa: **Escribano**. | Aprobada; condiciones de cada etapa pendientes |
| D10 (catálogo) | **No crear el rol `FISCAL`**; usar únicamente `ESCRIBANO`, que ya está en el catálogo. `COMISARIO` tampoco se usa como alias. | Aprobada; sin cambios de catálogo de roles |
| P1 | Fijar la instantánea de planillas esperadas al abrir la noche (asignaciones y versión), sin crear planillas nuevas. | Aprobada |
| Conflictos de diseño | Priorizar `AGENTS.md`: subítems con suma, evaluabilidad por rubro y escala `1–5`; adaptar el borrador físico y unificar nomenclatura antes de escribir DDL. | Aprobada |

Estas decisiones desbloquean la propuesta
[planilla-voto-diseno-propuesto.md](planilla-voto-diseno-propuesto.md) en su parte
de recepción de votos y catálogo. No autorizan por sí solas resultados,
penalizaciones ni documentos oficiales.

### Hallazgos del reglamento aportado

El archivo recibido se llama `REGLAMENTO DE GOYA 2025 (ULTIMO).pdf`, pero su
portada y encabezado dicen **Reglamento del Carnaval de Ciudad de Goya 2026**.
Hasta aclarar la edición, se cita como «reglamento aportado, titulado 2026».
Es una referencia provisional para Carnavales 2027, no una aprobación automática
de sus reglas.

Hallazgos relevantes para el diseño:

- **Páginas 3 y 9:** compromiso de participación durante cuatro noches; la
  puntuación del concurso se obtiene de las tres primeras noches oficiales. Para
  2027, el usuario confirmó que cuentan las tres primeras noches.
- **Páginas 6–7:** puntuación individual de 1 a 5; `0` solo cuando el rubro
  puntuable no se presenta. Si un jurado no puntúa un rubro para una o más
  comparsas, se eliminan los puntajes de las demás en ese rubro y queda sin
  puntuar para todas. Para 2027, el usuario indicó que el sistema impedirá
  saltear puntuaciones requeridas y bloqueará la confirmación de planillas
  incompletas; falta documentar qué ocurre ante fallas excepcionales de datos.
- **Páginas 6–7:** el resultado general de comparsas suma rubros fijos y aplica
  reglas particulares a rubros nominativos y carros alegóricos: para cada
  comparsa, en rubros nominativos cuenta el puntaje de mayor valor; si presenta
  más de dos carros, cuenta los dos de mejor rendimiento. La adopción de esta
  fórmula para 2027 todavía debe confirmarse.
- **Páginas 8–9:** el reglamento contiene penalidades por retrasos, límites de
  duración y faltas de integrantes: 0,50 puntos por minuto de retraso al ingreso
  o salida; 0,50 puntos por minuto de exceso del show de batería, descontados de
  ese rubro; más de 30 minutos de retraso implica ceder el lugar y desfilar al
  final con sanción por 30 minutos; no alcanzar el mínimo de integrantes impide
  puntuar para premios de comparsa, pero permite puntuar premios individuales.
  El reglamento indica que las penalidades no afectan la evaluación artística
  del jurado.
- **Página 9:** la apertura de sobres ocurre ante escribano y representantes;
  el escribano certifica el resultado.
- En el texto aportado no se encontró un procedimiento explícito de desempate,
  impugnación ni tratamiento digital de votos tardíos.

Estos hallazgos no sustituyen las decisiones pendientes ni resuelven conflictos
con las reglas confirmadas del proyecto. Para una referencia reproducible en el
repositorio, habrá que acordar si se incorpora una copia del PDF y con qué
identificación de edición.

**Decisión recibida para 2027:** se adopta la escala de 1 a 5 del reglamento
aportado, con 0 reservado para “no se presentó”. `AGENTS.md` y los diseños de
votación ya reflejan esta escala para 2027.

**Decisión recibida para 2027:** se cuentan las tres primeras noches oficiales
para los puntajes, aunque la participación base comprende cuatro noches.

**Decisión recibida para 2027:** se adoptan provisionalmente y tal como están
redactadas en el reglamento aportado las penalidades enumeradas en D14. La
autoridad organizadora y el flujo de registro deben reflejar lo que establece el
reglamento antes de cerrar el diseño.

### A. Fuentes y alcance del reglamento

**D1.** El reglamento aportado se usa como base provisional. Su nombre de archivo
indica 2025, pero el título impreso dice 2026. ¿Qué año/edición debe identificarse
como la fuente de referencia para el diseño 2027?

**D2.** ¿Las reglas serán iguales para todas las noches y comparsas, o el
reglamento permite variantes por noche, categoría, especialidad o premio?
Indica las excepciones documentadas, si las hay.

### B. Edición, noches y planillas

**D3.** ¿Una edición puede tener varias noches competitivas? Para cada noche,
¿pueden cambiar comparsas, rubros, jurados o reglas de evaluación?

**D4.** Decisión recibida: una planilla por jurado, especialidad y noche. Falta
armonizar el modelo de asignaciones para que identifique esa combinación.

**D5.** La regla vigente permite crear asignaciones nuevas mientras la jornada
competitiva siga en `DRAFT`, aunque el evento ya esté `OPEN`; una vez abierta la
jornada, no se admiten altas nuevas. ¿Qué otros cambios de configuración deben
bloquearse al abrir la jornada o después de publicar la edición?

### C. Rubros, objetivos y pasadas

**D6.** La edición permite varias pasadas del mismo participante en una comparsa
y noche. ¿Cómo se determina qué pasada(s) evalúa cada rubro y dónde se registra
el puntaje? Si varias pasadas alimentan un mismo resultado, ¿el reglamento indica
si se suman, se promedian, se toma una sola u otra regla? Citar la fuente; no se
deducirá del ejemplo de la Reina.

**D7.** ¿Qué elementos del desfile son evaluables y cuáles solo informativos?
¿La condición depende del rubro o es fija para cada elemento de la edición?

**D8.** ¿Los rubros y premios individuales/grupales se cargarán manualmente a
partir del reglamento, o se necesita importar archivos? Si se requiere
importación, ¿qué formato y quién valida los datos antes de publicarlos?

### D. Envío, conectividad y cierres

**D9.** La confirmación local offline, separada de la recepción oficial, está
confirmada. El 2026-11-19 se resolvió la estrategia: reintento automático con
espera exponencial acotada y botón manual, mismo `operationId`, y ante `409` se
informa sin reintentar. Sigue pendiente solo la excepción para dispositivos que
no puedan sincronizar.

**D10.** Actores respondidos el 2026-11-19: Jurado cierra su planilla; Escribano
cierra la noche y la votación completa. **No se crea el rol `FISCAL`** ni se usa
`COMISARIO` como alias. Siguen pendientes las condiciones precisas de cada etapa
(qué acciones representan los cierres de planilla y comparsa y qué requisitos
debe cumplir cada uno).

**D11.** Si falta una planilla esperada o un jurado no puede conectarse, ¿el
cierre debe permanecer bloqueado hasta recibirla? Si se necesita una excepción,
¿quién la autoriza, qué evidencia se exige y cómo se registra sin alterar votos?

**D12.** Después de confirmar una planilla, ¿se admite alguna corrección
excepcional? Si sí, describe quién puede solicitarla y aprobarla, qué evidencia
se conserva y cómo se registra el resultado corregido sin sobrescribir el voto
original. Si no hay procedimiento aprobado, se mantendrá como bloqueo.

### E. Cálculos, penalizaciones y resultados

**D13.** La decisión recibida cuenta las tres primeras noches oficiales. Falta
confirmar el calendario y la cantidad exacta de noches de Carnavales 2027.

**D14.** Las penalizaciones del reglamento aportado se adoptaron para 2027. Falta
definir cómo se registran digitalmente, qué evidencia se conserva y cómo se
refleja la autorización de la autoridad organizadora.

**D15.** ¿Cuándo pueden consultar resultados numéricos el jurado, fiscal,
escribano y administrador? El diseño actual propone ocultarlos antes del cierre;
confirma si esa política aplica a todos los roles y a cada tipo de resultado.

**D16.** ¿Qué procedimiento oficial resuelve empates, quién lo ejecuta y qué
evidencia se registra? Si el reglamento no lo define, ¿quién debe aprobar la
resolución antes de publicar resultados? No se configurará un desempate
automático sin una regla aprobada.

### F. Casos reglamentarios especiales

**D17.** ¿Cómo se tratan impugnaciones y anomalías? Indica plazos, autoridad,
evidencia requerida y efecto posible sobre resultados. Si está pendiente de
definición, se documentará como bloqueo.

**D18.** ¿Qué regla aplica a votos recibidos después de la hora límite o a
planillas cuya recepción no pueda acreditarse a tiempo? La hora del dispositivo
no prueba la recepción por el servidor; se necesita una regla oficial para
cualquier excepción.

**D19.** ¿Cómo se aprueban enmiendas al reglamento una vez publicada la edición
o emitidos votos? Indica quién las autoriza, desde cuándo rigen y si pueden
afectar una competencia en curso. Los votos y versiones anteriores deben
preservarse.

### G. Documentos imprimibles y conservación

**D20.** ¿La planilla imprimible es necesaria para 2027? Si sí, ¿quién puede
generarla/consultarla, en qué momento y puede mostrar puntajes después del
envío? El diseño actual deja su acceso y visibilidad para un feature posterior.

**D21.** ¿Qué política de retención y conservación legal aplica a votos,
auditoría, actas y documentos oficiales? Indica plazos, responsables y
restricciones de eliminación. No se propone borrado físico de evidencia sin
esta decisión.

**D24.** ¿Se adopta para 2027 la fórmula de resultado general del reglamento
aportado: suma de rubros fijos, mayor puntaje por comparsa en rubros nominativos
y solo los dos carros de mejor puntaje? Si se adapta, indica los cambios.

### H. Conflicto entre documentos de diseño

**D25.** `AGENTS.md` §2 establece como regla confirmada que los ítems pueden
tener subítems, que un ítem padre con hijos no recibe puntuación manual y que su
resultado es la suma de los hijos. En cambio, `diseno-fisico-evento.md` v3 (§0 y
H10) elimina esa jerarquía a partir de la planilla modelo, donde cada fila se
puntúa por separado y no hay subtotales. Ninguna de las dos fuentes ha sido
expresamente revocada. ¿Qué modelo rige para 2027: jerarquía de ítems/subítems
con suma del padre, o filas de planilla independientes? Hasta que haya decisión
expresa, el conflicto se mantiene como bloqueo: no se adopta un modelo ni se
debilita la regla confirmada para adaptarla al diseño físico.

## Próximo paso

Las respuestas ya recibidas se reflejan en `AGENTS.md` y los diseños de votación.
Las decisiones aún pendientes deben resolverse antes de completar el diseño
funcional; este registro no autoriza migraciones ni implementación. En
particular, D25 debe resolverse antes de cerrar el modelo de filas de planilla.

Existe una [propuesta de diseño de planilla, voto y cierres](planilla-voto-diseno-propuesto.md)
con recomendaciones concretas para D9–D12 y para los conflictos entre los
documentos de diseño. La propuesta **no cambia el estado** de las decisiones de
esta tabla: cada recomendación requiere aprobación expresa antes de implementarse.
