# Guía de uso

Esta guía cubre el acceso, la administración de cuentas y el ciclo operativo
completo de una edición hasta P6D: configuración y apertura, votación del Jurado
sin conexión, suplencias, cierre de noche, penalizaciones digitales, cierre
total, cálculo/publicación de resultados y emisión de actas oficiales.

Para instalar y arrancar los servicios, consulta el [README principal](../README.md),
la guía de la [API](../api/README.md) y la del [cliente](../client/README.md).

## 1. Preparación inicial por una persona operadora

1. Configura `api/.env` y PostgreSQL según la guía de la API. No compartas ese
   archivo ni pongas secretos en la documentación.
2. Desde `api/`, instala dependencias y aplica las migraciones con
   `npm ci` y `npm run migrate`.
3. Crea el primer administrador con `npm run bootstrap-admin`. El comando pide
   nombre, correo y contraseña en una terminal interactiva; la contraseña no se
   muestra mientras se escribe. No puede usarse sin TTY.
4. Configura `EMAIL_PROVIDER=console` para desarrollo local. Los códigos OTP y
   enlaces aparecerán en la terminal de la API. Para enviar correo mediante
   Gmail, configura `EMAIL_PROVIDER=gmail`, `GMAIL_USER` y
   `GMAIL_APP_PASSWORD` fuera del repositorio.
5. Arranca la API y el cliente. La interfaz se abre en la dirección que muestra
   Vite (por defecto `http://127.0.0.1:5173`).

El inicio del primer administrador también requiere OTP. Si se usa `console`,
consulta la terminal de la API para obtener el código.

## 2. Iniciar y cerrar sesión

1. En **Iniciar sesión**, ingresa correo y contraseña y pulsa **Continuar**.
2. La aplicación envía automáticamente un código de seis dígitos al correo (o
   lo muestra en la consola si se usa `EMAIL_PROVIDER=console`).
3. Escribe el código en **Código de acceso** y pulsa **Verificar**.
4. El código vence a los 3 minutos y permite hasta 5 intentos. Se puede pedir
   otro cuando termine la cuenta regresiva de 30 segundos. Hay además un límite
   de 5 solicitudes por IP cada 10 minutos.
5. Para salir, pulsa **Cerrar sesión**. Se cierra la sesión en el servidor y se
   borra la selección de rol de esa pestaña.

Si ves “Correo o contraseña incorrectos”, comprueba las credenciales. Si el
código venció o no coincide, solicita uno nuevo. Si no llega el correo, en
desarrollo revisa la terminal de la API; en Gmail verifica la configuración del
proveedor.

## 3. Elegir un rol

Si la cuenta tiene un solo rol, se usa directamente. Si tiene varios, selecciona
uno en **Elegí con qué rol entrar** y pulsa **Entrar con este rol**. Puedes usar
**Cambiar rol** para elegir otro. La selección se guarda solo en la sesión de la
pestaña; no asigna permisos nuevos.

**Administrador** gestiona la configuración, las asignaciones, el retiro o
eliminación de ediciones y la consulta de resultados post-cierre. **Jurado**
completa y confirma sus planillas. **Escribano** supervisa y cierra jornadas
competitivas, registra/anula penalizaciones digitales, ejecuta el cierre total
de la votación y calcula, resuelve empates y publica los resultados oficiales.
No hay un panel de votación para el rol **Comisario**.

## 4. Invitar y administrar cuentas (Administrador)

Con una cuenta que tenga el rol **Administrador**:

### Crear y gestionar invitaciones

1. En **Usuarios e invitaciones → Invitaciones**, escribe el correo y selecciona
   el **Rol inicial**.
2. Pulsa **Invitar**. La persona recibirá un enlace si el proveedor de correo
   está configurado. En desarrollo con `console`, copia el enlace de la terminal
   de la API y compártelo de forma segura.
3. El enlace dura 72 horas y solo se puede usar una vez.
4. Usa **Filtrar** para limitar la lista por estado o correo.
5. En invitaciones pendientes o vencidas, pulsa **Reenviar** para invalidar el
   enlace anterior y emitir otro. En las pendientes, **Revocar** invalida el
   enlace.

Si aparece que el correo no pudo enviarse, la invitación queda creada como
pendiente. Corrige la configuración de correo y usa **Reenviar** desde la lista.
Una invitación aceptada no puede reenviarse ni revocarse.

### Aceptar una invitación

