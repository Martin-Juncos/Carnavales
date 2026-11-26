# AGENTS.md — Carnavales 2027

## Proyecto

**Carnavales 2027** es un sistema web de votación digital para comparsas de carnaval.

La solución debe funcionar como una aplicación web responsive, con una **PWA para jurados**, backend API y persistencia en PostgreSQL.

Actores principales:

* **Jurado:** registra puntuaciones y cierra su planilla.
* **Escribano:** supervisa el desarrollo de la votación, cierra la noche y la votación completa, consulta resultados, certifica actas y participa en penalizaciones/auditoría. No se crea el rol `FISCAL`.
* **Administrador:** configura el concurso, usuarios, comparsas, rubros y operación general.

El sistema debe priorizar:

* integridad de votos;
* trazabilidad;
* resiliencia ante cortes de conectividad;
* operaciones idempotentes;
* seguridad;
* auditoría;
* facilidad de uso durante el evento.

---

## Estructura principal

```text
carnavales2027/
├── api/            # Backend y acceso a PostgreSQL
├── client/         # Frontend React/Vite
├── docs/
│   ├── authentication/
│   └── voting/      # Diseños; no son implementación
├── AGENTS.md
├── MEMORY.md
└── README.md
```

Este repositorio actualmente no contiene `api/AGENTS.md` ni `client/AGENTS.md`.
Si se agregan en el futuro, sus reglas más específicas prevalecerán dentro de
cada módulo.

---

# 1. Fuentes de verdad y documentación disponible

Antes de modificar comportamiento funcional, consultar las fuentes existentes y aplicables:

1. Este `AGENTS.md`: invariantes generales de dominio, seguridad e integridad.
2. `docs/README.md` y documentos enlazados: decisiones, diseños y estado de
   implementación. Distinguen regla confirmada, comportamiento implementado y
   decisión pendiente; **no convierten una inferencia en reglamento aprobado**.
3. `README.md`, `api/README.md`, `client/README.md` y `MEMORY.md`: guías de
   entrada y contexto durable; no autorizan alterar una regla superior.
4. Código, migraciones y pruebas: evidencia del comportamiento actual cuando se
   necesita verificar una afirmación técnica.

**Estado documental vigente:** `docs/authentication/` documenta el flujo de
autenticación implementado y `docs/voting/` contiene diseños de votación. No hay
reglamento funcional general aprobado, ERD exhaustivo ni OpenAPI completo. Estas
páginas no sustituyen esas aprobaciones. No se versiona actualmente
`docs/historico/`; no cites documentos que no estén en el repositorio.
No cites documentos inexistentes ni presentes como aprobada una decisión deducida. Si un cambio depende de una regla ausente, ambigua o pendiente, detente y señala el documento/regla que falta; pregunta al usuario o deja el bloqueo identificado. No inventar reglas de negocio que estén marcadas como pendientes.

Especialmente, no asumir reglas para:

* desempates;
* impugnaciones;
* votos fuera de término;
* excepciones reglamentarias no documentadas.

Cuando una implementación requiera una regla inexistente, dejar claramente identificado el bloqueo en lugar de decidirla silenciosamente.

---

# 2. Reglas fundamentales del dominio

## Jurados

El Jurado elige una noche competitiva y una especialidad para las que tenga una asignación activa.

Administración gestiona asignaciones y suplencias. Las altas y el registro de suplentes se hacen en `DRAFT`, incluso si la edición ya está `OPEN`. Después de abrir la noche, solo se permiten relevos por suplencia registrada. Una planilla recibida protege la asignación; un relevo con borrador requiere acuse confirmado desde el dispositivo que abrió la edición de la planilla. Para cambios en estas rutas, consultar [el contrato de asignaciones y suplencias](docs/voting/asignaciones-api.md).

El backend debe validar que la asignación esté activa, que la noche exista y que la comparsa activa pertenezca a esa noche antes de aceptar votos o cierres.

Para Carnavales 2027, rubros y escalas quedan congelados al abrir la jornada y
no se permiten cambios al reglamento después de esa apertura. Las demás
restricciones de cambios administrativos deben respetar la evidencia de las
planillas confirmadas. La excepción confirmada es la eliminación completa de una
edición descrita a continuación; otros casos excepcionales siguen pendientes.

