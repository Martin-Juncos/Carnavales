import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import { contextoPeticion } from "./contexto-peticion.js";
import { registrarEnvioOtp } from "./limite-envio-otp.js";

const rutaEnvioOtp = "/two-factor/send-otp";

// Usuario al que pertenece el desafío de segundo factor, leído igual que lo hace Better Auth.
async function usuarioDelDesafio(ctx) {
  const cookie = ctx.context.createAuthCookie("two_factor");
  const firmada = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
  if (!firmada) return null;
  const verificacion = await ctx.context.internalAdapter.findVerificationValue(firmada);
  return verificacion?.value ?? null;
}

// Por ahora el envío real de correos no está implementado.
// Por defecto el OTP falla de forma explícita; nunca se registra el código en consola.
async function sinEntregaConfigurada() {
  throw new Error("La entrega de correos no está configurada.");
}

// Configuración de Better Auth del proyecto.
// allowSignUp solo lo usa el comando de bootstrap; en la aplicación el registro público queda cerrado.
export function createAuth({
  pool,
  secret,
  baseUrl,
  allowSignUp = false,
  sendOTP = sinEntregaConfigurada,
}) {
  return betterAuth({
    hooks: {
      // Antes de enviar: aplica la espera por cuenta y el límite por IP. Si no se cumplen, no se envía nada.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== rutaEnvioOtp) return;
        const usuarioId = await usuarioDelDesafio(ctx);
        if (!usuarioId) return; // Better Auth rechaza el desafío inválido.

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
      // Después de enviar: si la entrega falló, se responde error genérico. El detalle queda fuera de la respuesta.
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
      // Criterio del diseño: 12 horas sin actividad, renovación cada 10 minutos.
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 10,
    },
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

    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignUp,
      // La aceptación de una invitación no inicia sesión: primero viene el segundo factor.
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
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
      twoFactor({
        twoFactorTable: "doble_factor",
        otpOptions: {
          storeOTP: "encrypted",
          digits: 6,
          period: 3 * 60,
          allowedAttempts: 5,
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
