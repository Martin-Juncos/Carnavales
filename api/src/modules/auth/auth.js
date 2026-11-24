import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { contextoPeticion } from "../../http/contexto-peticion.js";
import { registrarEnvioOtp } from "./limite-envio-otp.js";

// Ruta interna de Better Auth que envía el código OTP del segundo factor.
const rutaEnvioOtp = "/two-factor/send-otp";

// Devuelve el id del usuario al que pertenece el desafío de segundo factor.
// Lee la cookie firmada `two_factor` del mismo modo que lo hace Better Auth.
async function usuarioDelDesafio(ctx) {
  const cookie = ctx.context.createAuthCookie("two_factor");
  const firmada = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!firmada) return null;
  const verificacion = await ctx.context.internalAdapter.findVerificationValue(firmada);
  return verificacion?.value ?? null;
}

// Envío por defecto del OTP: todavía no hay proveedor de correo, así que falla de forma explícita.
// Nunca se registra el código en consola.
async function sinEntregaConfigurada() {
  throw new Error("La entrega de correos no está configurada.");
}

// Crea la instancia de Better Auth del proyecto, con las tablas en español y las reglas del diseño.
// allowSignUp solo lo usa el comando de bootstrap y la aceptación de invitaciones; en la aplicación el registro público queda cerrado.
export function createAuth({
  pool,
  secret,
  baseUrl,
  allowSignUp = false,
  sendOTP = sinEntregaConfigurada,
  // Orígenes desde los que el navegador puede llamar a la autenticación (el cliente web en desarrollo).
  origenesConfiables = [],
  // Envía el enlace de recuperación de contraseña. Recibe { user, token }.
  enviarRecuperacion = sinEntregaConfigurada,
}) {
  return betterAuth({
    // Better Auth rechaza con 403 cualquier petición cuyo origen no esté aquí (además de baseUrl).
    trustedOrigins: origenesConfiables,
    hooks: {
      // Se ejecuta antes de cada petición. Solo actúa sobre el envío del OTP.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== rutaEnvioOtp) return;
        const usuarioId = await usuarioDelDesafio(ctx);
        if (!usuarioId) return; // Better Auth rechaza el desafío inválido.

        // Aplica la espera por cuenta y el límite por IP. Si no se cumplen, no se envía nada.
        const { ip } = contextoPeticion.getStore() ?? { ip: "desconocida" };
        const resultado = await registrarEnvioOtp(pool, { usuarioId, ip });
        if (!resultado.permitido) {
          throw APIError.from("TOO_MANY_REQUESTS", {
            message:
              resultado.motivo === "cuenta"
                ? "Esperá 30 segundos antes de pedir otro código."
                : "Demasiadas solicitudes desde esta conexión. Intentá más tarde.",
            code: "LIMITE_ENVIO_OTP",
          });
        }
      }),
      // Se ejecuta después de cada petición. Si la entrega del OTP falló, responde un error genérico.
      // El detalle del fallo queda fuera de la respuesta.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== rutaEnvioOtp) return;
        if (contextoPeticion.getStore()?.entregaFallida) {
          throw APIError.from("SERVICE_UNAVAILABLE", {
            message: "No se pudo enviar el código. Intentá de nuevo más tarde.",
            code: "ENTREGA_OTP_FALLIDA",
          });
        }
      }),
    },

    baseURL: baseUrl,
    secret,
    database: pool,

    // Mapeo de la tabla de usuarios: los nombres de Better Auth se traducen a columnas en español.
    user: {
      modelName: "usuario",
      fields: {
        name: "nombre",
        email: "correo",
        emailVerified: "correo_verificado",
        image: "imagen_perfil",
        createdAt: "creado_en",
        updatedAt: "actualizado_en",
      },
    },
    // Mapeo de cuentas (credenciales e identidades de proveedor).
    account: {
      modelName: "cuenta",
      fields: {
        accountId: "id_cuenta",
        providerId: "id_proveedor",
        userId: "usuario_id",
        accessToken: "token_acceso",
        refreshToken: "token_actualizacion",
        idToken: "id_token",
        accessTokenExpiresAt: "token_acceso_vence_en",
        refreshTokenExpiresAt: "token_actualizacion_vence_en",
        scope: "alcance",
        password: "hash_contrasena",
        createdAt: "creado_en",
        updatedAt: "actualizado_en",
      },
    },
    // Mapeo de sesiones y duración de cada sesión.
    session: {
      modelName: "sesion",
      fields: {
        expiresAt: "vence_en",
        token: "token",
        createdAt: "creado_en",
        updatedAt: "actualizado_en",
        ipAddress: "direccion_ip",
        userAgent: "agente_usuario",
        userId: "usuario_id",
      },
      // Criterio del diseño: 12 horas sin actividad (expiresIn) y renovación de la fecha cada 10 minutos (updateAge).
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 10,
    },
    // Mapeo de la tabla de verificaciones temporales (por ejemplo, desafíos del segundo factor).
    verification: {
      modelName: "verificacion",
      fields: {
        identifier: "identificador",
        value: "valor",
        expiresAt: "vence_en",
        createdAt: "creado_en",
        updatedAt: "actualizado_en",
      },
    },

    // Acceso con correo y contraseña.
    emailAndPassword: {
      enabled: true,
      // Con allowSignUp en false, nadie puede registrarse por su cuenta.
      disableSignUp: !allowSignUp,
      // La aceptación de una invitación no inicia sesión: primero viene el segundo factor.
      autoSignIn: false,
      // Al cambiar la contraseña por recuperación, se cierran todas las sesiones abiertas.
      revokeSessionsOnPasswordReset: true,
      // El enlace de recuperación vence a los 60 minutos.
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, token }) => enviarRecuperacion({ user, token }),
    },

    databaseHooks: {
      session: {
        create: {
          // Una sola sesión por cuenta: al crear una nueva, se eliminan las demás de ese usuario.
          after: async (session) => {
            await pool.query("DELETE FROM sesion WHERE usuario_id = $1 AND id <> $2", [
              session.userId,
              session.id,
            ]);
          },
        },
      },
    },

    plugins: [
      // Segundo factor por código OTP enviado al correo.
      twoFactor({
        // Tabla física donde se guardan los datos del segundo factor.
        twoFactorTable: "doble_factor",
        otpOptions: {
          // El código se guarda cifrado, no en texto claro.
          storeOTP: "encrypted",
          digits: 6,
          // Vence a los 3 minutos (180 segundos).
          period: 3 * 60,
          // Después de 5 intentos fallidos el código deja de servir.
          allowedAttempts: 5,
          // Envía el código usando la función recibida; si falla, marca la petición para responder error.
          sendOTP: async ({ user, otp }) => {
            try {
              await sendOTP({ user, otp });
            } catch (error) {
              // Better Auth registra el error y responde éxito; la marca permite responder error después.
              const peticion = contextoPeticion.getStore();
              if (peticion) peticion.entregaFallida = true;
              throw error;
            }
          },
        },
        // Nombres de columnas en español para los campos del segundo factor y del usuario.
        schema: {
          user: {
            fields: { twoFactorEnabled: "doble_factor_habilitado" },
          },
          twoFactor: {
            fields: {
              secret: "secreto",
              backupCodes: "codigos_respaldo",
              userId: "usuario_id",
              verified: "verificado",
              failedVerificationCount: "intentos_fallidos",
              lockedUntil: "bloqueado_hasta",
            },
          },
        },
      }),
    ],
  });
}
