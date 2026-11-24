# Feature diferido: reglas de puntuación pendientes del reglamento 2027

**Estado:** base v1 aprobada el 2026-11-24; ajuste final diferido hasta disponer del reglamento 2027 definitivo.

**Motivo:** el usuario no cuenta todavía con el reglamento 2027 definitivo. El 2026-11-24 se decidió adoptar formalmente la base Goya (titulada 2026) junto con las reglas ya confirmadas (`D22`, `D24`, `D13`, `D14`) como motor de cálculo v1, manteniendo los parámetros configurables por versión de reglamento para adaptarlos cuando exista el texto definitivo 2027.

**Qué desbloquea:** con las decisiones del 2026-11-24 queda habilitado el diseño físico de P6 (cierre total, penalizaciones digitales, cálculo de resultados v1 con parámetros por versión, resolución manual de empates y actas oficiales PDF/CSV con SHA-256). El catálogo de `tipo_rubro` (`NOMINATIVO`, `ALEATORIO`) está confirmado por el responsable del proyecto (H9).

**Uso actual en el diseño (base v1 confirmada el 2026-11-24):**

| Tema | Base aplicada en v1 | Referencia |
|---|---|---|
| Fuente general y fórmula de comparsas | Base Goya 2026 + reglas confirmadas (`D24`) | `decision-questions.md` |
| Escala 1 a 5 (`0` = «No se presentó») | Goya (`D22`, `R5`) | H13 |
| Planillas incompletas / faltantes | Bloqueadas en carga (`D23`) y cierre (`D11` estricto) | `cierre-noche-api.md` |
| Premios individuales y múltiples pasadas | Suma por `sujeto × rubro × especialidad` entre jurados y noches puntuables; sin duplicar puntaje dentro del mismo rubro (`D6`/`R9`) | `decision-questions.md` |

## Decisiones pendientes y resueltas

| ID | Decisión | Fuentes en conflicto | Impacto / Estado |
|---|---|---|---|
| R1 | ¿Qué reglamento rige 2027? | Goya 2025/2026 vs proyecto 2027 | **Resuelto para v1 (2026-11-24):** motor de cálculo v1 sobre base Goya 2026 + reglas confirmadas, parametrizado por versión de reglamento; validar con el texto oficial 2027 cuando llegue |
| R2 | Carros en nominativos: ¿cuenta uno o dos? | Proyecto: uno. Goya: dos | **Resuelto con D24 y R1 v1:** cuentan los dos carros de mayor puntaje por comparsa (`regla_calculo_version` parametrizable) |
| R3 | Fórmula de puntaje de comparsa: qué rubros se suman | Resuelto con D24: sumar requisitos/rubros fijos que puntúan, el mejor nominativo por comparsa y solo los dos carros de mayor puntaje | `regla_calculo_version` (H16) |
| R4 | Resuelto: los fijos son requisitos de presentación, no tipo de rubro. R4b resuelto por el responsable del proyecto: cada requisito puntúa o no, decidido por el administrador desde la app (`requisito_version.puede_puntuar`), en borrador | Proyecto (sección E y VII) | `requisito_version` (§5.15b) |
| R5 | Escala: 1 a 5 o 1 a 10 | Goya (1 a 5, D22) vs proyecto (1 a 10) | **Resuelto por el responsable del proyecto: escala 1 a 5.** `escala_puntaje_version` (H13) |
| R6 | Equidad: quitar puntaje de las demás comparsas o asignar 5 | Goya vs proyecto | **Acotado en v1 (2026-11-24):** `D23` y la política estricta de `D11` impiden planillas incompletas o faltantes en el flujo ordinario; no se implementa ajuste automático de equidad en v1 |
| R7 | Nominados por rubro aleatorio: 3 o 4 | Proyecto: 3. Goya: 4 | **Resuelto por el responsable del proyecto: configurable por el administrador en la aplicación, no fijo en el esquema.** `nominados_maximos` (A13) |
| R8 | Momento en que se nominan los rubros aleatorios | **Resuelto por el responsable del proyecto: antes de abrir la primera noche, en el padrón (H11)**, editables hasta esa apertura | Flujo previo a la planilla (H11) |
| R9 | Consolidación de premios individuales entre jurados y noches | Ambas fuentes: suma y mayor puntaje | **Resuelto para v1 (2026-11-24):** suma entre jurados y noches puntuables por `sujeto × rubro × especialidad`; un participante puede sumar en varios rubros distintos, pero dentro de un mismo rubro tiene una sola evaluación por jurado y noche (D6) |
| R10 | Nombre y función de cada jurado (J1, J2, J3) | Planilla: J1 Vestuario, J2 Puesta en escena, J3 Batería. Proyecto: J1 Baile, J2 Vestuario, J3 Batería | **Resuelto operativamente:** `especialidad` es configurable por edición en la API vigente; fijar los nombres oficiales 2027 al cargar la edición |
| R11 | «Impacto visual» del carro aparece en J1 y en J3 en la planilla | **Resuelto por el responsable del proyecto: cada fila es sujeto × rubro × especialidad; el mismo sujeto y rubro pueden aparecer en dos especialidades** | `objetivo_rubro` por especialidad |

## Criterio de cierre

Cerrar definitivamente este documento cuando se reciba el reglamento 2027 oficial, contrastando cada `R#` contra el artículo y página exactos y ajustando, si corresponde, los parámetros de la versión de reglamento 2027.
