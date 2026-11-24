---
name: seguridad-api-carnavales
description: Aplicar al modificar autenticación, autorización, sesiones, endpoints, validación, persistencia o auditoría de la API.
---

# Seguridad de la API de Carnavales

Usa esta guía junto con `AGENTS.md` y la documentación vigente de
`docs/authentication/`. La API es la autoridad funcional; no des por segura una
operación solo porque el cliente o middleware de interfaz la oculte.

## Revisión de cada ruta

- Deriva identidad y permisos de la sesión autenticada; no confíes en campos de
  usuario, rol o permisos del cuerpo, query o cabeceras controlables por cliente.
- Comprueba autenticación, rol y contexto/ownership en el servidor para cada
  operación protegida.
- Valida forma, tipo, tamaño y rango de las entradas antes de usarlas.
- Usa consultas parametrizadas y transacciones donde una operación deba ser
  atómica. No construyas SQL concatenando datos externos.
- Mantén respuestas de error consistentes; no reveles SQL, secretos, stack traces
  ni detalles internos.
- Protege sesiones y secretos; nunca registres contraseñas, tokens de sesión,
  códigos OTP ni credenciales.
- Conserva rate limiting y controles de origen existentes, en especial en
  autenticación, recuperación y envío de códigos.

## Integridad y trazabilidad

- Las acciones sensibles deben dejar evidencia auditable sin incluir secretos;
  los registros de auditoría son append-only.
- Cambios persistentes de esquema deben ir en migraciones versionadas y
  reproducibles, no en SQL ad hoc del código de aplicación.
- Operaciones reenviables deben ser idempotentes mediante un identificador
  estable; nunca dedupliques usando solo timestamps.
- No agregues edición o eliminación convencional de puntuaciones confirmadas.
  Toda corrección debe preservar la evidencia original y seguir un mecanismo
  aprobado.
- Antes de implementar reglas de desempate, impugnación, votos fuera de término
  o excepciones sin definir, detente y señala la decisión/documentación que falta.

## Validación y pruebas

- Añade pruebas para acceso anónimo, rol/contexto no autorizado, entrada inválida
  y resultado permitido. Comprueba los límites tanto en API como en persistencia
  cuando aplique.
- Para operaciones críticas, considera duplicación/reintentos, concurrencia,
  rollback e inmutabilidad.
- Usa exclusivamente una base descartable para las pruebas que necesiten
  PostgreSQL.
- Ejecuta las pruebas pertinentes y reporta límites de cobertura; una revisión
  estática no equivale a una auditoría de seguridad formal.

## Origen y precedencia

Guía específica del proyecto, derivada de sus invariantes en `AGENTS.md` y del
flujo implementado descrito en `docs/authentication/`. En caso de diferencia,
prevalecen esas fuentes y las decisiones funcionales aprobadas, no esta skill.
