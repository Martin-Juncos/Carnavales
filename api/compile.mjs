import { getMigrations } from "better-auth/db/migration";
import { createAuthOptions } from "./auth.config.js";
const plan = await getMigrations(createAuthOptions({ databaseUrl: process.env.DATABASE_URL }), { throwOnUnsafe: false });
console.error("schemaProblems:", JSON.stringify(plan.schemaProblems));
console.error("unsafeChanges:", JSON.stringify(plan.unsafeChanges));
process.stdout.write(await plan.compileMigrations());
process.exit(0);