---

## Eliminación completa de una edición

**Política confirmada; implementada en la API y en el panel de Ediciones.** Usa la conexión principal de la API (`DATABASE_URL`), protegida por autorización de `ADMINISTRADOR` en sesión, confirmación explícita en modal y la función transaccional `eliminar_edicion_completa`. El Administrador puede eliminar
físicamente un evento completo (edición), aunque tenga reglamento publicado,
planillas confirmadas, votos o jornadas cerradas. Esta operación es distinta del
retiro operativo, que conserva los datos.

* Exigir autorización de Administrador derivada de la sesión y confirmación
  explícita en un modal que advierta la pérdida definitiva de datos.
* Bloquear la eliminación si alguna jornada competitiva de la edición está
  `OPEN`. Validar esta condición en el backend y protegerla frente a concurrencia.
* Eliminar la edición y todos sus registros propios en una única transacción,
  incluidas configuración, noches, comparsas, asignaciones, reglamentos,
  planillas, puntuaciones y cierres. Si falla un paso, revertir toda la operación.
* Eliminar toda la auditoría atribuible con certeza a esa edición, sin generar
  una constancia nueva de su eliminación. Conservar los registros antiguos cuya
  pertenencia sea ambigua; una coincidencia temporal no prueba pertenencia.
* Conservar cuentas de usuarios, datos compartidos y otras ediciones. Si otra
  edición copió un reglamento de la eliminada, quitar únicamente la referencia
  al origen eliminado, incluso si la copia está publicada o congelada; conservar
  el contenido, estado y demás datos de la copia.
* Mantener la inmutabilidad de votos y las protecciones de auditoría fuera de
  esta operación administrativa completa. No habilitar borrados parciales de
  evidencia ni desactivar globalmente las protecciones de PostgreSQL.

Esta excepción prevalece sobre las reglas de conservación de este documento
únicamente para la eliminación completa de una edición. Autorizar su desarrollo
no autoriza ejecutar borrados ni migraciones sobre datos reales; verificar con
bases descartables y obtener autorización separada para operar en producción.

---

## Comparsas

Las comparsas son administradas por noche.

El Administrador puede crear, ver, modificar, ordenar y borrar comparsas. En operaciones individuales, usuarios, noches, comparsas e ítems solo se borran físicamente si no tienen historial asociado; si hay votos, cierres, penalizaciones, actas, sesiones, auditoría u otras dependencias, el backend debe bloquear el borrado para preservar evidencia. La eliminación completa de una edición se rige por su excepción específica; no incluye el borrado de cuentas de usuarios.

Toda acción administrativa sensible de modificación, borrado, apertura/cierre o guardado de orden debe requerir confirmación explícita en modal antes de llamar a la API.

La interfaz de votación presenta las comparsas activas correspondientes a la noche elegida por el jurado.

---

## Ítems y subítems

Los ítems pueden tener subítems.

Un ítem padre con hijos:

* no recibe una puntuación manual;
* obtiene su resultado mediante la suma de sus hijos.

Un ítem sin hijos es puntuable directamente.

---

## Puntuaciones

Para la competencia de Carnavales 2027, tomando como base provisional el
Reglamento del Carnaval de Ciudad de Goya 2026 aportado, las notas válidas son:

```text
1, 2, 3, 4, 5
```

La decisión separada `No se presentó` se registra con valor 0. El 0 no es una
nota ordinaria.

Una puntuación confirmada debe considerarse **inmutable**.

No implementar operaciones convencionales de edición o eliminación de votos confirmados.

La eliminación completa de una edición es la única excepción administrativa de
borrado definida aquí; no permite modificar ni eliminar votos por separado.

Una anomalía o impugnación debe resolverse mediante mecanismos auditables, nunca mediante modificación silenciosa del voto original.

---

## Totales

No existe descarte automático de nota máxima o mínima en las reglas actualmente confirmadas.

