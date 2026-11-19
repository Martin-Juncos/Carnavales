# Especificación: cierre, penalizaciones y resultados oficiales

**Estado:** `ready-for-agent` para revisión y descomposición. La fórmula definitiva, los desempates y las excepciones reglamentarias no están aprobados.

## Problema

El proyecto todavía no implementa el cierre de la votación ni la generación de resultados y documentos oficiales. Es necesario impedir cierres prematuros, preservar el voto original y separar las penalizaciones de la evaluación artística.

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

### Bloqueos antes de implementar las partes afectadas

- Decisión recibida el 2026-11-19: los actores de los cierres son el Jurado (planilla) y el Escribano (noche y votación completa). No se crea el rol `FISCAL`. Esto contradice el texto anterior de este spec y la mención del Fiscal en `AGENTS.md`; el usuario decidió expresamente usar solo `ESCRIBANO`.
- Resolver D10: condiciones precisas y transiciones para cierre de planilla, noche y votación completa.
- Resolver D14: autoridad, autorización, evidencia y flujo digital de registro de penalizaciones.
- Resolver D16: procedimiento oficial de desempate.
- Resolver D17 y D18: impugnaciones, anomalías y votos fuera de término.
- Resolver D20 y D21: necesidad y acceso a planillas imprimibles, y política de conservación.
- Resolver D24: fórmula general de comparsa y tratamiento de rubros nominativos y carros.
- Aprobar el diseño físico, las restricciones de integridad y las migraciones antes de implementarlas.
- Los cierres que dependen de planillas recibidas, la inmutabilidad del voto, la ocultación de puntajes y el cálculo versionado son invariantes confirmadas y no deben debilitarse para facilitar la operación.
