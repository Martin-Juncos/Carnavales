// Registro de auditoría compartido por los módulos. Escribe dentro de la transacción del
// llamador: si la operación revierte, la auditoría también.
export async function registrarAuditoria(client, { actorId, operacion, entidadTipo, entidadId, edicionId }) {
  await client.query(
    `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id, edicion_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, operacion, entidadTipo, entidadId, edicionId ?? null],
  );
}