El total de un ítem entre jurados es la suma de las puntuaciones correspondientes.
Para 2027, se puntúa la participación de las tres primeras noches oficiales,
aunque el reglamento base compromete a las comparsas a participar durante cuatro
noches. El resultado general de comparsa debe respetar las reglas específicas
confirmadas de la edición; no se debe reducir automáticamente a una suma plana
si hay rubros nominativos o carros con reglas de cómputo particulares.

Los ítems padre se calculan mediante la suma de sus subítems.

Para Carnavales 2027 se adoptan como base provisional las penalizaciones del
reglamento aportado (titulado 2026): 0,50 puntos por minuto de retraso de
ingreso o salida; 0,50 puntos por minuto de exceso del show de batería,
descontados de ese rubro; más de 30 minutos de retraso implica ceder el turno y
desfilar al final, con sanción por 30 minutos; no alcanzar el mínimo de
integrantes impide puntuar para premios de comparsa, pero permite puntuar premios
individuales. El reglamento indica que estas penalidades no afectan la
evaluación artística del jurado. El flujo digital de autorización, evidencia y
registro debe quedar especificado antes de implementar.

---

# 3. Integridad y consistencia

Toda operación crítica debe estar protegida tanto como sea razonable en:

1. frontend;
2. API;
3. base de datos.

La API es la autoridad funcional.

PostgreSQL es la autoridad final respecto de integridad persistida.

No depender exclusivamente de validaciones del frontend.

---

# 4. Identificadores

Para recursos persistidos en PostgreSQL pueden utilizarse identificadores definidos por el modelo de datos.

Las operaciones originadas en dispositivos que puedan ser reenviadas por problemas de conectividad deben utilizar un identificador estable generado en cliente, por ejemplo:

```text
operationId / UUID
```

Ese identificador debe permitir procesamiento idempotente.

Nunca utilizar timestamps como único mecanismo de deduplicación.

---

# 5. Resiliencia de conectividad

Durante el carnaval pueden existir:

* pérdida de Wi-Fi;
* pérdida de datos móviles;
* timeouts;
* reinicio del navegador;
* suspensión del dispositivo;
* reintentos de requests.

La PWA permite completar y confirmar una planilla sin conexión. La confirmación
local significa únicamente que el dispositivo guardó y bloqueó esa planilla como
pendiente de recepción; no equivale a recepción oficial del servidor. Una
operación solo queda oficialmente recibida cuando la API la acepta o reconoce un
reenvío idempotente equivalente.

Una planilla debe contener todas las puntuaciones requeridas para poder
confirmarse localmente. La interfaz debe distinguir de forma persistente los
estados localmente confirmada/pendiente de recepción y recibida por el servidor.

Si no hay conexión, timeout o API disponible, la interfaz debe mostrar con
claridad el estado local pendiente, sin presentarlo como recibido oficialmente.
La planilla confirmada localmente no admite edición ordinaria. La recepción
usa reintentos acotados y un reintento manual con el mismo `operationId`;
un `409` detiene los reintentos. Consultar [el contrato del Jurado](docs/voting/jurado-api.md)
al cambiar recepción, reintentos o traspaso.

El Escribano solo puede cerrar una noche con una instantánea verificable, no
vacía y todas sus planillas oficialmente recibidas. Un relevo registrado
cubre la misma obligación; no hay excepción ni reasociación histórica
aprobadas. Consultar [el contrato de cierre de noche](docs/voting/cierre-noche-api.md)
al cambiar este flujo. El cierre total y los resultados no forman parte de P5.

---

# 6. Seguridad

Aplicar mínimo:

* HTTPS en producción;
* autenticación fuerte;
* segundo factor mediante código cuando corresponda;
* expiración de códigos;
* rate limiting;
* autorización por rol;
* validación de ownership/contexto;
* validación de input;
* manejo seguro de sesiones;
* protección de secretos;
* logs sin credenciales ni tokens;
* auditoría de operaciones sensibles.

Nunca confiar en campos de rol, usuario o permisos enviados por el cliente.

La identidad y autorización deben derivarse de la sesión autenticada.

---

# 7. Auditoría

Las operaciones críticas deben generar evidencia auditable, salvo la eliminación
completa de una edición según la excepción del apartado 2.

Ejemplos:

