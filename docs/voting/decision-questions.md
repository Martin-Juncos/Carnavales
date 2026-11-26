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

## Retiro definitivo de ediciones

Administración puede retirar de la operación una edición **En configuración**
(`CONFIGURING`) o **Abierta** (`OPEN`), con confirmación explícita. Que el
reglamento esté publicado no impide el retiro.

El único bloqueo de elegibilidad es que la edición tenga una jornada
competitiva **en votación** (`noche.estado = OPEN`). La apertura administrativa
de la edición no equivale a una votación en curso. Una jornada en borrador
(`DRAFT`) o cerrada (`CLOSED`) no bloquea por su estado.

El retiro es definitivo, sin restauración. Conserva las planillas, los votos,
los cierres y la auditoría originales como evidencia de solo lectura, sin
ampliar quién puede consultar puntajes. La [API de retiro](configuracion-api.md#retirar-una-edición)
es independiente del borrado físico de ediciones vacías.

## Preguntas para resolver

Se puede responder por identificador (por ejemplo, `D1: ...`). Si una respuesta
depende de un reglamento o documento oficial, indicar el nombre, edición y
artículo, o compartir el archivo.

### Respuestas recibidas

| ID | Respuesta | Estado |
|---|---|---|
| D1 | Usar como base provisional el PDF proporcionado; su nombre de archivo dice 2025, pero el título impreso en el documento dice «Reglamento del Carnaval de Ciudad de Goya 2026». El 2026-11-24 se aprobó adoptarlo junto con las reglas ya confirmadas (`D22`, `D24`, `D13`, `D14`) como motor de cálculo v1, dejando los parámetros configurables por versión de reglamento hasta contar con el texto definitivo 2027. | Base v1 aprobada (2026-11-24); texto oficial 2027 pendiente |
| D2 | Las reglas serán iguales para todas las noches y comparsas; no se prevén variantes. | Respondida, pendiente de contrastar con el reglamento |
| D3 | Habrá varias noches con la misma configuración. La base prevé cuatro noches de participación; se puntúan las tres primeras noches oficiales. | Respondida; falta confirmar calendario y cantidad exacta para 2027 |
| D4 | Una planilla por jurado, especialidad y noche. | Respondida |
| D5 | Al abrir se congelan rubros y escalas y no se permiten cambios al reglamento. Los demás cambios no pueden alterar planillas confirmadas; faltan restricciones por tipo y excepciones auditables. | Parcial |
| D6 | Un mismo participante puede tener varias pasadas en la noche y puntuar en varios rubros distintos (suma en cada uno), pero dentro de un mismo rubro tiene una sola evaluación por jurado y noche (`sujeto × rubro × especialidad`, sin duplicar puntaje por pasada). Consolidación de premios individuales por suma entre jurados y noches puntuables. | Resuelta para v1 (2026-11-24) |
| D7 | La condición evaluable/no evaluable se determina por rubro. | Respondida |
| D8 | Se requiere carga manual e importación asistida con revisión antes de publicar. Los formatos aún no están definidos. | Parcial |
| D9 | Se permite confirmar en el dispositivo sin internet, con dos estados: confirmado localmente/pendiente de recepción y recibido oficialmente por el servidor. El 2026-11-19 se eligió reintento automático con espera exponencial acotada más botón manual; el `operationId` no cambia y ante `409` se informa sin reintentar. El 2026-11-24 se confirmó política estricta v1: sin excepción de cierre ni carga de contingencia ante dispositivo irrecuperable (se resuelve por sincronización o relevo de suplente mientras la noche está abierta). | Resuelta para v1 (2026-11-24) |
| D10 | El Jurado confirma su planilla y el Escribano cierra la noche y la votación completa. No se crea el rol `FISCAL`. El 2026-11-24 se aprobaron las condiciones del cierre total: al menos una noche `COMPETENCIA` con `cuenta_para_puntaje = true`, todas esas noches en `CLOSED`, ninguna noche `COMPETENCIA` en `OPEN` (las `PREMIACION` no bloquean), sin cierre por comparsa separado, y transición irreversible que bloquea abrir nuevas noches o recibir votos. | Resuelta (2026-11-24): P5 y P6A implementados |
| D11 | No se permite cerrar si falta cualquier planilla oficial esperada o si la instantánea de apertura es vacía o no existe. Un relevo registrado satisface la misma obligación, sin reasociar planillas históricas. El 2026-11-24 se confirmó política estricta v1 sin cierre excepcional. | Resuelta para v1 (2026-11-24) |
| D12 | No se corrigen planillas recibidas ni en forma excepcional en v1; se mantiene la inmutabilidad del voto. | Resuelta para v1 (2026-11-24) |
| D13 | Para 2027 se cuentan las tres primeras noches oficiales para los puntajes; la participación base comprende cuatro noches. | Respondida; falta confirmar calendario y cantidad exacta |
| D14 | Se adoptan para 2027 las penalidades del reglamento aportado. El 2026-11-24 se definió el flujo digital v1: solo `ESCRIBANO` registra y anula penalizaciones (con tipo, noche, comparsa, minutos cuando aplica, motivo obligatorio y referencia de acta/autoridad), habilitadas hasta el cierre total y congeladas al cerrar la votación completa; toda anulación es lógica y append-only. | Resuelta para v1 (2026-11-24) |
| D15 | Nadie puede ver puntajes numéricos antes del cierre total; antes solo se muestran estados. El 2026-11-24 se confirmó que, tras el cierre total, solo `ESCRIBANO` y `ADMINISTRADOR` pueden consultar puntajes detallados y resultados; el `JURADO` no accede a puntajes ajenos ni al escrutinio interno. | Resuelta (2026-11-24) |
| D16 | Sin desempate automático en v1 (2026-11-24): ante un empate en un puesto/premio clave, el sistema marca el empate y bloquea la publicación hasta que el `ESCRIBANO` registre la resolución oficial manual con motivo y referencia de acta, sin alterar votos ni puntajes. | Resuelta para v1 (2026-11-24) |
| D17 | Impugnaciones y anomalías quedan fuera del flujo digital en v1 hasta contar con un procedimiento reglamentario aprobado (2026-11-24). | Diferida post-v1 (2026-11-24) |
| D18 | Política estricta v1 (2026-11-24): una vez cerrada la noche por el `ESCRIBANO`, cualquier planilla o envío tardío se rechaza. | Resuelta para v1 (2026-11-24) |
| D19 | No se permiten cambios al reglamento después de abrir la jornada. | Respondida |
| D20 | En v1 (2026-11-24): actas oficiales de resultados en PDF y CSV con hash SHA-256 emitidas por el `ESCRIBANO` tras el cierre total; planilla imprimible individual reservada solo para `ESCRIBANO`/`ADMINISTRADOR` después del cierre total (o diferida a una fase posterior). Alcance de producto confirmado para P6D (sin fecha registrada en esta tabla; ver nota abajo): solo actas de resultados (la planilla imprimible individual queda para otra etapa); acceso de descarga/verificación para `ESCRIBANO`/`ADMINISTRADOR` con sesión, emisión reservada al `ESCRIBANO`; emisión solo sobre resultados publicados tras el cierre total, identificando la versión de resultados usada; contenido: edición, versión publicada, fecha, emisor, clasificación y ganadores por premio, desglose por rubro, penalizaciones y resoluciones de empates aplicadas, sin notas individuales por jurado. | Resuelta para v1 (2026-11-24); alcance/acceso/emisión/contenido de P6D confirmados, diseño físico en borrador |
| D21 | En v1 (2026-11-24): conservación indefinida de solo lectura sin purga automática; el `ADMINISTRADOR` puede eliminar físicamente una edición completa (incluidos sus votos, penalizaciones, resultados, actas/documentos y auditoría atribuible) fuera de votación activa mediante la excepción confirmada de eliminación completa (con confirmación explícita en modal y validación de rol en API/BD), manteniendo bloqueado todo borrado parcial de votos, actas o auditoría individuales. | Resuelta para v1 (2026-11-24) |
| D22 | Para 2027 se adopta la escala 1–5 del reglamento aportado; 0 se reserva para “no se presentó”. | Respondida; reflejada en `AGENTS.md` y diseños |
| D23 | El sistema no permitirá saltear puntuaciones requeridas; no se podrá confirmar una planilla incompleta. | Respondida; reflejada en los diseños |
| D24 | Resultado general de comparsas: sumar rubros fijos, contar el mayor puntaje de cada comparsa en rubros nominativos y contar solo sus dos carros de mejor puntaje. | Respondida por el responsable del proyecto (19/11/2026); reflejar en el catálogo de cálculo |
| D25 | Conflicto entre fuentes: `AGENTS.md` §2 confirma que un ítem padre con hijos no recibe nota manual y suma sus subítems; `diseno-fisico-evento.md` v3 (§0 y H10) descarta esa jerarquía porque la planilla modelo puntúa cada fila por separado. Requiere decisión expresa; no se resuelve por inferencia. | Respondida el 2026-11-19: priorizar `AGENTS.md`; el diseño físico debe adaptarse |

### Decisiones recibidas el 2026-11-24 (desbloqueo de P6 / v1)

| ID | Decisión | Estado |
|---|---|---|
| D10 (cierre total) | El `ESCRIBANO` cierra la votación completa cuando existe al menos una noche `COMPETENCIA` con `cuenta_para_puntaje = true`, todas esas noches están en `CLOSED` y ninguna noche `COMPETENCIA` está en `OPEN` (`PREMIACION` no bloquea). Sin cierre de comparsa separado. Transición irreversible: impide abrir nuevas noches o recibir votos. | Aprobada |
| D15 (post-cierre) | Tras el cierre total, solo `ESCRIBANO` y `ADMINISTRADOR` consultan puntajes detallados y resultados; el `JURADO` no accede a puntajes ajenos ni al escrutinio interno. | Aprobada |
| D9/D11/D12/D18 (excepciones) | Política estricta en v1: sin cierre excepcional por planilla faltante, sin corrección digital de votos y sin carga de contingencia; las incidencias operativas se resuelven sincronizando o con relevo de suplente antes del cierre de noche. Tras cerrar la noche, cualquier envío tardío se rechaza. | Aprobada |
| D14 (penalizaciones) | Solo `ESCRIBANO` registra y anula penalizaciones (tipo, noche, comparsa, minutos si aplica, motivo obligatorio y referencia de acta/autoridad). Se permiten hasta el cierre total y quedan congeladas al cerrar la votación completa. Las anulaciones son lógicas y append-only. | Aprobada |
| D1/R1 (motor de cálculo v1) | Adoptar la base Goya (titulada 2026) con las reglas confirmadas (`D22`, `D24`, `D13`, `D14`) como motor de cálculo v1, con parámetros editables por versión de reglamento a la espera del texto definitivo 2027. | Aprobada |
| D6/R9 (pasadas e individuales) | Un participante puede puntuar en varios rubros distintos (suma en cada uno entre jurados y noches puntuables), pero dentro de un mismo rubro tiene una sola evaluación por jurado y noche (`sujeto × rubro × especialidad`, sin duplicar puntaje por pasada). | Aprobada |
| D16/D17 (desempates e impugnaciones) | Sin desempate automático: ante un empate en puesto/premio clave, el sistema marca el empate y bloquea la publicación hasta que el `ESCRIBANO` registre la resolución oficial manual con motivo y referencia de acta (sin alterar votos). Impugnaciones (`D17`) fuera del flujo digital v1. | Aprobada |
| D20 (actas y planillas) | Actas oficiales en PDF y CSV con hash SHA-256 emitidas por el `ESCRIBANO` tras el cierre total, versionadas sin sobrescritura. Planilla imprimible individual reservada solo para `ESCRIBANO`/`ADMINISTRADOR` después del cierre total (o diferida a fase posterior). | Aprobada |
| D21 (retención) | Conservación indefinida de solo lectura sin purga automática; el `ADMINISTRADOR` puede borrar físicamente una edición completa (incluidos sus votos, penalizaciones, resultados, actas y auditoría atribuible) fuera de votación activa, manteniendo bloqueado todo borrado parcial de evidencia. | Aprobada |

### Decisiones recibidas el 2026-11-19

| ID | Decisión | Estado |
|---|---|---|
| D9 (estrategia) | Reintento automático con espera exponencial acotada durante la sesión y botón manual «Reintentar ahora». El `operationId` nunca cambia; ante `409` se detiene y se informa, sin reintentos ciegos. | Aprobada |
| D9 (conflictos) | Conflicto = mismo `operationId` con contenido distinto o planilla ya recibida. La planilla local queda bloqueada; no se corrige ni se sobrescribe. | Aprobada; procedimiento excepcional pendiente |
| D10 (actores) | Cierre de planilla: Jurado. Cierre de noche y de la votación completa: **Escribano**. | Aprobada; P5 y P6A implementados (condiciones resueltas el 2026-11-24) |
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
- **Premios y puestos — páginas 4 y 6:** en «CARGOS A PUNTUAR», el
  reglamento adjudica Primera Princesa del Carnaval al segundo puntaje y
  Segunda Princesa al tercero de la elección de Reina del Carnaval. Reina
  de Comparsas es una competencia distinta. «PREMIOS INDIVIDUALES POR
  RUBROS» establece la suma de cada jurado durante las noches puntuables y
  el mayor puntaje como regla general. No implica que cada componente
  puntuable sea un premio independiente ni que todos los premios sean
  primeros puestos.
- **Cargo, sujeto y rubro — planillas aportadas:**
  `Planilla_Puntaje Modelo2026.xlsx`, hojas `Planilla Puntaje J1` y
  `Planilla Puntaje J2`, A3:C3: «INTEGRANTE / RUBRO / PUNTAJE»;
  A4: «Reina: ANA GOMEZ» y B4: «Reina de Comparsas». La persona es el
  sujeto, Reina es su cargo y Reina de Comparsas es el rubro. En ambas
  hojas, A57/B57/B60/B63/B66 presentan un carro con varios componentes
  puntuables: no se infiere un premio separado por cada componente.
  `ITA Vera - copia - Hojas de cálculo de Google.pdf`, página 1: Aldana
  Centurion, Reina de Comparsa, compite en Mejor Reina de comparsas, mientras
  Macarena Perrotta, Anunciadora, compite en Reina del Carnaval de Goya;
  página 2: Yamila Dramisino, Solista, también compite en este último rubro.
  El cargo no determina todos los rubros en los que participa una persona.
  Ver las definiciones del [glosario](../../GLOSSARY.md).

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
`COMISARIO` como alias. P5 implementa el [cierre de noche](cierre-noche-api.md).
Siguen pendientes los requisitos del cierre total y el tratamiento del cierre
de comparsa.

**D11.** Si falta una planilla esperada, la noche permanece bloqueada hasta
su recepción oficial. También se bloquea si la instantánea falta o está vacía.
Si en el futuro se necesita una excepción, falta aprobar quién la autoriza,
qué evidencia se exige y cómo se registra sin alterar votos.

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

**D24 — Respondida.** Para 2027 se adopta la fórmula de resultado general del
reglamento aportado: suma de rubros fijos, mayor puntaje por comparsa en rubros
nominativos y solo los dos carros de mejor puntaje. Respondida por el responsable
del proyecto el 19/11/2026.

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

Con las decisiones del 2026-11-19 y 2026-11-24 ya se implementaron **P6A**
(cierre total irreversible, `0026`), **P6B** (penalizaciones digitales, `0027`)
y **P6C** (motor de cálculo v1, resolución manual de empates y publicación
oficial, `0028`). Quedan pendientes **P6D** (actas oficiales PDF y CSV con hash
SHA-256), el texto oficial del reglamento 2027 (para validar los parámetros del
motor v1), el calendario exacto 2027 (`D13`), los formatos de importación
asistida (`D8`) y un eventual flujo digital de impugnaciones (`D17`, diferido
post-v1). Este registro no autoriza por sí solo migraciones: el diseño físico
de P6D debe aprobarse antes de implementarlo.

Existe una [propuesta de diseño de planilla, voto y cierres](planilla-voto-diseno-propuesto.md)
con recomendaciones concretas para D9–D12 y para los conflictos entre los
documentos de diseño. La propuesta **no cambia el estado** de las decisiones de
esta tabla: cada recomendación requiere aprobación expresa antes de implementarse.

**Aclaración de D20 — premios:** el usuario eligió «Usar los premios del
catálogo» y «Según una clasificación calculada — recomendado» para las actas
de P6D. Cada premio se vincula a una clasificación general o por rubro y el
ganador surge de ese resultado y de las resoluciones oficiales de empate.
No se eligió adjudicación manual ni mixta. El reglamento aportado ya
distingue cargo/rol, sujeto evaluable, rubro, clasificación y premio (ver los
[hallazgos verificados](#hallazgos-del-reglamento-aportado) y el
[glosario](../../GLOSSARY.md)): la regla general adjudica por mayor puntaje,
sin convertir cada componente puntuable en un premio; la elección de reina
adjudica tres premios distintos (Reina del Carnaval, Primera Princesa del
Carnaval, Segunda Princesa del Carnaval) a partir de los tres primeros
puestos de una única clasificación. El catálogo existente es independiente de
los rubros en el modelo vigente (decisión histórica `H10`); esa independencia
no niega las reglas de adjudicación del reglamento. La corrección actual
retira la configuración genérica como prerrequisito universal: corresponde
[revisar los casos concretos](actas-diseno.md#21-vinculación-de-premios-a-resultados-propuesta-técnica)
contra la cobertura del motor antes de proponer una ampliación. No se presume
un bloqueo general sobre reglamentos ya congelados. Esta elección no autoriza
modificar un reglamento después de la apertura.

Para P6D existe un borrador de diseño físico y contrato de API
([actas-diseno.md](actas-diseno.md), [actas-api.md](actas-api.md)) que parte
de las decisiones de alcance/acceso/emisión/contenido ya confirmadas para
`D20` arriba. El modelo de tablas, los endpoints, el formato exacto de
PDF/CSV y la biblioteca de generación son propuestas técnicas sin aprobar;
ninguno autoriza migraciones ni implementación hasta su aprobación expresa.
