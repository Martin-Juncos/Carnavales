# Especificación: cierre, penalizaciones y resultados oficiales

**Estado actual:** el [cierre de noche](../../docs/voting/cierre-noche-api.md)
está implementado (P5). El 2026-11-24 se aprobaron las decisiones funcionales v1
para desbloquear P6 (cierre total, penalizaciones digitales, motor de cálculo v1,
resolución manual de empates y actas oficiales PDF/CSV con SHA-256). Queda
pendiente aprobar el diseño físico y las migraciones antes de implementar.

## Problema

El proyecto todavía no implementa el cierre total de la votación ni la
generación de resultados y documentos oficiales. La propuesta siguiente
conserva el alcance original, incluido lo ya entregado en P5.

## Solución

Permitir que el Jurado cierre su planilla y que el Escribano realice los cierres posteriores, sin crear el rol `FISCAL`. Una noche no se cierra mientras falten planillas esperadas por recibir en el servidor. Una vez habilitado por las reglas aprobadas, el sistema calcula resultados inmutables, mantiene los puntajes numéricos ocultos hasta el cierre total y permite generar representaciones oficiales verificables.

Las penalizaciones se registran como evidencia separada del puntaje artístico. No se publican ganadores cuando dependan de fórmulas o desempates todavía no aprobados.

## Historias de usuario

1. Como Jurado, quiero cerrar mi planilla completa, para indicar que terminé de cargar mis puntajes.
2. Como Escribano, quiero cerrar una noche, para certificar que la operación terminó bajo las responsabilidades definidas.
3. Como Escribano, quiero que el cierre se bloquee mientras haya planillas esperadas no recibidas oficialmente, para no cerrar con evidencia incompleta.
4. Como Escribano, quiero que la interfaz muestre estados de recepción sin puntajes numéricos antes del cierre total, para supervisar la operación sin revelar votos.
5. Como Escribano, quiero que el cierre de una noche no implique cerrar toda la votación, para conservar las etapas y responsabilidades separadas.
6. Como Escribano, quiero que el cierre de la votación completa solo ocurra cuando todas las noches estén cerradas, para impedir resultados finales prematuros.
7. Como responsable autorizado, quiero registrar una penalización con la autoridad y evidencia requeridas, para aplicar una regla aprobada sin alterar el puntaje artístico original.
8. Como Jurado, quiero que las penalizaciones no cambien mis puntuaciones artísticas, para mantener separadas ambas evaluaciones.
9. Como responsable autorizado, quiero que el sistema calcule resultados desde votos recibidos y la versión de reglas correspondiente, para conservar la trazabilidad de cada resultado.
10. Como responsable autorizado, quiero que un recálculo cree un nuevo snapshot en lugar de sobrescribir uno anterior, para preservar el historial de resultados.
11. Como responsable autorizado, quiero que los resultados numéricos permanezcan ocultos hasta el cierre total, para respetar la política de confidencialidad confirmada.
12. Como responsable autorizado, quiero registrar la resolución oficial de un empate antes de publicar resultados afectados, para que el sistema no invente un criterio de desempate.
13. Como Escribano, quiero generar una representación oficial del resultado en el formato aprobado, para certificarla y conservarla.
14. Como auditor, quiero verificar el hash SHA-256 calculado sobre los bytes exactos del archivo oficial, para detectar cambios posteriores respecto del archivo registrado.
15. Como Administrador, quiero que una nueva versión de un documento oficial cree un archivo y un registro nuevos, para no sobrescribir silenciosamente evidencia ya emitida.
16. Como responsable de auditoría, quiero conservar evidencia append-only de cierres, penalizaciones, cálculos, resoluciones y publicaciones, para reconstruir las acciones críticas.

## Decisiones de implementación

- El cierre de noche requiere que todas las planillas esperadas hayan sido recibidas oficialmente por el servidor. Una confirmación local pendiente no satisface este requisito.
- El Escribano realiza los cierres posteriores a la planilla del Jurado, según la decisión del 2026-11-19: no se crea el rol `FISCAL`. Las condiciones completas de cada etapa deben permanecer separadas; una noche cerrada no equivale a la votación completa cerrada.
- Ningún rol recibe puntajes numéricos antes del cierre total. Ocultarlos solo en la interfaz no basta: la API también debe impedir su acceso.
- Los votos confirmados permanecen inmutables. Las correcciones excepcionales, si se aprueban, no sobrescriben ni eliminan el voto original.
- Las penalizaciones se registran separadas de la evaluación artística. Para 2027 se adoptan provisionalmente las siguientes magnitudes del reglamento aportado: 0,50 puntos por minuto de retraso de ingreso o salida; 0,50 puntos por minuto de exceso del show de batería descontados de ese rubro; más de 30 minutos de retraso implica ceder el turno, desfilar al final y aplicar sanción por 30 minutos; no alcanzar el mínimo de integrantes impide puntuar para premios de comparsa, pero permite puntuar premios individuales.
- El cálculo de resultados usa votos recibidos y la versión del reglamento aplicable. Un recálculo crea un snapshot nuevo e inmutable.
- La publicación solo puede apuntar a un cálculo completo, con noches cerradas y las resoluciones de empate requeridas registradas.
- Si se aprueban PDF o CSV como documentos oficiales, el hash SHA-256 se calcula sobre los bytes exactos generados. Una nueva versión no reemplaza el archivo ni registro previo.
- La API autoriza cada operación según sesión y rol. PostgreSQL preserva relaciones e integridad; auditoría es append-only y no registra credenciales, secretos ni datos sensibles innecesarios.