* autenticación;
* emisión de voto;
* cierre de comparsa;
* cierre de noche;
* penalización;
* anulación de penalización;
* generación de acta;
* certificación;
* operaciones administrativas sensibles.

Los registros de auditoría deben tratarse como append-only fuera de la excepción
de eliminación completa de una edición.

No escribir secretos, tokens de sesión, códigos 2FA ni información sensible innecesaria dentro del audit log.

---

# 8. Actas y documentos oficiales

Las actas pueden generar representaciones tales como:

* PDF;
* CSV.

Cuando una representación sea considerada oficial debe poder verificarse mediante hash criptográfico, actualmente previsto con **SHA-256**.

El hash debe calcularse sobre los bytes exactos del archivo generado.

Una nueva versión debe producir un nuevo archivo y registro; no sobrescribir silenciosamente un documento previamente emitido.

---

# 9. Código

Priorizar:

* TypeScript cuando forme parte del stack del módulo;
* funciones pequeñas;
* nombres explícitos;
* separación por responsabilidades;
* validaciones centralizadas;
* manejo consistente de errores;
* ausencia de duplicación innecesaria.

Evitar abstraer prematuramente.

No introducir frameworks o dependencias relevantes sin necesidad concreta.

---

# 10. Errores

Los errores esperables deben ser controlados y devolver respuestas consistentes.

Distinguir al menos:

* error de validación;
* no autenticado;
* no autorizado;
* recurso inexistente;
* conflicto;
* operación duplicada/idempotente;
* regla de negocio incumplida;
* error interno.

No exponer:

* stack traces;
* SQL;
* secretos;
* detalles internos de infraestructura

en respuestas de producción.

---

# 11. Testing

Toda funcionalidad crítica debe acompañarse de pruebas adecuadas.

Priorizar cobertura sobre:

* reglas de puntuación;
* permisos;
* idempotencia;
* concurrencia;
* inmutabilidad;
* selección de noche por Jurado;
* conectividad;
* cierres;
* penalizaciones;
* generación/verificación de documentos.

Los tests deben comprobar comportamiento, no detalles accidentales de implementación.

---

# 12. Cambios de base de datos

No modificar el esquema productivo mediante SQL ad hoc dentro del código de aplicación.

Todo cambio estructural debe quedar representado mediante el mecanismo de migraciones elegido por el proyecto.

Las migraciones deben ser:

* versionadas;
* reproducibles;
* revisables;
* compatibles con el historial del repositorio.

---

# 13. Git

Mantener commits pequeños y coherentes.

No incluir:

```text
.env
.env.*
node_modules/
dist/
build/
coverage/
*.log
```

ni archivos con secretos.

No reescribir archivos ajenos al objetivo de la tarea sin necesidad.

---

# 14. Definition of Done mínima

Una tarea se considera técnicamente completa cuando, según corresponda:

* cumple los requisitos funcionales;
* respeta las reglas de negocio;
* respeta RBAC;
* valida entradas;
* maneja errores;
* preserva integridad;
* incluye pruebas;
* no introduce secretos;
* mantiene auditoría cuando corresponde;
* mantiene la documentación/API sincronizada si cambió el contrato.

---

# 15. Prioridad de decisión

Ante conflicto entre implementación y documentación:

Aplicar primero el alcance de la excepción confirmada de eliminación completa de
una edición (apartado 2). Fuera de ese alcance, mantener este orden:

1. preservar integridad de los votos;
2. preservar evidencia y auditoría;
3. respetar las reglas de negocio confirmadas;
4. respetar permisos;
5. mantener compatibilidad de API;
6. mantener experiencia de usuario.

No sacrificar integridad o trazabilidad por conveniencia de implementación.

## Skills de agentes

### Seguimiento de tareas

Los issues y las especificaciones se guardan como archivos Markdown en `.scratch/<funcionalidad>/`. Ver `docs/agents/issue-tracker.md`.

### Documentación del dominio

Este repositorio tiene un único contexto de dominio. Cuando existan, consulta el `GLOSSARY.md` de la raíz y las decisiones pertinentes de `docs/adr/`. Ver `docs/agents/domain.md`.
