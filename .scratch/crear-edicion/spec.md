# Especificación: crear y consultar una edición vacía

## Problema

El Administrador todavía no puede crear una edición del concurso desde la aplicación. La autenticación y la administración de cuentas están implementadas, pero la configuración de eventos continúa en etapa de diseño.

## Solución

Permitir que un Administrador cree una edición vacía indicando nombre y año. Al crearla, la edición queda en estado `CONFIGURING`, tiene una primera versión del reglamento en estado `BORRADOR` y aparece en el listado de ediciones. El año debe ser positivo y único. Si ya existe, la operación informa un conflicto y no deja registros parciales.

## Historias de usuario

1. Como Administrador, quiero crear una edición vacía con un nombre y un año, para comenzar a configurar un concurso.
2. Como Administrador, quiero que el sistema rechace un año que ya pertenece a otra edición, para evitar dos ediciones del mismo año.
3. Como Administrador, quiero que una edición recién creada esté en estado `CONFIGURING`, para distinguirla de una edición abierta.
4. Como Administrador, quiero que la edición nueva tenga una primera versión del reglamento en estado `BORRADOR`, para poder configurarla después.
5. Como Administrador, quiero consultar las ediciones creadas y sus estados, para saber cuáles están en preparación.
6. Como persona sin autorización de Administrador, no quiero poder crear ni consultar ediciones mediante las operaciones administrativas, para que la configuración quede protegida.
7. Como Administrador, quiero que un intento fallido por año duplicado no deje una edición o versión incompleta, para mantener la consistencia de los datos.

## Decisiones de implementación

- La primera entrega solo admite crear una edición vacía; no copia el reglamento de otra edición.
- La creación de la edición y de su primera versión en borrador debe ser atómica.
- La API es la autoridad funcional y debe autorizar las operaciones usando la sesión autenticada y el rol de Administrador, no datos de identidad enviados por el cliente.
- La interfaz permite crear una edición y consultar el listado con los estados actuales.
- El conflicto por año duplicado debe ser observable para el cliente. Esta especificación no fija un código HTTP ni un texto literal de error.
- Esta especificación describe el comportamiento, pero no aprueba por sí sola el diseño físico de base de datos ni autoriza una migración. El diseño aplicable debe revisarse y aprobarse antes de crearla.

## Decisiones de pruebas

- Las pruebas deben comprobar comportamiento observable por las interfaces públicas, no detalles internos de implementación.
- Verificar creación exitosa y persistencia de la edición y su primera versión.
- Verificar que el listado muestre la edición y ambos estados.
- Verificar que el año duplicado produzca un conflicto y que no persistan registros parciales.
- Verificar que una sesión sin rol de Administrador no pueda usar las operaciones administrativas.
- Cubrir el recorrido de creación y consulta desde la interfaz, además del contrato de la API con PostgreSQL.
- Como antecedente, el repositorio ya cuenta con pruebas de rutas de API, flujos del cliente y migraciones.

## Fuera de alcance

- Copiar el reglamento de una edición anterior.
- Configurar noches, especialidades, rubros, escalas, reglas de cálculo o premios.
- Cargar comparsas, participantes, sujetos evaluables, órdenes o filas de planilla.
- Asignar jurados, votar sin conexión, sincronizar planillas, calcular resultados o generar actas.
- Resolver decisiones reglamentarias que continúan pendientes.

## Notas adicionales

La documentación del flujo de creación y del diseño físico sigue en estado de propuesta/borrador. Las decisiones pendientes no deben inferirse al implementar esta especificación.
