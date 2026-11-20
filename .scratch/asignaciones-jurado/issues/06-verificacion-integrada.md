# 06: Verificación integrada de extremo a extremo

**What to build:** Recorrer la gestión de asignaciones desde la interfaz real hasta PostgreSQL, con sesión y segundo factor reales, y comprobar la trazabilidad de las operaciones sensibles.

**Blocked by:** Ticket 05.

**Estado:** registro histórico de la verificación inicial. La lectura del
Jurado y el cierre según las planillas esperadas se implementaron después.
Los casilleros y las notas de abajo describen lo que se verificó en este ticket,
no el estado actual. Consulta las APIs del [Jurado](../../../docs/voting/jurado-api.md)
y de [cierre de noche](../../../docs/voting/cierre-noche-api.md).

- [x] Prueba estilo `api/test/ediciones-flujo.test.js`: `createApp` real, Better Auth con OTP capturado, cookies, PostgreSQL descartable. Implementada en `api/test/asignaciones-flujo.test.js`. Alcance: API → sesión real → PostgreSQL; sin navegador (el modal de confirmación de la interfaz está cubierto en el ticket 05).
- [ ] Verificar que el Jurado solo ve noches/especialidades con asignación activa (la validación de voto completo se coordina con `votacion-offline`).
- [ ] Verificar que el cierre usa el conjunto correcto de planillas esperadas derivadas de las asignaciones (se coordina con `cierre-resultados`; no implementar cierres).
- [x] Verificar auditoría de alta, revocación y reemplazo sin credenciales, tokens ni OTP en los registros.
- [x] Ejecutar la suite completa de `api/` y `client/` al finalizar. Evidencia del 2026-11-19: desde `api/`, `node <helper de BD descartable> test/*.test.js` → **143/143**; desde `client/`, `npm test` → **39/39**. Nota: sin `TEST_DATABASE_URL` las pruebas de base se omiten (`skip`); el helper temporal la define apuntando a una base `carnavales_test_<hex>` que se elimina al terminar.

## Pendiente y por qué

- **Historia 8 del spec** («Jurado ve solo noches y especialidades con asignación activa»): no existe un endpoint propio del Jurado ni el modelo de planillas; la API solo expone catálogos administrativos. Implementarlo implicaría definir la lectura del Jurado, su respuesta y la regla de voto completo, hoy marcada como pendiente en `AGENTS.md` §1 y en las decisiones D9–D12. No se inventó esa interfaz.
- **Historia 10 del spec** («las asignaciones definen las planillas esperadas para el cierre»): no hay modelo de planillas ni operación de cierre. La migración 0007 solo crea las asignaciones como base de esas planillas; verificar el cierre requeriría implementarlo, explícitamente fuera de alcance del ticket.

## Comentarios

- 2026-11-19: la prueba nueva usa `bootstrapFirstAdmin`, `createAuth` con `sendOTP` capturado, inicio de sesión con contraseña + OTP y la cookie resultante. Recorre `GET /jurados`, `/noches`, `/especialidades`, alta, listado, reemplazo y revocación contra la app real, y después consulta PostgreSQL directamente.
- 2026-11-19: la persistencia comprobada es de **dos** filas de asignación: la original y la creada por el reemplazo. Ambas quedan `REVOCADA`, con `creada_por` y `revocada_por` iguales al administrador de la sesión. No se borra evidencia.
- 2026-11-19: la auditoría comprobada es de cuatro eventos (`asignacion_creada` ×2, `asignacion_reemplazada`, `asignacion_revocada`), todos con `actor_id` de la sesión y `entidad_tipo = asignacion_jurado`. Se serializan las filas y se descarta que contengan `otp`, `token`, `password`, `contraseña`, `secreto` o `código`.
- 2026-11-19: el actor sale de la cookie real de Better Auth, nunca de un campo enviado por el cliente. Las pruebas anteriores con sesión simulada cubren `401`/`403`; esta cubre la identidad real de extremo a extremo.
- 2026-11-19: la parte de interfaz con confirmación explícita quedó cubierta en el ticket 05 con API inyectada; este ticket se limita a la cadena API → sesión real → PostgreSQL. No se agregó automatización de navegador.
- 2026-11-19: no se hicieron cambios de producción. La única incorporación es la prueba de integración y un helper de tests; los dos puntos pendientes se dejan marcados para no presentar como verificado lo que aún no existe.
- 2026-11-19: la revisión de estándares detectó que `puertoLibre`, `cookiesDe` e `iniciarSesion` eran copia de `ediciones-flujo.test.js`. Se extrajeron a `api/test/helpers/auth-flujo.js` y ambos tests de flujo los importan; `iniciarSesion` recibe ahora las credenciales como argumento.
- 2026-11-19: la revisión de spec señaló que comprobar secretos sobre cuatro columnas elegidas a mano era débil. La auditoría se consulta con `SELECT *`, se verifica el par `operación:entidad_id` de los cuatro eventos y se aplica el regex a la fila completa. El alta envía además un campo `creadaPor` ajeno para comprobar que el actor de la auditoría sigue siendo el de la sesión.
- 2026-11-19: la revisión pidió acotar el ítem de la prueba E2E: cubre la cadena API/sesión/PostgreSQL, no la interfaz, que se validó con API inyectada en el ticket 05. Queda dicho en el checkbox y en el estado del ticket.
