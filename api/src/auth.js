import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";

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
          sendOTP: async ({ user, otp }) => sendOTP({ user, otp }),
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