## Decisiones de pruebas

- Usar pruebas de comportamiento a través de las interfaces administrativas y de resultados, con persistencia real en PostgreSQL.
- Verificar que una noche no pueda cerrarse si falta una planilla esperada o si solo está confirmada localmente.
- Verificar permisos y actores requeridos en cierres; un actor no autorizado no puede completar una transición.
- Verificar que los puntajes numéricos no aparezcan en respuestas de API ni en la interfaz antes del cierre total.
- Verificar que las penalizaciones dejen evidencia separada y no modifiquen puntajes artísticos.
- Verificar que cada recálculo preserve snapshots anteriores y que no se publique un resultado incompleto.
- Verificar que un empate no se resuelva automáticamente sin una resolución oficial registrada.
- Para documentos oficiales, verificar el hash sobre los bytes exactos y que una nueva versión no altere el archivo ni el registro anteriores.
- Verificar auditoría de cada operación crítica y ausencia de secretos en sus registros.
- Como antecedentes existen pruebas de rutas administrativas, integridad de migraciones y flujos del cliente.

## Fuera de alcance

- Definir un procedimiento de desempate, impugnación, voto tardío o corrección excepcional.
- Decidir la política legal de retención o eliminación de votos, auditoría, actas y documentos.
- Decidir si PDF imprimible es requisito de 2027, cuándo se puede consultar o cómo se ocultan puntajes en él.
- Determinar la fórmula final del resultado general por comparsa antes de resolver D24.
- Cambiar las reglas de puntuación o las penalizaciones confirmadas sin una decisión explícita.

## Notas adicionales

### Decisiones recibidas el 2026-11-24 y próximos pasos

- **Actores (`D10`):** Jurado (planilla) y `ESCRIBANO` (cierre de noche, cierre total, penalizaciones, resolución manual de empates y emisión de actas oficiales). No se crea el rol `FISCAL`.
- **Cierre total (`D10`):** requiere al menos una noche `COMPETENCIA` con `cuenta_para_puntaje = true`, todas esas noches en `CLOSED` y ninguna noche `COMPETENCIA` en `OPEN` (`PREMIACION` no bloquea). Sin cierre de comparsa separado. Transición irreversible: bloquea abrir nuevas noches o recibir votos.
- **Visibilidad post-cierre (`D15`):** antes del cierre total ningún rol ve puntajes numéricos; tras el cierre total solo `ESCRIBANO` y `ADMINISTRADOR` consultan puntajes detallados y resultados.
- **Política estricta v1 (`D9`, `D11`, `D12`, `D18`):** sin cierre excepcional por planilla faltante, sin carga de contingencia ni corrección digital de votos; tras cerrar una noche, cualquier envío tardío se rechaza.
- **Penalizaciones digitales (`D14`):** solo `ESCRIBANO` registra y anula penalizaciones (con tipo, noche, comparsa, minutos si aplica, motivo obligatorio y referencia de acta/autoridad), habilitadas hasta el cierre total y congeladas al cerrar la votación completa; toda anulación es lógica y append-only.
- **Motor de cálculo v1 (`R1`, `D24`, `D6`/`R9`):** adopta la base Goya (titulada 2026) con las reglas confirmadas (`D22` escala 1–5, `D24` rubros fijos + mejor nominativo + 2 mejores carros, `D13` noches puntuables), parametrizado por versión de reglamento. Premios individuales: suma entre jurados y noches puntuables por `sujeto × rubro × especialidad` (un participante puede sumar en varios rubros distintos, sin duplicar puntaje dentro de un mismo rubro).
- **Empates e impugnaciones (`D16`, `D17`):** sin desempate automático; ante empate en puesto/premio clave se bloquea la publicación hasta registrar resolución manual del `ESCRIBANO` con motivo y referencia de acta (sin alterar votos). Impugnaciones (`D17`) quedan fuera del flujo digital v1.
- **Actas y retención (`D20`, `D21`):** actas oficiales en PDF y CSV con hash SHA-256 versionadas sin sobrescritura tras el cierre total; planilla imprimible individual reservada solo a `ESCRIBANO`/`ADMINISTRADOR` después del cierre total (o fase posterior). Conservación indefinida de solo lectura sin purga automática; la única baja física sigue siendo la eliminación completa de una edición por `ADMINISTRADOR` fuera de votación activa (`DATABASE_URL_ELIMINAR_EDICION`), manteniendo bloqueado todo borrado parcial.
- **Único bloqueo técnico restante antes de codificar P6:** aprobar el diseño físico, las restricciones de integridad, los contratos API y las migraciones por etapa (P6A cierre total, P6B penalizaciones, P6C cálculo/empates/publicación, P6D actas oficiales PDF/CSV con SHA-256).
- Los cierres que dependen de planillas recibidas, la inmutabilidad del voto, la ocultación de puntajes y el cálculo versionado son invariantes confirmadas y no deben debilitarse para facilitar la operación.
