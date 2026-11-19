# Feature diferido: reglas de puntuación pendientes del reglamento 2027

**Estado:** diferido. Se retoma cuando se disponga del reglamento 2027 actualizado.

**Motivo:** el usuario no cuenta con el reglamento actualizado. Hoy hay dos fuentes: el reglamento de Goya 2025/2026 (`REGLAMENTO DE GOYA 2025 (ULTIMO).pdf`) y el «Proyecto de reglamento… edición 2027» (`Reglamento_Carnaval.pdf`, escaneo con OCR verificado en imagen en partes). No se sabe cuál rige.

**Qué no bloquea:** las tablas de edición, versiones, noches, comparsas, participantes, especialidades, orden de presentación, sujetos, pasadas, rubros, filas de planilla y escalas pueden avanzar. Sí bloquean `regla_calculo_version`. El catálogo de `tipo_rubro` (NOMINATIVO, ALEATORIO) está confirmado por el responsable del proyecto (H9).

**Uso actual en el diseño (provisorio):**

| Tema | Fuente aplicada hoy | Referencia |
|---|---|---|
| Puntuación de nominativos y aleatorios | Proyecto 2027 | `diseno-fisico-evento.md` §4.1 |
| Escala 1 a 5 | Goya (D22) | H13 |
| Equidad cuando un jurado no puntúa | Goya (se quita el puntaje de las demás comparsas) | H14 |
| Ítems | No se usan (Goya y planilla) | H10 |

## Decisiones pendientes

| ID | Decisión | Fuentes en conflicto | Impacto |
|---|---|---|---|
| R1 | ¿Qué reglamento rige 2027? | Goya 2025/2026 vs proyecto 2027 | Todo lo de abajo |
| R2 | Carros en nominativos: ¿cuenta uno o dos? | Proyecto: uno. Goya: dos | `regla_calculo_version` |
| R3 | Fórmula de puntaje de comparsa: qué rubros se suman | Proyecto (sección VII, redacción ambigua en el escaneo) | `regla_calculo_version` (H16) |
| R4 | Resuelto: los fijos son requisitos de presentación, no tipo de rubro. R4b resuelto por el responsable del proyecto: cada requisito puntúa o no, decidido por el administrador desde la app (`requisito_version.puede_puntuar`), en borrador | Proyecto (sección E y VII) | `requisito_version` (§5.15b) |
| R5 | Escala: 1 a 5 o 1 a 10 | Goya (1 a 5, D22) vs proyecto (1 a 10) | **Resuelto por el responsable del proyecto: escala 1 a 5.** `escala_puntaje_version` (H13) |
| R6 | Equidad: quitar puntaje de las demás comparsas o asignar 5 | Goya vs proyecto | Cálculo de puntajes (H14) |
| R7 | Nominados por rubro aleatorio: 3 o 4 | Proyecto: 3. Goya: 4 | **Resuelto por el responsable del proyecto: configurable por el administrador en la aplicación, no fijo en el esquema.** `nominados_maximos` (A13) |
| R8 | Momento en que se nominan los rubros aleatorios | **Resuelto por el responsable del proyecto: antes de abrir la primera noche, en el padrón (H11)**, editables hasta esa apertura | Flujo previo a la planilla (H11) |
| R9 | Consolidación de premios individuales entre jurados y noches | Ambas fuentes: suma y mayor puntaje; el detalle excede el diseño | D6 y H12 |
| R10 | Nombre y función de cada jurado (J1, J2, J3) | Planilla: J1 Vestuario, J2 Puesta en escena, J3 Batería. Proyecto: J1 Baile, J2 Vestuario, J3 Batería | `especialidad` (H6) |
| R11 | «Impacto visual» del carro aparece en J1 y en J3 en la planilla | Planilla modelo (un rubro en dos juradurías) | `objetivo_rubro` por especialidad |

## Criterio de cierre

Cerrar este feature cuando haya un reglamento 2027 aprobado. Para cada R#, registrar la fuente exacta (artículo y página) y la decisión. Luego actualizar `diseno-fisico-evento.md` §4.1, H9 a H16 y `regla_calculo_version`.

Pedir al usuario el reglamento 2027 actualizado como archivo, o confirmar qué fuente rige.
