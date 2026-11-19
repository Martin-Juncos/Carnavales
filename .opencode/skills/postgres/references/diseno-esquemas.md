# Diseño de esquemas PostgreSQL

Principios resumidos y adaptados de `design-postgres-tables` de
[Timescale pg-aiguide](https://github.com/timescale/pg-aiguide), licencia
Apache-2.0.

## Modelado e integridad

- Modela primero las entidades, relaciones, cardinalidades y reglas confirmadas.
  Normaliza para evitar duplicación y anomalías; desnormaliza solo con una
  necesidad medida y documentada.
- Define claves primarias, foráneas y restricciones `UNIQUE`, `NOT NULL` y
  `CHECK` que expresen invariantes persistentes.
- Una restricción `CHECK` no rechaza por sí sola `NULL`; combínala con `NOT NULL`
  cuando el valor sea obligatorio.
- Especifica la acción referencial (`RESTRICT`, `CASCADE`, etc.) de cada FK con
  intención. Para Carnavales, no uses cascadas sobre evidencia o entidades con
  historial sin una regla aprobada que demuestre que es seguro.
- PostgreSQL no crea automáticamente índices en las columnas que referencian
  una FK. Evalúa agregarlos según las consultas y el volumen esperados.
- Las secuencias pueden tener huecos por rollback, concurrencia o reinicios. No
  intentes hacer consecutivos los identificadores.
- La base debe reforzar las reglas que la API valida; no dependas del frontend.

## Tipos y convenciones

- Reutiliza primero las convenciones del esquema. En este proyecto hay tablas y
  columnas en español, además de identificadores `text` usados por
  autenticación: no migres a otro estilo o tipo sin una necesidad explícita.
- Todo nombre nuevo de objeto propio del dominio —tablas, columnas, índices,
  restricciones y secuencias— debe estar en español y usar `snake_case`.
  Prefiere términos consistentes con el glosario y los documentos del proyecto.
  Conserva nombres de terceros únicamente cuando la compatibilidad de una
  biblioteca o contrato existente lo requiera.
- Usa `timestamptz` para instantes, `date` para fechas civiles y `interval` para
  duraciones; aclara la semántica temporal antes de elegir.
- Usa tipos numéricos exactos para cantidades que no toleran redondeo binario.
  No asumas que un valor de negocio se puede representar como `float`.
- `text` es adecuado para cadenas sin un límite funcional. Si existe un límite
  de dominio, exprésalo con una validación adecuada en API y/o una restricción
  de base de datos.
- Usa `jsonb` para atributos realmente variables u opcionales, no para ocultar
  relaciones o campos centrales que necesitan claves, restricciones o consultas
  relacionales.
- No agregues enums, extensiones o tipos personalizados solo por conveniencia;
  considera su costo de evolución y compatibilidad con el mecanismo de
  migraciones actual.

## Índices

- Crea índices para patrones de acceso reales: filtros, ordenamientos,
  relaciones y joins frecuentes. Toda estructura de índice también aumenta el
  costo de escritura y almacenamiento.
- El orden de columnas de un índice compuesto importa: prioriza el patrón de
  filtros y ordenamientos que efectivamente usa la aplicación.
- Considera índices parciales o de expresión solo cuando las consultas
  correspondientes puedan aprovecharlos y la mejora justifique el costo.
- No agregues índices hipotéticos ni dupliques los que ya crean una PK o una
  restricción `UNIQUE`. Verifica el esquema y las consultas existentes primero.
- Particionamiento y extensiones son decisiones de escala/operación, no valores
  predeterminados. No particiones tablas pequeñas sin evidencia y plan de
  mantenimiento.

## Antes de cerrar el diseño

1. Comprueba que cada relación cruza recursos del mismo contexto/edición donde
   aplique.
2. Comprueba cómo se preserva el historial al eliminar o desactivar recursos.
3. Revisa nulabilidad, duplicados, valores fuera de rango y comportamiento ante
   inserciones concurrentes.
4. Incluye escenarios de integridad en pruebas de migración/API.
5. Si el diseño depende de una regla funcional pendiente, registra el bloqueo;
   no lo conviertas en una restricción o default arbitrario.