La persona invitada abre el enlace, ingresa su nombre y crea una contraseña de
al menos 8 caracteres; luego pulsa **Crear cuenta**. La cuenta no inicia sesión
automáticamente: vuelve al acceso y debe autenticarse con contraseña y OTP.

Si el enlace venció, se usó o fue revocado, pide al administrador una invitación
nueva.

### Buscar usuarios, asignar roles y eliminar cuentas

1. En **Usuarios**, busca por nombre o correo y recorre las páginas con
   **Anterior** y **Siguiente**.
2. Para agregar un rol, selecciónalo en la fila de la persona y pulsa
   **Asignar**. Para retirar uno, pulsa **Quitar** junto al rol.
3. La columna **Sesión activa** indica si existe una sesión no vencida según la
   base de datos.
4. Para eliminar una cuenta, pulsa **Eliminar** y luego **Confirmar eliminación**.
   La acción es definitiva y elimina sus sesiones y asignaciones.

**Precauciones:** no intentes eliminar al primer administrador: la base lo
protege. La interfaz permite que administradores posteriores se quiten su propio
rol o eliminen su propia cuenta; evita hacerlo accidentalmente. **Quitar** y
**Revocar** se ejecutan al pulsarlos, sin una segunda confirmación. Los cambios
de rol afectan la autorización de las siguientes peticiones.

## 5. Recuperar una contraseña

1. En **Iniciar sesión**, pulsa **¿Olvidaste tu contraseña?**.
2. Escribe tu correo y pulsa **Enviar enlace**. La confirmación no indica si la
   cuenta existe.
3. Abre el enlace recibido (o el que aparece en la consola durante el desarrollo)
   y establece una contraseña nueva de al menos 8 caracteres.
4. Pulsa **Guardar contraseña** y luego **Ir al acceso**. El enlace dura una hora
   y no se puede volver a usar.
5. Inicia sesión con la nueva contraseña y completa el OTP. Al cambiarla se
   revocan las sesiones anteriores de esa cuenta.

## 6. Operar una noche de votación

El panel de Administración cuenta con un menú lateral organizado por etapas
(**Control de votación** y **Usuarios e invitaciones**). En **Ediciones** podés
buscar, filtrar por estado, crear, **Retirar** (con confirmación en modal,
conservando datos para auditoría) o **Eliminar** una edición completa.

Al entrar en **Administrar evento** sobre una edición se abre un asistente no
lineal en 4 etapas:

1. **Jornadas y especialidades:** alta de noches competitivas/premiación y
   especialidades (código automático).
2. **Categorías y rubros:** rubros nominativos o aleatorios, categorías
   opcionales para agruparlos (alta con orden automático, borrado solo sin
   rubros asignados) y asignación de especialidades por rubro. La versión del
   reglamento se crea automáticamente; esta etapa es donde definís su contenido.
   La escala `1–5` se aplica automáticamente; no hay que elegirla.
3. **Comparsas y orden:** alta de comparsas (`PRIMERA` / `AGRUPACION`, con logo
   visual opcional PNG/JPEG/WebP de hasta 300 KB que se muestra en la planilla
   del Jurado), figuras nominadas en un solo paso (para rubros individuales
   como Reina), sujetos `GRUPO` con sus integrantes (altas y bajas con
   confirmación) y una representación textual opcional por sujeto, y orden de
   salida por jornada en `DRAFT` (guardado protegido por modal).
4. **Planilla y habilitación:** botón único **Preparar y sincronizar planillas**
    (crea automáticamente los sujetos de comparsa, genera la planilla base y
    guarda las selecciones por noche), vista previa, acceso opcional para
    **Ajustar excepciones por noche**, publicación de versión cuando el checklist
    esté completo y apertura de edición y jornadas con confirmación en modal.
    Al abrir la primera jornada se muestra un aviso persistente de congelación
    del reglamento y padrón.

Usa **Volver a ediciones** para cambiar de año. En **Ediciones**, **Eliminar**
borra la edición completa tras confirmar en un modal. Se bloquea solo si una
noche competitiva está en votación. La eliminación es definitiva y no deja una
constancia nueva.

1. **Administrador:** elige la noche al crear una asignación. El selector oculta
   a los jurados con una asignación activa en esa misma noche, pero no en otras;
   las asignaciones revocadas no los excluyen. Si se usará el flujo de suplencias,
   registra dos suplentes por asignación antes de abrir la noche. Guarda las
   filas definitivas por noche y especialidad. La apertura congela las filas y
   el registro de planillas esperadas.
