// Spike: configuración de Better Auth 1.7.22 con los mapeos en español del diseño.
// Desechable. Sirve para comprobar el esquema generado y los hooks del OTP.
import pg from "pg";
import { twoFactor } from "better-auth/plugins/two-factor";

export const SPIKE_BASE_URL = "http://localhost:3000";

export function createAuthOptions({ databaseUrl }) {
  return {
    baseURL: SPIKE_BASE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: new pg.Pool({ connectionString: databaseUrl }),

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
      revokeSessionsOnPasswordReset: true,
      // El diseño desactiva el registro público; las cuentas se crean por invitación.
      disableSignUp: true,
    },

    plugins: [
      twoFactorPlugin(),
    ],
  };
}

function twoFactorPlugin() {
  return twoFactor({
    twoFactorTable: "doble_factor",
    otpOptions: {
      storeOTP: "encrypted",
      digits: 6,
      period: 3 * 60,
      allowedAttempts: 5,
      sendOTP: async ({ user, otp }) => {
        // Spike: solo imprime. El envoltorio real espera el resultado del envío.
        console.log(`[spike-otp] ${user.email} -> ${otp}`); globalThis.__otp = { ...(globalThis.__otp ?? {}), [user.email]: otp };
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
  });
}
