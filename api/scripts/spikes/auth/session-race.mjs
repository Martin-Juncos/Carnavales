// Spike: ¿deja una sola sesión activa tras dos verificaciones OTP simultáneas?
// Uso: DATABASE_URL=... node scripts/spikes/auth/session-race.mjs <none|hook> <iteraciones>
import { betterAuth } from "better-auth";
import pg from "pg";
import { createAuthOptions } from "./auth.config.js";

const [mode = "none", iterationsArg = "20"] = process.argv.slice(2);
const iterations = Number(iterationsArg);
const databaseUrl = process.env.DATABASE_URL;
const EMAIL = "spike-jurado@example.test";
const PASSWORD = "spike-password-123";
const pool = new pg.Pool({ connectionString: databaseUrl });

globalThis.__otp = {};

function baseOptions({ allowSignUp }) {
  const opts = createAuthOptions({ databaseUrl });
  opts.emailAndPassword.disableSignUp = !allowSignUp;
  if (mode === "hook") {
    opts.databaseHooks = {
      session: {
        create: {
          after: async (session) => {
            await pool.query("delete from sesion where usuario_id = $1 and id <> $2", [
              session.userId,
              session.id,
            ]);
          },
        },
      },
    };
  }
  return opts;
}

const setupAuth = betterAuth(baseOptions({ allowSignUp: true }));
const auth = betterAuth(baseOptions({ allowSignUp: false }));

// Preparación: usuario con 2FA activo, como lo dejaría la aceptación de invitación.
await pool.query("truncate usuario cascade");
await setupAuth.api.signUpEmail({ body: { name: "Spike", email: EMAIL, password: PASSWORD } });
await pool.query("update usuario set doble_factor_habilitado = true where correo = $1", [EMAIL]);
const [{ id: userId }] = (await pool.query("select id from usuario where correo = $1", [EMAIL])).rows;

const cookieFrom = (headers) =>
  (headers.getSetCookie?.() ?? [headers.get("set-cookie")])
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");

const counts = {};
const successes = {};
let errors = 0;

for (let i = 0; i < iterations; i++) {
  const { headers: signInHeaders } = await auth.api.signInEmail({
    body: { email: EMAIL, password: PASSWORD },
    returnHeaders: true,
  });
  const challengeCookie = cookieFrom(signInHeaders);

  await auth.api.sendTwoFactorOTP({ headers: new Headers({ cookie: challengeCookie }), body: {} });
  const code = globalThis.__otp[EMAIL];

  // Dos verificaciones con el mismo código, a la vez.
  const attempt = () =>
    auth.api
      .verifyTwoFactorOTP({
        headers: new Headers({ cookie: challengeCookie }),
        body: { code, trustDevice: false },
        returnHeaders: true,
      })
      .then(() => "ok")
      .catch(() => "rejected");
  const results = await Promise.all([attempt(), attempt()]);
  if (results.some((r) => r === "ok") === false) errors++;
  const okCount = results.filter((r) => r === "ok").length;
  successes[okCount] = (successes[okCount] ?? 0) + 1;

  const { rows } = await pool.query("select count(*)::int as n from sesion where usuario_id = $1", [userId]);
  counts[rows[0].n] = (counts[rows[0].n] ?? 0) + 1;
}

console.log(JSON.stringify({ mode, iterations, sessionsAfterEachIteration_histogram: counts, iterationsWithNoSuccess: errors, successfulVerificationsPerIteration_histogram: successes }));
await pool.end();
process.exit(0);