2. **Jurado:** abre su asignación con conexión. La interfaz guía la evaluación
   ítem por ítem (mostrando el logo de la comparsa cuando está cargado) con
   confirmación por voto. Si la conexión se corta con la planilla abierta, puede
   seguir puntuando y confirmar. **Pendiente de recepción** significa que está
   guardada en el dispositivo; **Recibida** significa que el servidor dio acuse
   y el navegador lo guardó. Para volver a abrirla usa el mismo perfil del
   navegador y necesita conexión.
3. **Escribano:** en la **Mesa de Escribano** (con barra lateral por etapas),
   entra en **Cierre de noche**, selecciona la noche y consulta su estado. Si
   falta un acuse, puede pulsar **Actualizar estado**. Cuando se habilite
   **Cerrar noche**, confirma la acción en el diálogo. El cierre no se puede
   deshacer y no muestra puntajes ni conteos.

### Penalizaciones, cierre total, resultados y actas (P6A–P6D)

Desde la barra lateral de la **Mesa de Escribano**:

- **Penalizaciones digitales (P6B):** mientras la edición está `OPEN`, el
  Escribano puede registrar penalizaciones (`RETRASO_INGRESO`,
  `RETRASO_SALIDA`, `EXCESO_SHOW_BATERIA`, `MINIMO_INTEGRANTES`) indicando
  motivo y referencia de acta, o anularlas de forma lógica (append-only) con
  confirmación en modal. Al cerrar la votación completa quedan congeladas.
- **Cierre total de la votación (P6A):** una vez cerradas todas las noches
  competitivas puntuables y sin ninguna noche competitiva en `OPEN`, el
  Escribano confirma el cierre total en modal. La transición es irreversible,
  congela nuevas escrituras y habilita el escrutinio.
- **Resultados y publicación (P6C):** solo disponible tras el cierre total. El
  Escribano calcula un snapshot versionado de resultados, resuelve manualmente
  cualquier empate en primer puesto (con motivo y referencia de acta, sin
  modificar votos) y publica el resultado oficial. Ningún puntaje se muestra
  antes del cierre total.
- **Consulta post-cierre (Administrador):** desde la sección **Resultados** del
  panel de Administración (solo lectura), puede consultar snapshots y puntajes
  detallados una vez cerrada la votación completa. El rol **Jurado** nunca
  accede al escrutinio ni a puntajes ajenos.
- **Actas oficiales (P6D):** sobre un resultado publicado, el Escribano emite
  un acta en PDF y CSV con hash SHA-256 por archivo. Cada emisión crea una
  versión nueva e inmutable; el reenvío con el mismo `operationId` no duplica
  el acta. Escribano y Administrador pueden listar, descargar y verificar la
  integridad de las versiones. El acta incluye clasificación, desglose por
  rubro, penalizaciones y resoluciones de empate, pero nunca notas individuales
  por jurado.

### Si hay que activar un suplente

- Antes de abrir la planilla para editar, Administración puede activar a uno
  de los suplentes registrados directamente. Con suplencias, solo el jurado
  activo tiene acceso y un solo dispositivo puede editar.
- Si la planilla ya se abrió para editar, el jurado saliente usa
  **Preparar traspaso** y confirma **Bloquear y guardar borrador**. Si falla
  la conexión, usa **Reintentar guardar borrador**. Administración no puede
  activar al suplente hasta que ese dispositivo confirme el acuse. Si el
  dispositivo no está disponible, el relevo queda bloqueado.
- El suplente completa solo las filas pendientes. Las notas heredadas no se
  muestran ni se editan; el servidor conserva su autoría. Sigue siendo una
  única planilla esperada.
- Una planilla ya confirmada localmente o recibida no se traspasa para
  edición. Si todavía está pendiente de recepción, envíala desde el perfil
  en que se confirmó.

## 7. Límites de la aplicación

- La interfaz no permite registrar cuentas libremente; el alta se inicia por
  invitación y la primera cuenta se crea con el comando de bootstrap.
- Queda pendiente un eventual flujo digital de impugnaciones (diferido post-v1).
- Una noche sin instantánea verificable, sin planillas esperadas o con una
  planilla pendiente no se puede cerrar. No hay un mecanismo aprobado de
  excepción ni de reasociación de reemplazos históricos.
- No hay suspensión administrativa de cuentas. Las operaciones sensibles de
  votación, incluidos los relevos y el cierre de noche, tienen auditoría.
- Antes de usarla fuera de desarrollo, configura un proveedor de correo seguro,
  HTTPS y los valores de proxy conforme al despliegue.
