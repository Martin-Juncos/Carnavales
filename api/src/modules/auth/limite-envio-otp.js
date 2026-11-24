// Límites de envío de códigos OTP, compartidos entre instancias (se guardan en PostgreSQL).
// - Una cuenta espera `esperaCuentaSegundos` entre solicitudes.
// - Una IP puede hacer `maximoPorIp` solicitudes dentro de una ventana de `ventanaIpSegundos`.
// Si alguno de los dos límites se incumple, no se cuenta nada (todo se revierte).
// Devuelve { permitido: true } o { permitido: false, motivo: "cuenta" | "ip" }.
export async function registrarEnvioOtp(
  pool,
  {
    usuarioId,
    ip,
    ahora = new Date(),
    esperaCuentaSegundos = 30,
    maximoPorIp = 5,
    ventanaIpSegundos = 600,
  },
) {
  // Todo el registro corre en una transacción para que los dos límites se evalúen juntos.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Límite por cuenta: la fila se inserta o actualiza solo si ya pasó la espera desde el último envío.
    // Si no pasó la espera, el UPDATE no cambia nada y RETURNING no devuelve filas.
    const cuenta = await client.query(
      `INSERT INTO limite_envio_otp (clave, ultimo_envio, envios)
            VALUES ($1, $2, 1)
       ON CONFLICT (clave) DO UPDATE
              SET ultimo_envio = EXCLUDED.ultimo_envio,
                  envios = limite_envio_otp.envios + 1
            WHERE limite_envio_otp.ultimo_envio <= EXCLUDED.ultimo_envio - make_interval(secs => $3)
        RETURNING clave`,
      [`cuenta:${usuarioId}`, ahora, esperaCuentaSegundos],
    );
    if (cuenta.rowCount === 0) {
      await client.query("ROLLBACK");
      return { permitido: false, motivo: "cuenta" };
    }

    // Límite por IP: dentro de la ventana se cuentan los envíos hasta el máximo;
    // si la ventana ya venció, se reinicia desde este envío.
    const porIp = await client.query(
      `INSERT INTO limite_envio_otp (clave, ventana_inicio, envios)
            VALUES ($1, $2, 1)
       ON CONFLICT (clave) DO UPDATE
              SET ventana_inicio = CASE
                    WHEN limite_envio_otp.ventana_inicio <= EXCLUDED.ventana_inicio - make_interval(secs => $3)
                    THEN EXCLUDED.ventana_inicio
                    ELSE limite_envio_otp.ventana_inicio END,
                  envios = CASE
                    WHEN limite_envio_otp.ventana_inicio <= EXCLUDED.ventana_inicio - make_interval(secs => $3)
                    THEN 1
                    ELSE limite_envio_otp.envios + 1 END
            WHERE limite_envio_otp.ventana_inicio <= EXCLUDED.ventana_inicio - make_interval(secs => $3)
               OR limite_envio_otp.envios < $4
        RETURNING clave`,
      [`ip:${ip}`, ahora, ventanaIpSegundos, maximoPorIp],
    );
    if (porIp.rowCount === 0) {
      // Se superó el máximo de la IP: se revierte también el envío que se contó para la cuenta.
      await client.query("ROLLBACK");
      return { permitido: false, motivo: "ip" };
    }

    // Ambos límites se cumplen: se confirma el registro.
    await client.query("COMMIT");
    return { permitido: true };
  } catch (error) {
    // Cualquier error deshace la transacción y se propaga.
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
